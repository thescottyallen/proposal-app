#!/usr/bin/env bash
# Guards for migrate.sh: sourced execution, export path, schema hash, migration
# list, and which secrets reach child processes.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
REPO=$(cd "$ROOT/../.." && pwd)
SCRIPT="$ROOT/migrate.sh"
if [[ -n "${PGBIN:-}" ]]; then
  BIN=$PGBIN
elif [[ -x /usr/lib/postgresql/17/bin/initdb ]]; then
  BIN=/usr/lib/postgresql/17/bin
elif [[ -x /usr/lib/postgresql/16/bin/initdb ]]; then
  BIN=/usr/lib/postgresql/16/bin
else
  BIN=$(dirname "$(command -v initdb)")
fi

PASS=0
FAIL=0
ok() { echo "PASS  $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "== sourced script"
set +e
source_out=$(bash -c 'set -e; source "$1"; echo CONTINUED' _ "$SCRIPT" 2>&1)
source_code=$?
set -e
if [[ "$source_code" -ne 0 && "$source_out" != *CONTINUED* && "$source_out" == *refusing\ to\ run* ]]; then
  ok "sourced script is refused"
else
  bad "sourced script is refused (code=$source_code)"
fi

echo "== command tracing"
set +e
trace_out=$(bash -x "$SCRIPT" 2>&1)
trace_code=$?
set -e
if [[ "$trace_code" -ne 0 && "$trace_out" == *command\ tracing* ]]; then
  ok "tracing is refused"
else
  bad "tracing is refused (code=$trace_code)"
fi

echo "== export path"
WORK=$(mktemp -d)
chmod 700 "$WORK"
OUTSIDE=$(mktemp)
printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,{}\n' > "$OUTSIDE"
set +e
outside_out=$("$SCRIPT" import --export "$OUTSIDE" --workdir "$WORK" 2>&1)
outside_code=$?
set -e
if [[ "$outside_code" -ne 0 && "$outside_out" == *inside\ the\ workdir* ]]; then
  ok "export outside the workdir is refused"
else
  bad "export outside the workdir is refused"
fi

INSIDE="$WORK/users.csv"
cp "$OUTSIDE" "$INSIDE"
ln -s "$OUTSIDE" "$WORK/linked.csv"
set +e
link_out=$("$SCRIPT" import --export "$WORK/linked.csv" --workdir "$WORK" 2>&1)
link_code=$?
inside_out=$("$SCRIPT" import --export "$INSIDE" --workdir "$WORK" 2>&1)
inside_code=$?
set -e
if [[ "$link_code" -ne 0 && "$link_out" == *inside\ the\ workdir* ]]; then
  ok "export symlink that leaves the workdir is refused"
else
  bad "export symlink that leaves the workdir is refused"
fi
if [[ "$inside_code" -ne 0 && "$inside_out" != *inside\ the\ workdir* && "$inside_out" == *--tool-dir\ is\ required* ]]; then
  ok "export inside the workdir passes the path check"
else
  bad "export inside the workdir passes the path check"
fi
rm -rf "$WORK" "$OUTSIDE"

echo "== schema guard"
PG=$(mktemp -d)
DATA="$PG/data"
export PGHOST=$PG PGPORT=5501 PGUSER=postgres PGDATABASE=t
unset PGPASSWORD || true
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-k $PG -p 5501 -c listen_addresses=''" -l "$PG/log" -w start >/dev/null
cleanup_pg() {
  "$BIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PG"
}
trap cleanup_pg EXIT
PSQL=("$BIN/psql" -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS t" -c "CREATE DATABASE t" >/dev/null
"${PSQL[@]}" -c "DO \$\$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" >/dev/null
"${PSQL[@]}" -c "DO \$\$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" >/dev/null
"${PSQL[@]}" -c "GRANT USAGE ON SCHEMA public TO anon, authenticated" >/dev/null
for f in "$REPO"/prisma/migrations/*/migration.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null
done
"${PSQL[@]}" <<'SQL' >/dev/null
CREATE TABLE _prisma_migrations (
  id varchar(36) PRIMARY KEY,
  checksum varchar(64) NOT NULL,
  finished_at timestamptz,
  migration_name varchar(255) NOT NULL,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0
);
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES ('expected', 'x', '2026-10-02T00:00:00Z', '20261002041000_add_proposal_list_indexes', '2026-10-02T00:00:00Z', 1);
SQL
"${PSQL[@]}" --single-transaction -f "$ROOT/sql/02-functions.sql" >/dev/null
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS clerk_migration.id_map (old_id text PRIMARY KEY, new_id text NOT NULL UNIQUE, email text NOT NULL, CHECK (old_id <> new_id))" >/dev/null

GUARD_WORK=$(mktemp -d)
chmod 700 "$GUARD_WORK"
run_guard() {
  set +e
  out=$("$SCRIPT" remap --workdir "$GUARD_WORK" 2>&1)
  code=$?
  set -e
}

run_guard
if [[ "$code" -eq 0 && "$out" == *schema\ guard\ passed* ]]; then
  ok "matching migration and schema hash pass"
else
  bad "matching migration and schema hash pass (code=$code)"
  printf '%s\n' "$out" | tail -20
fi

"${PSQL[@]}" -c "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ('rolled', 'x', '2026-10-03T00:00:00Z', '20990101000000_rolled', '2026-10-03T00:00:00Z', 1)" >/dev/null
"${PSQL[@]}" -c "UPDATE _prisma_migrations SET rolled_back_at = finished_at WHERE id = 'rolled'" >/dev/null
run_guard
if [[ "$code" -eq 0 ]]; then
  ok "a rolled-back newer migration does not trip the guard"
else
  bad "a rolled-back newer migration does not trip the guard"
fi

"${PSQL[@]}" -c "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ('future', 'x', '2026-10-04T00:00:00Z', '20990101000000_future', '2026-10-04T00:00:00Z', 1)" >/dev/null
run_guard
if [[ "$code" -ne 0 && "$out" == *user-ID\ column\ list\ must\ be\ re-checked* && "$out" == *20990101000000_future* ]]; then
  ok "a newer applied migration stops remap"
else
  bad "a newer applied migration stops remap"
fi
"${PSQL[@]}" -c "DELETE FROM _prisma_migrations WHERE id = 'future'" >/dev/null

FAKE=$(mktemp -d)
mkdir -p "$FAKE/scripts/clerk-migration/sql" "$FAKE/prisma"
cp "$SCRIPT" "$FAKE/scripts/clerk-migration/migrate.sh"
cp "$ROOT"/sql/*.sql "$FAKE/scripts/clerk-migration/sql/"
cp "$REPO/prisma/schema.prisma" "$FAKE/prisma/schema.prisma"
printf '\n-- drift\n' >> "$FAKE/prisma/schema.prisma"
chmod +x "$FAKE/scripts/clerk-migration/migrate.sh"
HASH_WORK=$(mktemp -d)
chmod 700 "$HASH_WORK"
set +e
hash_out=$("$FAKE/scripts/clerk-migration/migrate.sh" remap --workdir "$HASH_WORK" 2>&1)
hash_code=$?
set -e
if [[ "$hash_code" -ne 0 && "$hash_out" == *user-ID\ column\ list\ must\ be\ re-checked* && "$hash_out" == *9acabc8* ]]; then
  ok "a changed schema hash stops remap"
else
  bad "a changed schema hash stops remap"
  printf '%s\n' "$hash_out" | tail -20
fi
rm -rf "$FAKE" "$GUARD_WORK" "$HASH_WORK"

echo "== child process secrets"
STUB=$(mktemp -d)
STUB_LOG="$STUB/log"
export STUB_LOG
cat > "$STUB/psql" <<EOF
#!/usr/bin/env bash
{
  if [[ -n "\${CLERK_SECRET_KEY+x}" ]]; then echo psql_clerk=present; else echo psql_clerk=absent; fi
  if [[ -n "\${PGPASSWORD+x}" ]]; then echo psql_pg=present; else echo psql_pg=absent; fi
} >> "\$STUB_LOG"
exec "$BIN/psql" "\$@"
EOF
cat > "$STUB/bun" <<'EOF'
#!/usr/bin/env bash
{
  if [[ -n "${CLERK_SECRET_KEY+x}" ]]; then echo "bun_clerk=present $2"; else echo "bun_clerk=absent $2"; fi
  if [[ -n "${PGPASSWORD+x}" ]]; then echo "bun_pg=present $2"; else echo "bun_pg=absent $2"; fi
} >> "$STUB_LOG"
if [[ "$1" == "--version" ]]; then
  echo 1.2.0
  exit 0
fi
if [[ "$2" == "write-dev-users" ]]; then
  printf 'id,email\nuser_devA,a@x.com\n' > "$4"
  exit 0
fi
if [[ "$2" == "write-prod-users" ]]; then
  printf 'id,email,external_id,created_at\nuser_prodA,A@x.com,user_devA,2026-10-01T00:00:00Z\n' > "$3"
  exit 0
fi
exit 0
EOF
chmod +x "$STUB/psql" "$STUB/bun"
SECRET_WORK=$(mktemp -d)
chmod 700 "$SECRET_WORK"
printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,{}\n' > "$SECRET_WORK/users.csv"
export PATH="$STUB:$PATH"
export PGPASSWORD=fromparent
python3 - "$SCRIPT" "$SECRET_WORK" <<'PY'
import os, select, sys, time
script, work = sys.argv[1], sys.argv[2]
cmd = [script, "build-map", "--export", f"{work}/users.csv", "--workdir", work]
pid, master = os.forkpty()
if pid == 0:
    os.execvp(cmd[0], cmd)
buf = b""
fed = False
deadline = time.time() + 30
status = 1
while True:
    try:
        chunk = os.read(master, 4096)
    except OSError:
        chunk = b""
    if chunk:
        buf += chunk
        if not fed and b"Clerk secret key" in buf:
            os.write(master, b"sk_live_localtest\n")
            fed = True
    ended, code = os.waitpid(pid, os.WNOHANG)
    if ended == pid:
        status = code >> 8 if os.WIFEXITED(code) else 1
        break
    if time.time() > deadline:
        os.kill(pid, 15)
        status = 1
        break
    if not chunk:
        select.select([master], [], [], 0.1)
sys.exit(status)
PY
secret_code=$?
unset PGPASSWORD || true
export PATH="${PATH#"$STUB:"}"
if [[ "$secret_code" -eq 0 ]] \
  && grep -q 'bun_clerk=absent write-dev-users' "$STUB_LOG" \
  && grep -q 'bun_clerk=present write-prod-users' "$STUB_LOG" \
  && grep -q 'bun_pg=absent' "$STUB_LOG" \
  && ! grep -q 'bun_pg=present' "$STUB_LOG" \
  && grep -q 'psql_clerk=absent' "$STUB_LOG" \
  && ! grep -q 'psql_clerk=present' "$STUB_LOG"; then
  ok "bun has no database password and psql has no clerk key"
else
  bad "bun has no database password and psql has no clerk key (code=$secret_code)"
  cat "$STUB_LOG" || true
fi
rm -rf "$STUB" "$SECRET_WORK"

trap - EXIT
cleanup_pg
echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
