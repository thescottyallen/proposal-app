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
if [[ "$inside_code" -ne 0 && "$inside_out" != *inside\ the\ workdir* && "$inside_out" == *"export users.csv"* ]]; then
  ok "export inside the workdir passes the path check"
else
  bad "export inside the workdir passes the path check"
  printf '%s\n' "$inside_out" | tail -20
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

echo "== workdir synced folders"
SYNC_HOME=$(mktemp -d)
mkdir -p "$SYNC_HOME/Desktop/job" "$SYNC_HOME/private"
chmod 700 "$SYNC_HOME/Desktop" "$SYNC_HOME/Desktop/job" "$SYNC_HOME/private"
DOCS_REAL=$(mktemp -d)
mkdir -p "$DOCS_REAL/job"
chmod 700 "$DOCS_REAL" "$DOCS_REAL/job"
ln -s "$DOCS_REAL" "$SYNC_HOME/Documents"
set +e
desk_out=$(HOME="$SYNC_HOME" "$SCRIPT" remap --workdir "$SYNC_HOME/Desktop/job" 2>&1)
desk_code=$?
docs_out=$(HOME="$SYNC_HOME" "$SCRIPT" remap --workdir "$SYNC_HOME/Documents/job" 2>&1)
docs_code=$?
plain_out=$(HOME="$SYNC_HOME" "$SCRIPT" remap --workdir "$SYNC_HOME/private" 2>&1)
plain_code=$?
set -e
if [[ "$desk_code" -ne 0 && "$desk_out" == *under\ Desktop\ because\ iCloud* ]]; then
  ok "Desktop workdir is refused"
else
  bad "Desktop workdir is refused"
fi
if [[ "$docs_code" -ne 0 && "$docs_out" == *under\ Documents\ because\ iCloud* ]]; then
  ok "Documents workdir is refused when the path is a symlink"
else
  bad "Documents workdir is refused when the path is a symlink"
fi
if [[ "$plain_code" -eq 0 && "$plain_out" != *iCloud* ]]; then
  ok "a private workdir is accepted"
else
  bad "a private workdir is accepted (code=$plain_code)"
  printf '%s\n' "$plain_out" | tail -20
fi
rm -rf "$SYNC_HOME" "$DOCS_REAL"

feed() {
  set +e
  feed_out=$(python3 - "$@" <<'PY'
import os, select, sys, time
args = sys.argv[1:]
sep = args.index("--")
pairs = [(args[i].encode(), (args[i + 1] + "\n").encode()) for i in range(0, sep, 2)]
cmd = args[sep + 1 :]
pid, master = os.forkpty()
if pid == 0:
    os.execvp(cmd[0], cmd)
buf = b""
used = [False] * len(pairs)
deadline = time.time() + 90
status = 1
while True:
    try:
        chunk = os.read(master, 4096)
    except OSError:
        chunk = b""
    if chunk:
        buf += chunk
        for index, (prompt, answer) in enumerate(pairs):
            if not used[index] and prompt in buf:
                os.write(master, answer)
                used[index] = True
                break
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
sys.stdout.buffer.write(buf)
sys.exit(status)
PY
)
  feed_code=$?
  set -e
}

echo "== database confirmation"
"${PSQL[@]}" -c "INSERT INTO business_settings(id,user_id,business_name,invoice_seq,updated_at) VALUES ('bs_confirm','user_devA','The Product Bus',42,now())" >/dev/null
CONFIRM_WORK=$(mktemp -d)
chmod 700 "$CONFIRM_WORK"
before_uid=$("${PSQL[@]}" -tA -c "SELECT user_id FROM business_settings WHERE id='bs_confirm'")
feed "Type the database name to confirm" "nope" -- "$SCRIPT" remap --apply --workdir "$CONFIRM_WORK"
after_uid=$("${PSQL[@]}" -tA -c "SELECT user_id FROM business_settings WHERE id='bs_confirm'")
if [[ "$feed_code" -ne 0 && "$feed_out" == *"database host ${PGHOST}"* && "$feed_out" == *"database name t"* && "$feed_out" == *"business name The Product Bus"* && "$feed_out" == *business_settings* && "$feed_out" == *not\ confirmed* && "$before_uid" == "$after_uid" && "$after_uid" == "user_devA" ]]; then
  ok "a wrong database confirmation writes nothing"
