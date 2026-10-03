#!/usr/bin/env bash
# Move this app from a Clerk development instance to a production instance.
# Dry-run is the default. Pass --apply to change Clerk or the database.
# Secrets are read with read -rs and are never accepted as arguments.

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  printf '%s\n' "refusing to run: execute this script so secrets stay out of the caller" >&2
  # return leaves a sourced shell; exit covers a shell that rejects return
  # shellcheck disable=SC2317
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail
if [[ "$-" == *x* ]]; then
  printf '%s\n' "refusing to run while command tracing is enabled" >&2
  exit 1
fi
set +x
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SQL_DIR="$SCRIPT_DIR/sql"
API="$SCRIPT_DIR/lib/clerk-api.ts"
SCHEMA_FILE="$REPO_ROOT/prisma/schema.prisma"
EXPECTED_SCHEMA_SHA=36736fadb532f028d9200f0c763f3436b5c6844128faf5a11635880c9c91aa6e
TOOL_PIN=bbf75584668e9f10a239b545adbce57e1308c974

TABLES=(
  business_settings
  clients
  contacts
  proposals
  proposal_revisions
  templates
  content_blocks
  proposal_events
)

APPLY=0
MODE=""
EXPORT=""
TOOL_DIR=""
WORKDIR="${HOME}/clerk-migration-private"
KEEP=""
ORPHANS_TO=""
REVERSE=0
LOG=""
TMP_FILES=""

pg_pw=""
clerk_key=""

