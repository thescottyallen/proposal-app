#!/usr/bin/env bash
# Tests the clerk_migration SQL on a throwaway local Postgres with fake data.
# Never point this at a real database.
set -euo pipefail
# HERE is the clerk-migration directory so sql/ sits next to it.
HERE=$(cd "$(dirname "$0")/.." && pwd)
REPO=${REPO:-$(cd "$HERE/../.." && pwd)}
if [[ -n "${PGBIN:-}" ]]; then
  BIN=$PGBIN
elif [[ -x /usr/lib/postgresql/17/bin/initdb ]]; then
  BIN=/usr/lib/postgresql/17/bin
elif [[ -x /usr/lib/postgresql/16/bin/initdb ]]; then
  BIN=/usr/lib/postgresql/16/bin
else
  BIN=$(dirname "$(command -v initdb)")
fi
WORK=$(mktemp -d); DATA=$WORK/data
export PGHOST=$WORK PGPORT=5499 PGUSER=postgres PGDATABASE=t
trap '$BIN/pg_ctl -D $DATA stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-k $WORK -p 5499 -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
P() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
Q() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
PASS=0; FAIL=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
expect_eq() { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
expect_fail() { local name=$1; shift; if "$@" >"$WORK/out" 2>&1; then bad "$name (did not fail)"; else ok "$name: $(grep -o 'ERROR: .*' "$WORK/out" | head -1)"; fi; }

reset_db() {
  P -d postgres -c "DROP DATABASE IF EXISTS t" -c "CREATE DATABASE t"
  P -c "DO \$\$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" \
    -c "DO \$\$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END\$\$" \
    -c "GRANT USAGE ON SCHEMA public TO anon, authenticated"
  for f in "$REPO"/prisma/migrations/*/migration.sql; do P -f "$f" >/dev/null; done
  cd "$WORK"
  printf 'id,email\nuser_devA,a@x.com\nuser_devB,b@x.com\n' > dev_users.csv
  printf 'id,email,external_id,created_at\nuser_prodA,A@x.com,user_devA,2026-10-01\nuser_prodB,b@x.com,user_devB,2026-10-01\n' > prod_users.csv
  P --single-transaction -f "$HERE/sql/01-build-map.sql" >/dev/null 2>&1
  P --single-transaction -f "$HERE/sql/02-functions.sql" >/dev/null
}
seed() {  # devA has real settings (seq 42); prodA has an empty auto-created row
  P -c "INSERT INTO business_settings(id,user_id,business_name,invoice_seq,updated_at) VALUES
          ('bs_real','user_devA','The Product Bus',42,now()), ('bs_auto','user_prodA','',0,now())" \
    -c "INSERT INTO clients(id,name,created_by,updated_at) VALUES ('c1','Acme','user_devA',now()),('c2','Beta','user_devB',now())" \
    -c "INSERT INTO templates(id,name,content,created_by,updated_at) VALUES ('t1','T','{}','user_devB',now())" \
    -c "INSERT INTO proposals(id,title,client_name,client_email,content,public_id,created_by,updated_at)
          VALUES ('p1','P','A','a@a','{}','pub1','user_devA',now())" \
    -c "INSERT INTO proposal_events(id,proposal_id,event_type,metadata) VALUES
          ('e1','p1','edited','{\"editedBy\":\"user_devB\",\"changedFields\":[\"Title\"]}'), ('e2','p1','accepted','{\"signerName\":\"x\"}')"
}
real_row() { Q -c "SELECT user_id||':'||business_name||':'||invoice_seq FROM business_settings ORDER BY 1"; }
fwd()  { P -c "SELECT clerk_migration.remap('forward')" >/dev/null 2>&1; }
rev()  { P -c "SELECT clerk_migration.remap('reverse')" >/dev/null 2>&1; }

echo "== map building"
reset_db
expect_eq "map built from externalId" "$(Q -c "SELECT string_agg(old_id||'>'||new_id, ',' ORDER BY 1) FROM clerk_migration.id_map")" "user_devA>user_prodA,user_devB>user_prodB"
printf 'id,email,external_id,created_at\nuser_prodA,a@x.com,user_devA,x\nuser_prodC,b@x.com,user_devA,2026-10-01\n' > prod_users.csv
sed -i 's/,x$/,2026-10-01/' prod_users.csv
expect_fail "duplicate old ID rejected" P --single-transaction -f "$HERE/sql/01-build-map.sql"
printf 'id,email,external_id,created_at\nuser_prodA,a@x.com,user_devA,2026-10-01\nuser_prodB,a2@x.com,user_devB,2026-10-01\nuser_prodZ,z@x.com,user_devZ,2026-10-01\n' > prod_users.csv
expect_fail "unknown externalId rejected" P --single-transaction -f "$HERE/sql/01-build-map.sql"
printf 'id,email,external_id,created_at\nuser_prodA,zz@x.com,user_devA,2026-10-01\n' > prod_users.csv
expect_fail "email mismatch rejected" P --single-transaction -f "$HERE/sql/01-build-map.sql"
expect_eq "failed builds left the good map alone" "$(Q -c "SELECT count(*) FROM clerk_migration.id_map")" "2"

echo "== permissions"
expect_fail "anon cannot read the map" P -c "SET ROLE anon" -c "SELECT * FROM clerk_migration.id_map"
expect_fail "authenticated cannot call remap" P -c "SET ROLE authenticated" -c "SELECT clerk_migration.remap('forward')"

echo "== forward, dry-run then apply"
reset_db; seed
P -c "BEGIN" -c "SELECT clerk_migration.remap('forward')" -c "ROLLBACK" >/dev/null 2>&1
expect_eq "dry-run changes nothing" "$(real_row)" "$(printf 'user_devA:The Product Bus:42\nuser_prodA::0')"
fwd
expect_eq "empty new-ID row dropped, real row moved" "$(real_row)" "user_prodA:The Product Bus:42"
expect_eq "business_settings duplicate keeps the non-default row" "$(real_row)" "user_prodA:The Product Bus:42"
expect_eq "clients remapped" "$(Q -c "SELECT string_agg(created_by, ',' ORDER BY id) FROM clients")" "user_prodA,user_prodB"
expect_eq "editedBy remapped" "$(Q -c "SELECT metadata->>'editedBy' FROM proposal_events WHERE id='e1'")" "user_prodB"
expect_eq "counts recorded (8 columns x before/after)" "$(Q -c "SELECT count(*) FROM clerk_migration.row_counts")" "16"
if P -c "SELECT clerk_migration.verify('forward')" >/dev/null 2>&1; then ok "verify passes"; else bad "verify passes"; fi

echo "== Reep's case: re-run after key swap, old deployment auto-created an empty old-ID row"
P -c "INSERT INTO business_settings(id,user_id,updated_at) VALUES ('bs_late','user_devA',now())" \
  -c "INSERT INTO clients(id,name,created_by,updated_at) VALUES ('c3','Late','user_devA',now())"
expect_fail "verify catches the stragglers" P -c "SELECT clerk_migration.verify('forward')"
if fwd; then ok "re-run succeeds"; else bad "re-run succeeds"; fi
expect_eq "real row (seq 42) kept, empty old-ID row dropped" "$(real_row)" "user_prodA:The Product Bus:42"
expect_eq "late client moved" "$(Q -c "SELECT created_by FROM clients WHERE id='c3'")" "user_prodA"

echo "== both rows hold real settings"
P -c "INSERT INTO business_settings(id,user_id,business_name,updated_at) VALUES ('bs_other','user_devA','Other Co',now())"
expect_fail "stops when both rows are real" P -c "SELECT clerk_migration.remap('forward')"
expect_eq "nothing changed" "$(real_row)" "$(printf 'user_devA:Other Co:0\nuser_prodA:The Product Bus:42')"
P -c "DELETE FROM business_settings WHERE id='bs_other'"

echo "== reverse (rollback)"
P -c "INSERT INTO business_settings(id,user_id,updated_at) VALUES ('bs_devauto','user_devA',now())"   # dev deploy auto-created
if rev; then ok "reverse succeeds"; else bad "reverse succeeds"; fi
expect_eq "reverse: empty old-ID row dropped, real row moved back" "$(real_row)" "user_devA:The Product Bus:42"
expect_eq "reverse: clients back on dev IDs" "$(Q -c "SELECT string_agg(created_by, ',' ORDER BY id) FROM clients")" "user_devA,user_devB,user_devA"
if P -c "SELECT clerk_migration.verify('reverse')" >/dev/null 2>&1; then ok "verify('reverse') passes"; else bad "verify('reverse') passes"; fi
echo "== reverse re-run after rollback key swap, prod deployment auto-created an empty new-ID row"
P -c "INSERT INTO business_settings(id,user_id,updated_at) VALUES ('bs_prodlate','user_prodA',now())"
expect_fail "verify('reverse') catches it" P -c "SELECT clerk_migration.verify('reverse')"
if rev; then ok "reverse re-run succeeds"; else bad "reverse re-run succeeds"; fi
expect_eq "reverse re-run: real row kept on dev ID" "$(real_row)" "user_devA:The Product Bus:42"

echo "== orphans and unmapped IDs"
reset_db; seed; fwd
P -c "INSERT INTO clients(id,name,created_by,updated_at) VALUES ('c9','New','user_prodNEW',now())" \
  -c "INSERT INTO business_settings(id,user_id,business_name,updated_at) VALUES ('bs9','user_prodNEW','New Co',now())"
expect_fail "reverse stops on someone added after cutover" P -c "SELECT clerk_migration.remap('reverse')"
expect_fail "orphans_to must be a mapped dev ID" P -c "SELECT clerk_migration.remap('reverse', orphans_to => 'user_nobody')"
if P -c "SELECT clerk_migration.remap('reverse', orphans_to => 'user_devA')" >/dev/null 2>&1; then ok "reverse with orphans_to succeeds"; else bad "reverse with orphans_to"; fi
expect_eq "orphan's client reassigned and logged" "$(Q -c "SELECT c.created_by||' '||o.from_id FROM clients c JOIN clerk_migration.orphans o ON o.row_id=c.id WHERE c.id='c9'")" "user_devA user_prodNEW"
expect_eq "orphan's settings kept aside" "$(Q -c "SELECT business_name FROM clerk_migration.orphan_settings")" "New Co"
expect_eq "Scotty's real settings intact" "$(real_row)" "user_devA:The Product Bus:42"
reset_db; seed
P -c "INSERT INTO templates(id,name,content,created_by,updated_at) VALUES ('t9','X','{}','user_stranger',now())"
expect_fail "forward stops on an unmapped ID" P -c "SELECT clerk_migration.remap('forward')"

echo "== table locks"
reset_db; seed
( P -c "BEGIN" -c "SELECT clerk_migration.remap('forward')" -c "SELECT pg_sleep(3)" -c "ROLLBACK" >/dev/null 2>&1 ) &
sleep 1
expect_fail "app write blocked while remap runs" P -c "SET lock_timeout='1s'" -c "INSERT INTO clients(id,name,created_by,updated_at) VALUES ('cx','X','user_devA',now())"
wait

echo "== schema drift"
P -c "ALTER TABLE business_settings ADD COLUMN logo_url text" >/dev/null
expect_fail "new settings column stops the remap" P -c "SELECT clerk_migration.remap('forward')"

echo; echo "$PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