else
  bad "a wrong database confirmation writes nothing (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -30
fi

SAVED_HOST=$PGHOST
SAVED_PORT=$PGPORT
SUPA_STUB=$(mktemp -d)
SUPA_LOG="$SUPA_STUB/log"
export SUPA_LOG
cat > "$SUPA_STUB/psql" <<'EOF'
#!/usr/bin/env bash
sql=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-c" ]]; then sql=$arg; fi
  if [[ "$prev" == "-f" ]]; then sql=$(cat "$arg"); fi
  prev=$arg
done
{
  printf '%s\n' "sql<<$sql"
} >> "$SUPA_LOG"
if [[ "$sql" == *current_database* ]]; then
  printf '%s\n' t
elif [[ "$sql" == *business_name* ]]; then
  printf '%s\n' "The Product Bus"
elif [[ "$sql" == *remap* ]]; then
  printf '%s\n' REMAP >> "$SUPA_LOG"
fi
exit 0
EOF
chmod +x "$SUPA_STUB/psql"
export PGHOST=db.abc123.supabase.co PGPORT=5432
export PATH="$SUPA_STUB:$PATH"
SUPA_WORK=$(mktemp -d)
chmod 700 "$SUPA_WORK"
: > "$SUPA_LOG"
feed "Type the Supabase project ref to confirm" "nope" -- "$SCRIPT" remap --apply --workdir "$SUPA_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *"database host db.abc123.supabase.co"* && "$feed_out" == *not\ confirmed* ]] && ! grep -q REMAP "$SUPA_LOG"; then
  ok "a Supabase host asks for the project ref and a wrong ref writes nothing"
else
  bad "a Supabase host asks for the project ref and a wrong ref writes nothing (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
  cat "$SUPA_LOG" || true
fi
: > "$SUPA_LOG"
feed "Type the Supabase project ref to confirm" "abc123" -- "$SCRIPT" remap --apply --workdir "$SUPA_WORK"
if [[ "$feed_code" -eq 0 ]] && grep -q REMAP "$SUPA_LOG"; then
  ok "typing the Supabase project ref allows the write"
else
  bad "typing the Supabase project ref allows the write (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
  cat "$SUPA_LOG" || true
fi
export PATH="${PATH#"$SUPA_STUB:"}"
export PGHOST=$SAVED_HOST PGPORT=$SAVED_PORT
rm -rf "$SUPA_STUB" "$SUPA_WORK" "$CONFIRM_WORK"

