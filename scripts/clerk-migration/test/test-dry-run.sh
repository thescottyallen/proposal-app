#!/usr/bin/env bash
# Each migrate.sh mode, without --apply, leaves the eight app tables unchanged.
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
PATH="${HOME}/.bun/bin:${PATH}"
export PATH

PG=$(mktemp -d)
DATA="$PG/data"
export PGHOST=$PG PGPORT=5502 PGUSER=postgres PGDATABASE=t
unset PGPASSWORD || true
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-k $PG -p 5502 -c listen_addresses=''" -l "$PG/log" -w start >/dev/null
cleanup() {
  "$BIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  if [[ -n "${MOCK_PID:-}" ]]; then
    kill "$MOCK_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$PG" "$WORK" "$TOOL"
}
WORK=$(mktemp -d)
TOOL=$(mktemp -d)
chmod 700 "$WORK"
trap cleanup EXIT

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
INSERT INTO business_settings(id,user_id,business_name,invoice_seq,updated_at) VALUES
  ('bs_real','user_devA','The Product Bus',42,now()), ('bs_auto','user_prodA','',0,now());
INSERT INTO clients(id,name,created_by,updated_at) VALUES ('c1','Acme','user_devA',now());
SQL

MAP=$PG/map
mkdir -p "$MAP"
printf 'id,email\nuser_devA,a@x.com\nuser_devB,b@x.com\n' > "$MAP/dev_users.csv"
printf 'id,email,external_id,created_at\nuser_prodA,A@x.com,user_devA,2026-10-01T00:00:00Z\nuser_prodB,b@x.com,user_devB,2026-10-01T00:00:00Z\n' > "$MAP/prod_users.csv"
(
  cd "$MAP"
  "${PSQL[@]}" --single-transaction -f "$ROOT/sql/01-build-map.sql" >/dev/null
  "${PSQL[@]}" --single-transaction -f "$ROOT/sql/02-functions.sql" >/dev/null
)

checksum() {
  "${PSQL[@]}" -tA -c "SELECT md5(COALESCE(string_agg(row_text, '|' ORDER BY row_text), '')) FROM (
      SELECT business_settings::text AS row_text FROM business_settings
      UNION ALL SELECT clients::text FROM clients
      UNION ALL SELECT contacts::text FROM contacts
      UNION ALL SELECT proposals::text FROM proposals
      UNION ALL SELECT proposal_revisions::text FROM proposal_revisions
      UNION ALL SELECT templates::text FROM templates
      UNION ALL SELECT content_blocks::text FROM content_blocks
      UNION ALL SELECT proposal_events::text FROM proposal_events
    ) rows"
}

git init "$TOOL" >/dev/null
git -C "$TOOL" remote add origin https://github.com/clerk/migration-tool.git
git -C "$TOOL" fetch --depth 1 origin bbf75584668e9f10a239b545adbce57e1308c974 >/dev/null
git -C "$TOOL" checkout --detach FETCH_HEAD >/dev/null

python3 - <<'PY' &
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
USERS = [
  {
    "id": "user_prodA",
    "external_id": "user_devA",
    "primary_email_address_id": "e1",
    "email_addresses": [{"id": "e1", "email_address": "a@x.com"}],
    "created_at": 1759276800000,
    "public_metadata": {"role": "admin", "theme": "dark"},
  },
  {
    "id": "user_prodB",
    "external_id": "user_devB",
    "primary_email_address_id": "e2",
    "email_addresses": [{"id": "e2", "email_address": "b@x.com"}],
    "created_at": 1759276800000,
    "public_metadata": {},
  },
]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/v1/users"):
            body = json.dumps(USERS).encode()
        elif self.path.startswith("/v1/sessions"):
            if "user_id=" not in self.path:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"errors":[{"message":"user_id or client_id is required"}]}')
                return
            body = b'[{"id":"sess_1","user_id":"user_prodA","status":"active"}]'
        elif self.path.startswith("/v1/invitations"):
            body = b"[]"
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, fmt, *args):
        return
ThreadingHTTPServer(("127.0.0.1", 5519), Handler).serve_forever()
PY
MOCK_PID=$!
export CLERK_API_BASE=http://127.0.0.1:5519
for _ in 1 2 3 4 5 6 7 8 9 10; do
  python3 -c 'import socket; s=socket.create_connection(("127.0.0.1", 5519), 1); s.close()' >/dev/null 2>&1 && break
  sleep 0.2
done