on_exit() {
  pg_pw=""
  clerk_key=""
  unset PGPASSWORD CLERK_SECRET_KEY PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE PGSSLROOTCERT || true
  if [[ -n "${TMP_FILES:-}" ]]; then
    # shellcheck disable=SC2086
    rm -f $TMP_FILES || true
  fi
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

note() {
  printf '%s\n' "$*" >&2
  if [[ -n "${LOG:-}" ]]; then
    printf '%s\n' "$*" >> "$LOG"
  fi
}

die() {
  note "$*"
  exit 1
}

die_recheck() {
  note "the user-ID column list must be re-checked before it's run."
  exit 1
}

usage() {
  cat <<'EOF'
Usage: migrate.sh <mode> [options]

Dry-run is the default. Pass --apply to make changes.

Modes:
  preflight
  backup
  import --export <csv>
  build-map --export <csv>
  remap
  verify [--reverse]
  freeze-check
  revoke-dev-sessions
  demote-dev-admins --keep <user id>
  restore-dev-roles --export <csv>
  rollback [--orphans-to <dev id>]
  mark-cutover
  purge-export
  cleanup

Options:
  --apply
  --export <csv>         Clerk user export. The path must be inside the workdir.
  --tool-dir <dir>       Checkout of clerk/migration-tool at the pinned commit.
  --workdir <dir>        Private folder (default: ~/clerk-migration-private).
  --keep <user id>       Dev admin who stays an admin.
  --orphans-to <dev id>  Dev user who receives rows created after cutover.
  --reverse              verify the rolled-back direction.

Connection settings (PGHOST, PGPORT, PGUSER, PGDATABASE) come from the
environment or a prompt. The password comes from read -rs, or from ~/.pgpass
when that file is mode 0600. SSL uses require, or verify-full when
PGSSLMODE=verify-full and PGSSLROOTCERT points at a CA file.

Before --apply changes the database, the script prints the host, the database
name, the eight table counts and the business name, then asks you to type the
Supabase project ref. On db.<ref>.supabase.co the ref is in the host. On a
*.pooler.supabase.com host the ref is the username postgres.<ref>; the script
stops if that ref cannot be read. Any other host asks for the database name.
Before --apply changes Clerk, it prints the user count and the first three
emails, then asks you to type the user count. Import refuses when the
production instance already has a user with no externalId.

mark-cutover --apply requires freeze-start to exist and be earlier than now,
a passing forward verify, and the word cutover typed back. It will not replace
a stamp. To correct one, delete the cutover file and run mark-cutover --apply
again.

Freeze notes:
  backup --apply writes freeze-start in UTC.
  Remap and rollback lock eight tables. Each lock can wait up to 10 seconds,
  so the worst case is about 80 seconds. Reads keep working while writes wait.
  mark-cutover records when the pk_live_ Production deployment goes live.
  purge-export deletes the user export, which holds password hashes, once 24
  hours have passed after that cutover. It refuses to run when cutover is
  missing. The dump and the generated CSVs stay until cleanup, which is
  allowed 14 days after the same cutover.
  Rollback is refused 24 hours after cutover, or after the first acceptance
  since cutover. Before cutover is recorded, that cutoff has not started.
EOF
}

contains_db_url() {
  local value=$1
  local short long
  short=$(printf '%s%s' 'post' 'gres://')
  long=$(printf '%s%s' 'postgresql' '://')
  [[ "$value" == *"$short"* || "$value" == *"$long"* ]]
}

for arg in "$@"; do
  if contains_db_url "$arg"; then
    printf '%s\n' "refusing an argument that contains a database URL" >&2
    exit 1
  fi
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --reverse) REVERSE=1 ;;
    --help|-h) usage; exit 0 ;;
    --export)
      [[ $# -ge 2 ]] || die "--export needs a path"
      EXPORT=$2
      shift
      ;;
    --tool-dir)
      [[ $# -ge 2 ]] || die "--tool-dir needs a path"
      TOOL_DIR=$2
      shift
      ;;
    --workdir)
      [[ $# -ge 2 ]] || die "--workdir needs a path"
      WORKDIR=$2
      shift
      ;;
    --keep)
      [[ $# -ge 2 ]] || die "--keep needs a user id"
      KEEP=$2
      shift
      ;;
    --orphans-to)
      [[ $# -ge 2 ]] || die "--orphans-to needs a user id"
      ORPHANS_TO=$2
      shift
      ;;
    --*) die "unknown option $1" ;;
    *)
      if [[ -z "$MODE" ]]; then
        MODE=$1
      else
        die "unexpected argument $1"
      fi
      ;;
  esac
  shift
done

[[ -n "$MODE" ]] || { usage; exit 1; }

prepare_workdir() {
  local parent parent_real base abs lower mode created=0
  if contains_db_url "$WORKDIR"; then
    die "refusing a database URL as the workdir"
  fi
  parent=$(dirname "$WORKDIR")
  [[ -d "$parent" ]] || die "the workdir parent does not exist"
  parent_real=$(realpath "$parent")
  base=$(basename "$WORKDIR")
  abs="${parent_real}/${base}"
  lower=$(printf '%s' "$abs" | tr '[:upper:]' '[:lower:]')
  if [[ "$lower" == *dropbox* || "$lower" == *icloud* || "$lower" == *onedrive* || "$lower" == *"google drive"* || "$lower" == *googledrive* || "$lower" == *"mobile documents"* || "$lower" == *cloudstorage* ]]; then
    die "refusing a workdir under a cloud-sync folder"
  fi
  refuse_synced_home "$abs"
  if git -C "$parent_real" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    die "refusing a workdir inside a git repository"
  fi
  if [[ -d "$abs" ]] && git -C "$abs" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    die "refusing a workdir inside a git repository"
  fi
  if [[ ! -d "$abs" ]]; then
    mkdir -m 0700 "$abs"
    created=1
  fi
  WORKDIR=$(realpath "$abs")
  mode=$(file_mode "$WORKDIR")
  if [[ "$mode" != "700" ]]; then
    if [[ "$created" -eq 1 ]]; then
      rmdir "$WORKDIR" || true
    fi
    die "workdir must be mode 0700"
  fi
  mkdir -p "$WORKDIR/logs"
  chmod 700 "$WORKDIR/logs"
  LOG="$WORKDIR/logs/${MODE}-$(TZ=Australia/Melbourne date +%Y%m%dT%H%M%S).log"
  : > "$LOG"
  chmod 600 "$LOG"
  note "mode ${MODE} apply=${APPLY}"
  note "log ${LOG}"
}

require_export() {
  local export_real work_real rel
  [[ -n "$EXPORT" ]] || die "--export is required"
  [[ -f "$EXPORT" ]] || die "export file is missing"
  work_real=$(realpath "$WORKDIR")
  export_real=$(realpath "$EXPORT")
  case "$export_real" in
    "$work_real"/*) ;;
    *) die "export must be inside the workdir" ;;
  esac
  rel=${export_real#"$work_real"/}
  case "$rel" in
    dev_users.csv|prod_users.csv|backup.dump|FREEZE-NOTES.txt|freeze-start|cutover|export-record)
      die "export must be the Clerk user export"
      ;;
  esac
  EXPORT=$export_real
  touch "$WORKDIR/export-record"
  chmod 600 "$WORKDIR/export-record"
  printf '%s\n' "$rel" >> "$WORKDIR/export-record"
  sort -u "$WORKDIR/export-record" -o "$WORKDIR/export-record"
  note "export ${rel}"
}

refuse_synced_home() {
  local abs=$1 name resolved
  for name in Desktop Documents; do
    if [[ -d "$HOME/$name" || -L "$HOME/$name" ]]; then
      resolved=$(realpath "$HOME/$name")
      case "$abs" in
        "$resolved"|"$resolved"/*)
          die "refusing a workdir under ${name} because iCloud can sync it"
          ;;
      esac
    fi
  done
}

tool_status() {
  env -u CLERK_SECRET_KEY -u PGPASSWORD git -C "$TOOL_DIR" status --porcelain --ignored -- . ':(exclude)node_modules'
}

require_clean_tool() {
  local dirty
  dirty=$(tool_status)
  if [[ -n "$dirty" ]]; then
    printf '%s\n' "$dirty" >&2
    die "migration tool working tree is not clean"
  fi
}

require_tool() {
  local head
  [[ -n "$TOOL_DIR" ]] || die "--tool-dir is required"
  [[ -d "$TOOL_DIR" ]] || die "tool dir is missing"
  if [[ -e "$TOOL_DIR/.env" ]]; then
    die "refusing to run while the tool directory contains a .env file"
  fi
  head=$(env -u CLERK_SECRET_KEY -u PGPASSWORD git -C "$TOOL_DIR" rev-parse HEAD)
  [[ "$head" == "$TOOL_PIN" ]] || die "migration tool is not at the pinned commit ${TOOL_PIN}"
  require_clean_tool
  note "migration tool ${head}"
}

install_tool() {
  note "bun install --frozen-lockfile"
  (
    cd "$TOOL_DIR"
    env -u PGPASSWORD -u CLERK_SECRET_KEY HUSKY=0 bun install --frozen-lockfile
  ) 2>&1 | tee -a "$LOG" >&2
  require_clean_tool
}

bun_at_least() {
  local version major rest minor
  version=$(bun --version)
  major=${version%%.*}
  rest=${version#*.}
  minor=${rest%%.*}
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major > 1 || (major == 1 && minor >= 1) ))
}

client_major() {
  local line num
  line=$("$1" --version)
  num=$(printf '%s\n' "$line" | sed -n 's/.*PostgreSQL) \([0-9][0-9]*\)\..*/\1/p')
  [[ -n "$num" ]] || die "could not read the version of $1"
  printf '%s' "$num"
}

prompt_plain() {
  local var=$1 text=$2 value=""
  if [[ -n "${!var:-}" ]]; then
    return
  fi
  [[ -r /dev/tty ]] || die "a terminal is required to enter ${var}"
  read -r -p "${text}: " value </dev/tty
  printf -v "$var" '%s' "$value"
}

prompt_secret() {
  local var=$1 text=$2 value=""
  [[ -r /dev/tty ]] || die "a terminal is required to enter secrets"
  read -rsr -p "${text}: " value </dev/tty
  printf '\n' >&2
  printf -v "$var" '%s' "$value"
  value=""
}

configure_ssl() {
  if [[ "${PGSSLMODE:-}" == "verify-full" && -n "${PGSSLROOTCERT:-}" && -f "$PGSSLROOTCERT" ]]; then
    export PGSSLMODE=verify-full
    export PGSSLROOTCERT
    note "SSL mode verify-full"
    return
  fi
  if [[ "${PGSSLMODE:-}" == "verify-full" ]]; then
    note "verify-full needs PGSSLROOTCERT to be a CA file; using require"
  fi
  export PGSSLMODE=require
  unset PGSSLROOTCERT || true
}

prepare_db() {
  local mode passfile
  unset PGPASSWORD || true
  configure_ssl
  prompt_plain PGHOST "Postgres host"
  prompt_plain PGPORT "Postgres port"
  prompt_plain PGUSER "Postgres user"
  prompt_plain PGDATABASE "Postgres database"
  export PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE
  if contains_db_url "${PGHOST}" || contains_db_url "${PGPORT}" || contains_db_url "${PGDATABASE}"; then
    die "refusing a database URL in the connection settings"
  fi
  if [[ "$PGPORT" == "6543" ]]; then
    die "refusing the transaction pooler port"
  fi
  pg_pw=""
  passfile="${HOME}/.pgpass"
  if [[ -f "$passfile" ]]; then
    mode=$(file_mode "$passfile")
    if [[ "$mode" != "600" ]]; then
      die "refusing ~/.pgpass because it is not mode 0600"
    fi
    note "using ~/.pgpass"
    return
  fi
  if env -u PGPASSWORD -u CLERK_SECRET_KEY psql -X -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    note "database connection accepted"
    return
  fi
  prompt_secret pg_pw "Postgres password"
  run_psql -c 'SELECT 1' >/dev/null
  note "database connection accepted"
}

run_psql() {
  if [[ -n "$pg_pw" ]]; then
    (
      unset CLERK_SECRET_KEY
      PGPASSWORD="$pg_pw" exec psql -X -v ON_ERROR_STOP=1 "$@"
    )
  else
    env -u CLERK_SECRET_KEY -u PGPASSWORD psql -X -v ON_ERROR_STOP=1 "$@"
  fi
}

run_pg_dump() {
  if [[ -n "$pg_pw" ]]; then
    (
      unset CLERK_SECRET_KEY
      PGPASSWORD="$pg_pw" exec pg_dump "$@"
    )
  else
    env -u CLERK_SECRET_KEY -u PGPASSWORD pg_dump "$@"
  fi
}

psql_value() {
  run_psql -tA "$@"
}

run_sql() {
  local sql=$1
  shift
  local tmp out status
  tmp=$(mktemp "$WORKDIR/sql.XXXXXX")
  out=$(mktemp "$WORKDIR/psql.XXXXXX")
  TMP_FILES="${TMP_FILES} ${tmp} ${out}"
  printf '%s\n' "$sql" > "$tmp"
  set +e
  run_psql "$@" -f "$tmp" >"$out" 2>&1
  status=$?
  set -e
  tee -a "$LOG" < "$out" >&2
  return "$status"
}

check_client_versions() {
  local server server_major bin major
  server=$(psql_value -c "SHOW server_version_num")
  server_major=$((server / 10000))
  for bin in psql pg_dump pg_restore; do
    major=$(client_major "$bin")
    if (( major < server_major )); then
      die "${bin} major ${major} is older than the server major ${server_major}"
    fi
    note "${bin} major ${major}"
  done
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%OLp' "$1"
  fi
}

epoch_of() {
  if date -u -d "$1" +%s >/dev/null 2>&1; then
    date -u -d "$1" +%s
  else
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s
  fi
}

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

schema_file_guard() {
  local hash
  [[ -f "$SCHEMA_FILE" ]] || { note "schema guard: prisma/schema.prisma is missing"; die_recheck; }
  hash=$(file_sha256 "$SCHEMA_FILE")
  if [[ "$hash" != "$EXPECTED_SCHEMA_SHA" ]]; then
    note "schema guard: prisma/schema.prisma does not match commit 9acabc8"
    die_recheck
  fi
}

schema_db_guard() {
  if ! run_sql "SELECT clerk_migration.check_schema();"; then
    note "schema guard: check_schema failed"
    die_recheck
  fi
  note "schema guard passed"
}

schema_guard() {
  schema_file_guard
  schema_db_guard
}

require_clerk_key() {
  local prefix=$1
  unset CLERK_SECRET_KEY || true
  clerk_key=""
  prompt_secret clerk_key "Clerk secret key"
  if [[ "$clerk_key" != "$prefix"* ]]; then
    clerk_key=""
    die "this mode requires a ${prefix} key"
  fi
}

bun_plain() {
  env -u PGPASSWORD -u CLERK_SECRET_KEY bun "$@"
}

bun_clerk() {
  (
    unset PGPASSWORD
    CLERK_SECRET_KEY="$clerk_key" exec bun "$@"
  )
}

show_database_target() {
  local db names
  db=$(psql_value -c "SELECT current_database()")
  names=$(psql_value -c "SELECT COALESCE(string_agg(DISTINCT business_name, ', ' ORDER BY business_name), '(none)') FROM public.business_settings WHERE coalesce(business_name, '') <> ''")
  note "database host ${PGHOST}"
  note "database name ${db}"
  note "business name ${names}"
  run_sql "$(row_count_sql)" || die "could not read table counts"
  printf '%s' "$db"
}

pooler_project_ref() {
  local user
  user=$(printf '%s' "$PGUSER" | tr '[:upper:]' '[:lower:]')
  if [[ "$user" =~ ^postgres\.([a-z0-9]+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

confirm_database_write() {
  local db expected prompt typed="" host
  (( APPLY )) || return 0
  db=$(show_database_target)
  host=$(printf '%s' "$PGHOST" | tr '[:upper:]' '[:lower:]')
  if [[ "$host" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then
    expected=${BASH_REMATCH[1]}
    prompt="Type the Supabase project ref to confirm"
  elif [[ "$host" == *.pooler.supabase.com ]]; then
    expected=$(pooler_project_ref) || die "could not read the Supabase project ref from the pooler username postgres.<ref>"
    prompt="Type the Supabase project ref to confirm"
  else
    expected=$db
    prompt="Type the database name to confirm"
  fi
  [[ -r /dev/tty ]] || die "a terminal is required to confirm the database target"
  read -r -p "${prompt}: " typed </dev/tty
  if [[ "$typed" != "$expected" ]]; then
    die "database target was not confirmed; nothing was changed"
  fi
  note "database target confirmed"
}

clerk_instance_report() {
  local report status
  set +e
  report=$(bun_clerk "$API" describe-instance "$@")
  status=$?
  set -e
  printf '%s\n' "$report" | tee -a "$LOG" >&2
  [[ "$status" -eq 0 ]] || die "Clerk instance check failed"
  printf '%s' "$report"
}

confirm_clerk_write() {
  local report count typed=""
  report=$(clerk_instance_report "$@")
  (( APPLY )) || return 0
  count=$(printf '%s\n' "$report" | awk '/^users /{print $2; exit}')
  [[ -n "$count" ]] || die "could not read the Clerk user count"
  [[ -r /dev/tty ]] || die "a terminal is required to confirm the Clerk instance"
  read -r -p "Type the user count to confirm this Clerk instance: " typed </dev/tty
  if [[ "$typed" != "$count" ]]; then
    die "Clerk instance was not confirmed; nothing was changed"
  fi
  note "Clerk instance confirmed"
}

lock_note() {
  note "each of the eight table locks waits at most 10 seconds, so the worst case is about 80 seconds"
}

write_freeze_notes() {
  cat > "$WORKDIR/FREEZE-NOTES.txt" <<'EOF'
Freeze notes

backup --apply recorded freeze-start in UTC.
Remap and rollback lock the eight tables that store a Clerk user id.
Each lock can wait up to 10 seconds, so the worst case is about 80 seconds.
Reads keep working. Writes wait until the transaction ends.

mark-cutover records when the pk_live_ Production deployment goes live.
purge-export deletes the Clerk user export (it holds password hashes) once
24 hours have passed after that cutover. It refuses to run when cutover is
missing. The database dump and the generated dev_users.csv and prod_users.csv
stay until cleanup, which is allowed 14 days after the same cutover.
Rollback is refused 24 hours after cutover, or after the first acceptance
since cutover.
EOF
  chmod 600 "$WORKDIR/FREEZE-NOTES.txt"
}

row_count_sql() {
  local sql="" table
  for table in "${TABLES[@]}"; do
    if [[ -n "$sql" ]]; then
      sql="${sql} UNION ALL "
    fi
    sql="${sql}SELECT '${table}', count(*) FROM public.${table}"
  done
  printf '%s\n' "$sql"
}

seconds_since_stamp() {
  local file=$1 start now
  [[ -f "$file" ]] || return 1
  start=$(epoch_of "$(tr -d '[:space:]' < "$file")")
  now=$(date -u +%s)
  printf '%s' $((now - start))
}

read_cutover_stamp() {
  local start
  [[ -f "$WORKDIR/cutover" ]] || return 1
  start=$(tr -d '[:space:]' < "$WORKDIR/cutover")
  [[ "$start" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || die "cutover timestamp could not be read"
  printf '%s' "$start"
}

cutover_age_seconds() {
  read_cutover_stamp >/dev/null || die "cutover is missing; run mark-cutover --apply when the pk_live_ Production deployment goes live"
  seconds_since_stamp "$WORKDIR/cutover"
}

warn_missing_cutover() {
  local elapsed
  [[ -f "$WORKDIR/cutover" ]] && return 0
  [[ -f "$WORKDIR/freeze-start" ]] || return 0
  set +e
  elapsed=$(seconds_since_stamp "$WORKDIR/freeze-start")
  set -e
  if [[ -n "$elapsed" && "$elapsed" -ge $((6 * 3600)) ]]; then
    note "cutover is not recorded, and freeze-start was more than 6 hours ago; run mark-cutover when the pk_live_ Production deployment goes live"
  fi
}

rollback_cutoff() {
  local elapsed start count
  if [[ ! -f "$WORKDIR/cutover" ]]; then
    note "cutover is not recorded, so the rollback cutoff has not started"
    return 0
  fi
  start=$(read_cutover_stamp) || die "cutover timestamp could not be read"
  elapsed=$(seconds_since_stamp "$WORKDIR/cutover")
  if (( elapsed >= 86400 )); then
    die "refusing rollback 24 hours after cutover"
  fi
  count=$(psql_value -c "SELECT count(*) FROM public.proposal_events WHERE event_type = 'accepted' AND created_at >= (timestamptz '${start}' AT TIME ZONE 'UTC')")
  count=${count//[[:space:]]/}
  if [[ "$count" != "0" ]]; then
    die "refusing rollback after the first acceptance since cutover"
  fi
}

mode_preflight() {
  command -v bun >/dev/null 2>&1 || die "bun is not installed"
  command -v psql >/dev/null 2>&1 || die "psql is not installed"
  command -v pg_dump >/dev/null 2>&1 || die "pg_dump is not installed"
  command -v pg_restore >/dev/null 2>&1 || die "pg_restore is not installed"
  bun_at_least || die "bun 1.1 or newer is required"
  note "bun $(bun --version)"
  require_tool
  install_tool
  prepare_db
  check_client_versions
  schema_file_guard
  if ! run_sql "$(printf 'BEGIN;\n\\i %s\nSELECT clerk_migration.check_schema();\nROLLBACK;\n' "$SQL_DIR/02-functions.sql")"; then
    die_recheck
  fi
  note "schema guard passed"
  note "preflight loaded the functions inside a transaction and rolled them back"
  note "preflight writes nothing"
}

mode_backup() {
  prepare_db
  note "planned command: pg_dump -Fc -f ${WORKDIR}/backup.dump"
  note "planned check: pg_restore --list confirms TABLE DATA for all eight tables"
  run_sql "$(row_count_sql)"
  if (( APPLY )); then
    confirm_database_write
    run_pg_dump -Fc -f "$WORKDIR/backup.dump"
    chmod 600 "$WORKDIR/backup.dump"
    local list table
    list=$(env -u CLERK_SECRET_KEY -u PGPASSWORD pg_restore --list "$WORKDIR/backup.dump")
    for table in "${TABLES[@]}"; do
      if ! printf '%s\n' "$list" | grep -F -q "TABLE DATA public ${table}"; then
        die "dump is missing TABLE DATA for ${table}"
      fi
      note "dump has TABLE DATA for ${table}"
    done
    date -u +%Y-%m-%dT%H:%M:%SZ > "$WORKDIR/freeze-start"
    chmod 600 "$WORKDIR/freeze-start"
    write_freeze_notes
    note "wrote freeze-start $(cat "$WORKDIR/freeze-start")"
    lock_note
  else
    note "dry-run: dump was not written"
    lock_note
  fi
}

mode_import() {
  require_export
  require_clerk_key "sk_live_"
  confirm_clerk_write --require-external-id
  require_tool
  bun_plain "$API" summarize-export "$EXPORT" 2>&1 | tee -a "$LOG" >&2
  if (( APPLY )); then
    install_tool
    local status=0
    (
      cd "$TOOL_DIR"
      unset PGPASSWORD
      CLERK_SECRET_KEY="$clerk_key" exec bun migrate -y -t clerk -f "$EXPORT"
    ) 2>&1 | tee -a "$LOG" >&2 || status=$?
    if [[ -d "$TOOL_DIR/logs" ]]; then
      local dest
      dest="$WORKDIR/logs/migration-tool-$(TZ=Australia/Melbourne date +%Y%m%dT%H%M%S)"
      mv "$TOOL_DIR/logs" "$dest"
      note "moved tool logs to ${dest}"
    fi
    local dirty
    dirty=$(tool_status)
    if [[ -n "$dirty" ]]; then
      note "migration tool working tree changed during import"
      printf '%s\n' "$dirty" | tee -a "$LOG" >&2
      die "aborting because the tool directory is not clean"
    fi
    [[ "$status" -eq 0 ]] || die "import failed"
    note "import finished and the tool directory is clean"
  else
    note "dry-run: users were not imported"
  fi
}

mode_build_map() {
  require_export
  require_clerk_key "sk_live_"
  prepare_db
  bun_plain "$API" write-dev-users "$EXPORT" "$WORKDIR/dev_users.csv" 2>&1 | tee -a "$LOG" >&2
  bun_clerk "$API" write-prod-users "$WORKDIR/prod_users.csv" 2>&1 | tee -a "$LOG" >&2
  chmod 600 "$WORKDIR/dev_users.csv" "$WORKDIR/prod_users.csv"
  if (( APPLY )); then
    confirm_database_write
    (
      cd "$WORKDIR"
      run_psql --single-transaction -f "$SQL_DIR/01-build-map.sql"
    ) 2>&1 | tee -a "$LOG" >&2
    (
      cd "$WORKDIR"
      run_psql --single-transaction -f "$SQL_DIR/02-functions.sql"
    ) 2>&1 | tee -a "$LOG" >&2
    run_sql "SELECT count(*) AS map_size FROM clerk_migration.id_map;"
  else
    pushd "$WORKDIR" >/dev/null || die "could not enter the workdir"
    run_sql "$(printf 'BEGIN;\n\\i %s\n\\i %s\nSELECT count(*) AS map_size FROM clerk_migration.id_map;\nROLLBACK;\n' "$SQL_DIR/01-build-map.sql" "$SQL_DIR/02-functions.sql")"
    popd >/dev/null || true
    note "dry-run: map build was rolled back"
  fi
}

mode_remap() {
  prepare_db
  schema_guard
  local sql
  sql=$(cat <<'SQL'
SELECT direction, tbl, col, stage, src_rows, dst_rows, total_rows, deleted, real_settings
FROM clerk_migration.row_counts
WHERE run_at = (SELECT max(run_at) FROM clerk_migration.row_counts)
ORDER BY tbl, col, stage;
SQL
)
  if (( APPLY )); then
    confirm_database_write
    run_sql "$(printf '%s\n%s\n' "SELECT clerk_migration.remap('forward');" "$sql")"
  else
    run_sql "$(printf '%s\n%s\n%s\n%s\n' "BEGIN;" "SELECT clerk_migration.remap('forward');" "$sql" "ROLLBACK;")"
    note "dry-run: remap was rolled back"
  fi
  lock_note
}

mode_verify() {
  local direction=forward
  prepare_db
  warn_missing_cutover
  if (( REVERSE )); then
    direction=reverse
  fi
  run_sql "SELECT clerk_migration.verify('${direction}');"
  note "verify is read-only"
}

mode_freeze_check() {
  local start elapsed
  prepare_db
  [[ -f "$WORKDIR/freeze-start" ]] || die "freeze-start is missing; run backup --apply first"
  start=$(tr -d '[:space:]' < "$WORKDIR/freeze-start")
  run_sql "$(cat <<'SQL'
SELECT p.id AS proposal, p.title,
       to_char((e.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Australia/Melbourne',
               'YYYY-MM-DD HH24:MI:SS') AS melbourne_time
FROM proposal_events e
JOIN proposals p ON p.id = e.proposal_id
WHERE e.event_type = 'accepted'
  AND e.created_at >= (:'freeze_start'::timestamptz AT TIME ZONE 'UTC')
ORDER BY e.created_at;
SQL
)" -v "freeze_start=${start}"
  warn_missing_cutover
  lock_note
  if [[ -f "$WORKDIR/export-record" && -f "$WORKDIR/cutover" ]]; then
    elapsed=$(seconds_since_stamp "$WORKDIR/cutover" || true)
    if [[ -n "$elapsed" && "$elapsed" -ge 86400 ]]; then
      note "the user export is past the 24 hour cutoff; run purge-export"
    fi
  fi
}

mode_revoke_sessions() {
  require_clerk_key "sk_test_"
  if (( APPLY )); then
    confirm_clerk_write
    bun_clerk "$API" revoke-sessions 2>&1 | tee -a "$LOG" >&2
  else
    bun_clerk "$API" list-sessions 2>&1 | tee -a "$LOG" >&2
    note "dry-run: sessions were not revoked"
  fi
}

mode_demote() {
  [[ -n "$KEEP" ]] || die "--keep is required"
  require_clerk_key "sk_test_"
  if (( APPLY )); then
    confirm_clerk_write
    bun_clerk "$API" demote-apply "$KEEP" 2>&1 | tee -a "$LOG" >&2
  else
    bun_clerk "$API" demote-plan "$KEEP" 2>&1 | tee -a "$LOG" >&2
    note "dry-run: roles were not changed"
  fi
}

mode_restore() {
  require_export
  require_clerk_key "sk_test_"
  if (( APPLY )); then
    confirm_clerk_write
    bun_clerk "$API" restore-apply "$EXPORT" 2>&1 | tee -a "$LOG" >&2
  else
    bun_clerk "$API" restore-plan "$EXPORT" 2>&1 | tee -a "$LOG" >&2
    note "dry-run: roles were not changed"
  fi
}

mode_rollback() {
  require_clerk_key "sk_live_"
  prepare_db
  rollback_cutoff
  schema_guard
  bun_clerk "$API" list-unmapped-users 2>&1 | tee -a "$LOG" >&2
  bun_clerk "$API" list-pending-invitations 2>&1 | tee -a "$LOG" >&2
  local show trial
  show=$(cat <<'SQL'
SELECT tbl, col, row_id, from_id, to_id
FROM clerk_migration.orphans
WHERE run_at = (SELECT max(run_at) FROM clerk_migration.orphans)
ORDER BY tbl, row_id;
SQL
)
  trial="$(printf '%s\n%s\n%s\n%s\n' "BEGIN;" "SELECT clerk_migration.remap('reverse', orphans_to => NULLIF(:'orphans_to', ''));" "$show" "ROLLBACK;")"
  if (( APPLY )); then
    confirm_database_write
    confirm_clerk_write
    if ! run_sql "$trial" -v "orphans_to=${ORPHANS_TO}"; then
      die "reverse remap check failed; production invitations were not revoked"
    fi
    bun_clerk "$API" revoke-pending-invitations 2>&1 | tee -a "$LOG" >&2
    run_sql "$(printf '%s\n%s\n' "SELECT clerk_migration.remap('reverse', orphans_to => NULLIF(:'orphans_to', ''));" "$show")" -v "orphans_to=${ORPHANS_TO}"
  else
    run_sql "$trial" -v "orphans_to=${ORPHANS_TO}"
    note "dry-run: rollback was rolled back and invitations were not revoked"
  fi
  lock_note
}

mode_mark_cutover() {
  local stamp freeze freeze_epoch now typed=""
  stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  note "cutover is the moment the pk_live_ Production deployment goes live"
  if [[ -f "$WORKDIR/cutover" ]]; then
    note "cutover is already recorded: $(tr -d '[:space:]' < "$WORKDIR/cutover")"
    if (( APPLY )); then
      die "refusing to replace a recorded cutover"
    fi
    note "to correct it, delete the cutover file and run mark-cutover --apply again"
    return 0
  fi
  if (( APPLY )); then
    [[ -f "$WORKDIR/freeze-start" ]] || die "freeze-start is missing; run backup --apply first"
    freeze=$(tr -d '[:space:]' < "$WORKDIR/freeze-start")
    [[ "$freeze" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || die "freeze-start timestamp could not be read"
    freeze_epoch=$(epoch_of "$freeze")
    now=$(date -u +%s)
    if (( freeze_epoch >= now )); then
      die "freeze-start must be earlier than now"
    fi
    note "freeze-start ${freeze}"
    prepare_db
    if ! run_sql "SELECT clerk_migration.verify('forward');"; then
      die "forward verify failed; cutover was not recorded"
    fi
    note "forward verify passed"
    [[ -r /dev/tty ]] || die "a terminal is required to confirm cutover"
    read -r -p "Type cutover to confirm the pk_live_ Production deployment is live: " typed </dev/tty
    if [[ "$typed" != "cutover" ]]; then
      die "cutover was not confirmed; nothing was recorded"
    fi
    printf '%s\n' "$stamp" > "$WORKDIR/cutover"
    chmod 600 "$WORKDIR/cutover"
    note "wrote cutover ${stamp}"
  else
    note "would record cutover ${stamp}"
  fi
}

mode_purge_export() {
  local elapsed rel path real
  [[ -f "$WORKDIR/export-record" ]] || die "no export has been recorded"
  elapsed=$(cutover_age_seconds)
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    path="${WORKDIR}/${rel}"
    real=$(realpath "$path" 2>/dev/null || printf '%s' "$path")
    case "$real" in
      "$WORKDIR"/*) ;;
      *) die "refusing to delete a path outside the workdir" ;;
    esac
    if (( elapsed >= 86400 )); then
      if (( APPLY )); then
        rm -f "$path"
        note "deleted export ${rel}"
      else
        note "would delete export ${rel}"
      fi
    else
      note "keeping export ${rel} until 24 hours after cutover"
      if (( APPLY )); then
        die "refusing to delete the export before the 24 hour cutoff"
      fi
    fi
  done < "$WORKDIR/export-record"
  note "the dump and the generated csv files stay until day 14"
}

mode_cleanup() {
  local elapsed target
  prepare_db
  elapsed=$(cutover_age_seconds)
  note "would drop schema clerk_migration"
  note "would delete workdir ${WORKDIR}"
  if [[ -f "$WORKDIR/backup.dump" ]]; then
    note "dump backup.dump is removed only by this cleanup"
  fi
  if (( elapsed < 14 * 86400 )); then
    note "cleanup is allowed 14 days after cutover"
    if (( APPLY )); then
      die "refusing cleanup before day 14"
    fi
    return
  fi
  if (( APPLY )); then
    confirm_database_write
    run_sql "DROP SCHEMA IF EXISTS clerk_migration CASCADE;"
    target=$(realpath "$WORKDIR")
    [[ "$target" != "/" && "$target" != "$HOME" ]] || die "refusing to delete this directory"
    note "deleted workdir ${target}"
    LOG=""
    rm -rf "$target"
  fi
}

case "$MODE" in
  preflight|backup|import|build-map|remap|verify|freeze-check|revoke-dev-sessions|demote-dev-admins|restore-dev-roles|rollback|mark-cutover|purge-export|cleanup) ;;
  *) die "unknown mode ${MODE}" ;;
esac
if (( REVERSE )) && [[ "$MODE" != "verify" ]]; then
  die "--reverse is only valid for verify"
fi
if [[ -n "$ORPHANS_TO" && "$MODE" != "rollback" ]]; then
  die "--orphans-to is only valid for rollback"
fi
if [[ -n "$KEEP" && "$MODE" != "demote-dev-admins" ]]; then
  die "--keep is only valid for demote-dev-admins"
fi

prepare_workdir

case "$MODE" in
  preflight) mode_preflight ;;
  backup) mode_backup ;;
  import) mode_import ;;
  build-map) mode_build_map ;;
  remap) mode_remap ;;
  verify) mode_verify ;;
  freeze-check) mode_freeze_check ;;
  revoke-dev-sessions) mode_revoke_sessions ;;
  demote-dev-admins) mode_demote ;;
  restore-dev-roles) mode_restore ;;
  rollback) mode_rollback ;;
  mark-cutover) mode_mark_cutover ;;
  purge-export) mode_purge_export ;;
  cleanup) mode_cleanup ;;
  *) die "unknown mode ${MODE}" ;;
esac