echo "== clerk confirmation and sessions"
export PATH="${HOME}/.bun/bin:${PATH}"
API="$ROOT/lib/clerk-api.ts"
start_mock() {
  MOCK_PORT=$1
  MOCK_KIND=$2
  MOCK_HITS=$3
  python3 - "$MOCK_PORT" "$MOCK_KIND" "$MOCK_HITS" <<'PY' &
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
port, kind, hits = int(sys.argv[1]), sys.argv[2], sys.argv[3]
def user(i, external):
    return {
        "id": f"user_{i}",
        "external_id": external,
        "primary_email_address_id": "e",
        "email_addresses": [{"id": "e", "email_address": f"p{i}@example.com"}],
        "created_at": 1759276800000,
        "public_metadata": {},
    }
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path == "/v1/users":
            offset = int(qs.get("offset", ["0"])[0])
            if kind == "missing":
                body = [user(1, None)]
            elif kind == "pages":
                if offset == 0:
                    body = [user(i, f"dev_{i}") for i in range(100)]
                elif offset == 100:
                    body = [user(100, "dev_100")]
                else:
                    body = []
            else:
                body = [user(1, "dev_1"), user(2, "dev_2")]
            raw = json.dumps(body).encode()
            self.send_response(200)
        elif parsed.path == "/v1/sessions":
            with open(hits, "a", encoding="utf-8") as handle:
                if "user_id" not in qs:
                    handle.write("missing\n")
                else:
                    handle.write(f"user {qs['user_id'][0]}\n")
            if kind == "fail" or "user_id" not in qs:
                raw = b'{"errors":[{"message":"user_id is required"}]}'
                self.send_response(400 if "user_id" not in qs else 500)
            else:
                raw = b"[]"
                self.send_response(200)
        elif parsed.path == "/v1/invitations":
            raw = b"[]"
            self.send_response(200)
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)
    def do_POST(self):
        with open(hits, "a", encoding="utf-8") as handle:
            handle.write(f"POST {self.path}\n")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{}")
    def log_message(self, fmt, *args):
        return
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
  MOCK_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    python3 -c 'import socket,sys; s=socket.create_connection(("127.0.0.1", int(sys.argv[1])), 1); s.close()' "$MOCK_PORT" >/dev/null 2>&1 && return 0
    sleep 0.1
  done
  return 1
}
stop_mock() {
  if [[ -n "${MOCK_PID:-}" ]]; then
    kill "$MOCK_PID" >/dev/null 2>&1 || true
    wait "$MOCK_PID" 2>/dev/null || true
    MOCK_PID=""
  fi
}

HITS=$(mktemp)
start_mock 5521 missing "$HITS"
export CLERK_API_BASE=http://127.0.0.1:5521
EXT_WORK=$(mktemp -d)
chmod 700 "$EXT_WORK"
printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,{}\n' > "$EXT_WORK/users.csv"
feed "Clerk secret key" "sk_live_localtest" -- "$SCRIPT" import --export "$EXT_WORK/users.csv" --workdir "$EXT_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *without\ externalId* && "$feed_out" == *prod\ users\ without\ externalId* && "$feed_out" == *Clerk\ instance\ check\ failed* ]]; then
  ok "import refuses prod users who have no externalId"
else
  bad "import refuses prod users who have no externalId (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -30
fi
stop_mock
rm -rf "$EXT_WORK"

: > "$HITS"
start_mock 5522 normal "$HITS"
export CLERK_API_BASE=http://127.0.0.1:5522
COUNT_WORK=$(mktemp -d)
chmod 700 "$COUNT_WORK"
feed "Clerk secret key" "sk_test_localtest" "Type the user count to confirm this Clerk instance" "99" -- "$SCRIPT" revoke-dev-sessions --apply --workdir "$COUNT_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *"users 2"* && "$feed_out" == *email\ p***@example.com* && "$feed_out" == *not\ confirmed* ]] && ! grep -q '^POST ' "$HITS"; then
  ok "a wrong Clerk user count revokes nothing"
else
  bad "a wrong Clerk user count revokes nothing (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -30
  cat "$HITS" || true
fi
stop_mock
rm -rf "$COUNT_WORK"

: > "$HITS"
start_mock 5523 fail "$HITS"
export CLERK_API_BASE=http://127.0.0.1:5523
FAIL_WORK=$(mktemp -d)
chmod 700 "$FAIL_WORK"
feed "Clerk secret key" "sk_test_localtest" -- "$SCRIPT" revoke-dev-sessions --workdir "$FAIL_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *Clerk\ API\ 500* ]]; then
  ok "a session API error stops revoke-dev-sessions"
else
  bad "a session API error stops revoke-dev-sessions (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
fi
stop_mock
rm -rf "$FAIL_WORK"
unset CLERK_API_BASE || true

: > "$HITS"
start_mock 5524 pages "$HITS"
export CLERK_API_BASE=http://127.0.0.1:5524
set +e
page_out=$(CLERK_SECRET_KEY=sk_test_localtest bun "$API" list-sessions 2>&1)
page_code=$?
set -e
page_hits=$(grep -c '^user ' "$HITS" || true)
if [[ "$page_code" -eq 0 && "$page_hits" -eq 101 && "$page_out" == *"active sessions 0"* ]] && ! grep -q '^missing$' "$HITS"; then
  ok "active sessions are listed per user across pages"