printf 'id,primary_email_address,public_metadata\nuser_devA,a@x.com,"{""role"":""admin"",""theme"":""dark""}"\nuser_devB,b@x.com,{}\n' > "$WORK/users.csv"
date -u +%Y-%m-%dT%H:%M:%SZ > "$WORK/freeze-start"
date -u +%Y-%m-%dT%H:%M:%SZ > "$WORK/cutover"
chmod 600 "$WORK/freeze-start" "$WORK/cutover"

before=$(checksum)
real_before=$("${PSQL[@]}" -tA -c "SELECT user_id||':'||business_name||':'||invoice_seq FROM business_settings ORDER BY 1")

run_pty() {
  local key=$1
  shift
  python3 - "$key" "$@" <<'PY'
import os, select, sys, time
key = sys.argv[1]
cmd = sys.argv[2:]
pid, master = os.forkpty()
if pid == 0:
    os.execvp(cmd[0], cmd)
buf = b""
fed = False
deadline = time.time() + 240
status = 1
while True:
    try:
        chunk = os.read(master, 4096)
    except OSError:
        chunk = b""
    if chunk:
        buf += chunk
        if key and not fed and b"Clerk secret key" in buf:
            os.write(master, key.encode() + b"\n")
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
sys.stdout.buffer.write(buf)
sys.exit(status)
PY
}

expect_ok() {
  local name=$1
  shift
  echo "== $name"
  set +e
  out=$(run_pty "" "$SCRIPT" "$name" --workdir "$WORK" "$@" 2>&1)
  code=$?
  set -e
  now=$(checksum)
  if [[ "$code" -eq 0 && "$now" == "$before" ]]; then
    echo "PASS  $name leaves checksums unchanged"
  else
    echo "FAIL  $name (code=$code checksum_same=$([[ "$now" == "$before" ]] && echo yes || echo no))"
    printf '%s\n' "$out" | tail -30
    exit 1
  fi
}

expect_ok_key() {
  local name=$1
  local key=$2
  shift 2
  echo "== $name"
  set +e
  out=$(run_pty "$key" "$SCRIPT" "$name" --workdir "$WORK" "$@" 2>&1)
  code=$?
  set -e
  now=$(checksum)
  if [[ "$code" -eq 0 && "$now" == "$before" ]]; then
    echo "PASS  $name leaves checksums unchanged"
  else
    echo "FAIL  $name (code=$code checksum_same=$([[ "$now" == "$before" ]] && echo yes || echo no))"
    printf '%s\n' "$out" | tail -40
    exit 1
  fi
}

expect_ok preflight --tool-dir "$TOOL"
expect_ok backup
expect_ok_key import sk_live_localtest --export "$WORK/users.csv" --tool-dir "$TOOL"
expect_ok_key build-map sk_live_localtest --export "$WORK/users.csv"
expect_ok remap
echo "== verify"
set +e
out=$(run_pty "" "$SCRIPT" verify --workdir "$WORK" 2>&1)
code=$?
set -e
now=$(checksum)
if [[ "$now" == "$before" ]]; then
  echo "PASS  verify leaves checksums unchanged"
else
  echo "FAIL  verify changed table checksums"
  exit 1
fi
echo "== verify --reverse"
set +e
out=$(run_pty "" "$SCRIPT" verify --reverse --workdir "$WORK" 2>&1)
code=$?
set -e
now=$(checksum)
if [[ "$now" == "$before" ]]; then
  echo "PASS  verify --reverse leaves checksums unchanged"
else
  echo "FAIL  verify --reverse changed table checksums"
  printf '%s\n' "$out" | tail -20
  exit 1
fi
expect_ok freeze-check
expect_ok_key revoke-dev-sessions sk_test_localtest
# The mock stands in for the dev instance. --keep must be an admin id it returns.
expect_ok_key demote-dev-admins sk_test_localtest --keep user_prodA
expect_ok_key restore-dev-roles sk_test_localtest --export "$WORK/users.csv"
expect_ok_key rollback sk_live_localtest
expect_ok mark-cutover
expect_ok purge-export
expect_ok cleanup

real_after=$("${PSQL[@]}" -tA -c "SELECT user_id||':'||business_name||':'||invoice_seq FROM business_settings ORDER BY 1")
if [[ "$real_after" == "$real_before" && "$real_after" == "$(printf 'user_devA:The Product Bus:42\nuser_prodA::0')" ]]; then
  echo "PASS  business_settings duplicate still keeps the non-default row after dry-run"
else
  echo "FAIL  business settings changed: $real_after"
  exit 1
fi
echo "dry-run checksums held"