else
  bad "active sessions are listed per user across pages (code=$page_code hits=$page_hits)"
  printf '%s\n' "$page_out" | tail -20
fi
stop_mock
unset CLERK_API_BASE || true

BAD_WORK=$(mktemp -d)
chmod 700 "$BAD_WORK"
printf 'id,primary_email_address,public_metadata\nuser_1,p1@example.com,{\n' > "$BAD_WORK/users.csv"
start_mock 5525 normal "$HITS"
export CLERK_API_BASE=http://127.0.0.1:5525
set +e
meta_out=$(CLERK_SECRET_KEY=sk_test_localtest bun "$API" restore-plan "$BAD_WORK/users.csv" 2>&1)
meta_code=$?
set -e
if [[ "$meta_code" -ne 0 && "$meta_out" == *could\ not\ be\ read* ]]; then
  ok "unreadable export metadata stops a restore"
else
  bad "unreadable export metadata stops a restore (code=$meta_code)"
  printf '%s\n' "$meta_out" | tail -20
fi
stop_mock
unset CLERK_API_BASE || true
rm -rf "$BAD_WORK" "$HITS"

echo "== rollback checks the remap before revoking invites"
"${PSQL[@]}" -c "INSERT INTO clients(id,name,created_by,updated_at) VALUES ('c_stranger','New','user_prodNEW',now())" >/dev/null
ROLL_STUB=$(mktemp -d)
ROLL_LOG="$ROLL_STUB/bun-log"
export ROLL_LOG
cat > "$ROLL_STUB/bun" <<'EOF'
#!/usr/bin/env bash
cmd=${2:-}
printf '%s\n' "$cmd" >> "$ROLL_LOG"
if [[ "$1" == "--version" ]]; then
  echo 1.2.0
  exit 0
fi
case "$cmd" in
  describe-instance)
    printf '%s\n' "users 2"
    printf '%s\n' "email a***@example.com"
    ;;
  revoke-pending-invitations)
    printf '%s\n' "revoked 0 invitations"
    ;;
esac
exit 0
EOF
chmod +x "$ROLL_STUB/bun"
export PATH="$ROLL_STUB:$PATH"
ROLL_WORK=$(mktemp -d)
chmod 700 "$ROLL_WORK"
: > "$ROLL_LOG"
feed "Clerk secret key" "sk_live_localtest" "Type the database name to confirm" "t" "Type the user count to confirm this Clerk instance" "2" -- "$SCRIPT" rollback --apply --workdir "$ROLL_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *reverse\ remap\ check\ failed* && "$feed_out" == *production\ invitations\ were\ not\ revoked* ]] && ! grep -q revoke-pending-invitations "$ROLL_LOG"; then
  ok "a failed reverse remap does not revoke production invitations"
else
  bad "a failed reverse remap does not revoke production invitations (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -30
  cat "$ROLL_LOG" || true
fi
"${PSQL[@]}" -c "DELETE FROM clients WHERE id='c_stranger'" >/dev/null
"${PSQL[@]}" -c "DELETE FROM business_settings WHERE id='bs_confirm'" >/dev/null
: > "$ROLL_LOG"
ROLL_OK=$(mktemp -d)
chmod 700 "$ROLL_OK"
feed "Clerk secret key" "sk_live_localtest" "Type the database name to confirm" "t" "Type the user count to confirm this Clerk instance" "2" -- "$SCRIPT" rollback --apply --workdir "$ROLL_OK"
if [[ "$feed_code" -eq 0 ]] && grep -q revoke-pending-invitations "$ROLL_LOG"; then
  notice_at=$(grep -n 'NOTICE' "$ROLL_OK/logs/"*.log | head -1 | cut -d: -f1)
  revoke_at=$(grep -n 'revoked 0 invitations' "$ROLL_OK/logs/"*.log | head -1 | cut -d: -f1)
  if [[ -n "$notice_at" && -n "$revoke_at" && "$notice_at" -lt "$revoke_at" ]]; then
    ok "reverse remap is checked before production invitations are revoked"
  else
    bad "reverse remap is checked before production invitations are revoked (notice=$notice_at revoke=$revoke_at)"
    printf '%s\n' "$feed_out" | tail -30
  fi
else
  bad "reverse remap is checked before production invitations are revoked (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -30
  cat "$ROLL_LOG" || true
fi
export PATH="${PATH#"$ROLL_STUB:"}"
rm -rf "$ROLL_STUB" "$ROLL_WORK" "$ROLL_OK"

echo "== cutover timestamp"
CUT_WORK=$(mktemp -d)
chmod 700 "$CUT_WORK"
set +e
mark_out=$("$SCRIPT" mark-cutover --workdir "$CUT_WORK" 2>&1)
mark_code=$?
set -e
if [[ "$mark_code" -eq 0 && ! -f "$CUT_WORK/cutover" && "$mark_out" == *pk_live_* && "$mark_out" == *"would record cutover"* ]]; then
  ok "mark-cutover dry-run records nothing"
else
  bad "mark-cutover dry-run records nothing (code=$mark_code)"
  printf '%s\n' "$mark_out" | tail -20
fi
"$SCRIPT" mark-cutover --apply --workdir "$CUT_WORK" >/dev/null
recorded=$(tr -d '[:space:]' < "$CUT_WORK/cutover")
mode=$(stat -c '%a' "$CUT_WORK/cutover")
set +e
again_out=$("$SCRIPT" mark-cutover --apply --workdir "$CUT_WORK" 2>&1)
again_code=$?
set -e
if [[ "$again_code" -ne 0 && "$again_out" == *refusing\ to\ replace\ a\ recorded\ cutover* && "$(tr -d '[:space:]' < "$CUT_WORK/cutover")" == "$recorded" && "$recorded" == *Z && "$mode" == "600" ]]; then
  ok "mark-cutover --apply writes the go-live time once"
else
  bad "mark-cutover --apply writes the go-live time once (code=$again_code mode=$mode)"
  printf '%s\n' "$again_out" | tail -20
fi

printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,{}\n' > "$CUT_WORK/users.csv"
printf '%s\n' users.csv > "$CUT_WORK/export-record"
printf '%s\n' kept > "$CUT_WORK/backup.dump"
printf '%s\n' kept > "$CUT_WORK/dev_users.csv"
date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/freeze-start"
rm -f "$CUT_WORK/cutover"
set +e
no_cut_out=$("$SCRIPT" purge-export --apply --workdir "$CUT_WORK" 2>&1)
no_cut_code=$?
set -e
if [[ "$no_cut_code" -ne 0 && "$no_cut_out" == *cutover\ is\ missing* && -f "$CUT_WORK/users.csv" ]]; then
  ok "purge-export refuses to run when cutover was not recorded"
else
  bad "purge-export refuses to run when cutover was not recorded (code=$no_cut_code)"
  printf '%s\n' "$no_cut_out" | tail -20
fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/cutover"
set +e
early_out=$("$SCRIPT" purge-export --apply --workdir "$CUT_WORK" 2>&1)
early_code=$?
set -e
if [[ "$early_code" -ne 0 && "$early_out" == *before\ the\ 24\ hour\ cutoff* && -f "$CUT_WORK/users.csv" ]]; then
  ok "purge-export waits 24 hours after cutover"
else
  bad "purge-export waits 24 hours after cutover (code=$early_code)"
  printf '%s\n' "$early_out" | tail -20
fi
date -u -d '25 hours ago' +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/cutover"
"$SCRIPT" purge-export --apply --workdir "$CUT_WORK" >/dev/null
if [[ ! -f "$CUT_WORK/users.csv" && -f "$CUT_WORK/backup.dump" && -f "$CUT_WORK/dev_users.csv" ]]; then
  ok "purge-export deletes only the password-hash export after cutover"
else
  bad "purge-export deletes only the password-hash export after cutover"
fi

rm -f "$CUT_WORK/cutover"
set +e
clean_missing=$("$SCRIPT" cleanup --workdir "$CUT_WORK" 2>&1)
clean_missing_code=$?
set -e
if [[ "$clean_missing_code" -ne 0 && "$clean_missing" == *cutover\ is\ missing* ]]; then
  ok "cleanup refuses to run when cutover was not recorded"
else
  bad "cleanup refuses to run when cutover was not recorded (code=$clean_missing_code)"
  printf '%s\n' "$clean_missing" | tail -20
fi
date -u -d '20 days ago' +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/freeze-start"
date -u +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/cutover"
set +e
clean_early=$("$SCRIPT" cleanup --apply --workdir "$CUT_WORK" 2>&1)
clean_early_code=$?
set -e
schema_left=$("${PSQL[@]}" -tA -c "SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'clerk_migration'")
if [[ "$clean_early_code" -ne 0 && "$clean_early" == *14\ days\ after\ cutover* && "$schema_left" == "1" && -d "$CUT_WORK" ]]; then
  ok "cleanup counts 14 days from cutover, not freeze-start"
else
  bad "cleanup counts 14 days from cutover, not freeze-start (code=$clean_early_code schema=$schema_left)"
  printf '%s\n' "$clean_early" | tail -20
fi
date -u -d '15 days ago' +%Y-%m-%dT%H:%M:%SZ > "$CUT_WORK/cutover"
set +e
clean_due=$("$SCRIPT" cleanup --workdir "$CUT_WORK" 2>&1)
clean_due_code=$?
set -e
schema_still=$("${PSQL[@]}" -tA -c "SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'clerk_migration'")
if [[ "$clean_due_code" -eq 0 && "$clean_due" == *"would drop schema clerk_migration"* && "$schema_still" == "1" ]]; then
  ok "cleanup dry-run lists the drop once 14 days have passed since cutover"
else
  bad "cleanup dry-run lists the drop once 14 days have passed since cutover (code=$clean_due_code)"
  printf '%s\n' "$clean_due" | tail -20
fi
rm -rf "$CUT_WORK"

echo "== rollback cutoff"
ROLL2=$(mktemp -d)
chmod 700 "$ROLL2"
date -u -d '25 hours ago' +%Y-%m-%dT%H:%M:%SZ > "$ROLL2/cutover"
feed "Clerk secret key" "sk_live_localtest" -- "$SCRIPT" rollback --apply --workdir "$ROLL2"
if [[ "$feed_code" -ne 0 && "$feed_out" == *refusing\ rollback\ 24\ hours\ after\ cutover* && "$feed_out" != *Type\ the\ database\ name* && "$feed_out" != *revoked* ]]; then
  ok "rollback stops 24 hours after cutover, before invitations are revoked"
else
  bad "rollback stops 24 hours after cutover, before invitations are revoked (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
fi
"${PSQL[@]}" -c "INSERT INTO proposals(id,title,client_name,client_email,content,public_id,created_by,updated_at) VALUES ('p_cut','P','A','a@a','{}','pub_cut','user_devA',now())" >/dev/null
"${PSQL[@]}" -c "INSERT INTO proposal_events(id,proposal_id,event_type,metadata) VALUES ('e_cut','p_cut','accepted','{\"signerName\":\"x\"}')" >/dev/null
date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ > "$ROLL2/cutover"
feed "Clerk secret key" "sk_live_localtest" -- "$SCRIPT" rollback --apply --workdir "$ROLL2"
if [[ "$feed_code" -ne 0 && "$feed_out" == *first\ acceptance\ since\ cutover* && "$feed_out" != *Type\ the\ database\ name* && "$feed_out" != *revoked* ]]; then
  ok "rollback stops after the first acceptance since cutover"
else
  bad "rollback stops after the first acceptance since cutover (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
fi
"${PSQL[@]}" -c "DELETE FROM proposal_events WHERE id = 'e_cut'" >/dev/null
"${PSQL[@]}" -c "DELETE FROM proposals WHERE id = 'p_cut'" >/dev/null
rm -rf "$ROLL2"

echo "== git status ignores node_modules and has no secrets"
GIT_STUB=$(mktemp -d)
GIT_LOG="$GIT_STUB/log"
export GIT_LOG
TOOL_PIN=bbf75584668e9f10a239b545adbce57e1308c974
cat > "$GIT_STUB/git" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *status* || "\$*" == *HEAD* ]]; then
  {
    printf '%s\n' "git \$*"
    if [[ -n "\${CLERK_SECRET_KEY+x}" ]]; then printf '%s\n' clerk=present; else printf '%s\n' clerk=absent; fi
    if [[ -n "\${PGPASSWORD+x}" ]]; then printf '%s\n' pg=present; else printf '%s\n' pg=absent; fi
  } >> "\$GIT_LOG"
fi
if [[ "\$*" == *rev-parse* && "\$*" == *HEAD* ]]; then
  printf '%s\n' "$TOOL_PIN"
  exit 0
fi
if [[ "\$*" == *rev-parse* ]]; then
  exit 1
fi
if [[ "\$*" == *status* ]]; then
  if [[ -f "$GIT_STUB/dirty" ]]; then
    printf '%s\n' "!! tmp/dirty"
  fi
  exit 0
fi
exit 0
EOF
cat > "$GIT_STUB/bun" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then
  echo 1.2.0
  exit 0
fi
case "${2:-}" in
  describe-instance)
    printf '%s\n' "users 1"
    printf '%s\n' "email a***@example.com"
    ;;
  summarize-export)
    printf '%s\n' "users 1"
    ;;
esac
exit 0
EOF
chmod +x "$GIT_STUB/git" "$GIT_STUB/bun"
export PATH="$GIT_STUB:$PATH"
export CLERK_SECRET_KEY=sk_live_parent PGPASSWORD=fromparent
GIT_WORK=$(mktemp -d)
chmod 700 "$GIT_WORK"
printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,{}\n' > "$GIT_WORK/users.csv"
touch "$GIT_STUB/dirty"
: > "$GIT_LOG"
feed "Clerk secret key" "sk_live_localtest" -- "$SCRIPT" import --export "$GIT_WORK/users.csv" --tool-dir "$GIT_STUB" --workdir "$GIT_WORK"
if [[ "$feed_code" -ne 0 && "$feed_out" == *not\ clean* ]] && grep -q 'status --porcelain --ignored' "$GIT_LOG" && grep -q ':(exclude)node_modules' "$GIT_LOG" && grep -q 'clerk=absent' "$GIT_LOG" && ! grep -q 'clerk=present' "$GIT_LOG" && grep -q 'pg=absent' "$GIT_LOG" && ! grep -q 'pg=present' "$GIT_LOG"; then
  ok "an ignored file outside node_modules stops the run, and git has no secrets"
else
  bad "an ignored file outside node_modules stops the run, and git has no secrets (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
  cat "$GIT_LOG" || true
fi
rm -f "$GIT_STUB/dirty"
: > "$GIT_LOG"
feed "Clerk secret key" "sk_live_localtest" -- "$SCRIPT" import --export "$GIT_WORK/users.csv" --tool-dir "$GIT_STUB" --workdir "$GIT_WORK"
if [[ "$feed_code" -eq 0 ]] && grep -q ':(exclude)node_modules' "$GIT_LOG"; then
  ok "node_modules is excluded from the dirty check"
else
  bad "node_modules is excluded from the dirty check (code=$feed_code)"
  printf '%s\n' "$feed_out" | tail -20
  cat "$GIT_LOG" || true
fi
unset CLERK_SECRET_KEY PGPASSWORD || true
export PATH="${PATH#"$GIT_STUB:"}"
rm -rf "$GIT_STUB" "$GIT_WORK"

trap - EXIT
cleanup_pg
echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
