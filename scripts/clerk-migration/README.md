# Clerk dev-to-production migration

`migrate.sh` is the only command to run. It remaps Clerk user ids in this app's database after users are imported into a production Clerk instance. Dry-run is the default. Pass `--apply` to make changes.

Scotty runs it on his own machine. The script prompts for secrets with `read -rs`. It does not take secrets as arguments, and it does not read them from the repo.

## Before you run a mode

- Clone [clerk/migration-tool](https://github.com/clerk/migration-tool) and check out commit `bbf75584668e9f10a239b545adbce57e1308c974`. Pass that directory as `--tool-dir`.
- Pick a private `--workdir` (the default is `~/clerk-migration-private`). It is created mode `0700`. The script refuses a folder inside a git repo, under `~/Desktop` or `~/Documents` (including a symlink that resolves there, because iCloud can sync them), or under Dropbox, iCloud, OneDrive, or Google Drive.
- Put the Clerk user export inside that workdir and pass it as `--export`.
- Connection settings are `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE`. The password comes from the prompt, or from `~/.pgpass` when that file is mode `0600`. SSL uses `require`. Set `PGSSLMODE=verify-full` and `PGSSLROOTCERT` to a CA file when you want the Supabase CA checked.
- The script refuses port `6543` (the transaction pooler).

## Freeze notes

`backup --apply` writes `freeze-start` in UTC and `FREEZE-NOTES.txt` in the workdir.

Remap and rollback lock the eight tables that store a Clerk user id. Each lock can wait up to 10 seconds, so the worst case is about 80 seconds. Reads keep working. Writes wait until the transaction ends.

`mark-cutover` records the moment the `pk_live_` Production deployment goes live. That timestamp is not `freeze-start`.

`purge-export` deletes the Clerk user export, which holds password hashes, once 24 hours have passed after `cutover`. It refuses to run when `cutover` has not been recorded. The database dump and the generated `dev_users.csv` and `prod_users.csv` stay until `cleanup`, which is allowed 14 days after the same `cutover`.

Rollback is refused 24 hours after `cutover`, or after the first acceptance since `cutover`. Before `cutover` is recorded, that cutoff has not started.

## Modes

| Mode | What `--apply` changes |
|---|---|
| `preflight` | Nothing. Checks tools, the pinned commit, the database, and the schema guard. |
| `backup` | Writes a custom-format dump and `freeze-start`. |
| `import --export` | Imports users with the pinned tool. Refuses to start when any production user has no `externalId`. |
| `build-map --export` | Loads the id map and the remap functions. |
| `remap` | Rewrites the eight user-id columns to production ids. |
| `verify [--reverse]` | Read-only either way. |
| `freeze-check` | Read-only list of acceptances since `freeze-start`, in Melbourne time. |
| `revoke-dev-sessions` | Revokes active development-instance sessions. |
| `demote-dev-admins --keep` | Sets other development admins to `member`, merging only the role key. |
| `restore-dev-roles --export` | Puts development roles back. Users missing from the export are listed and left alone. |
| `rollback [--orphans-to]` | Checks the reverse remap, then revokes pending production invitations, then remaps ids back. Refuses 24 hours after `cutover`, or after the first acceptance since `cutover`. |
| `mark-cutover` | Records the UTC time the `pk_live_` Production deployment goes live. |
| `purge-export` | Deletes the user export 24 hours after `cutover`. Refuses when `cutover` is missing. |
| `cleanup` | Drops the `clerk_migration` schema and deletes the workdir, 14 days after `cutover`. |

`preflight`, `remap`, and `rollback` stop when the latest applied Prisma migration is not `20261002041000_add_proposal_list_indexes`, or when `prisma/schema.prisma` differs from commit `9acabc8`. The error says the user-id column list must be re-checked before the script is run.

`--apply` prints the database host, database name, eight table counts, and business name, then asks you to type the Supabase project ref (`db.<ref>.supabase.co`) or, on any other host, the database name. A Clerk write prints the user count and the first three emails, then asks you to type the user count. A wrong answer stops before anything is changed.

## Re-running a partial import

The pinned tool sets each imported user's `externalId` to that person's development user id. If an import stops part way through, run the same `import --apply` again with the same export. The script always sends the whole file. It does not pass `--resume-after`.

Users who were already created fail one at a time (duplicate email). The tool logs that failure and keeps going, and it can still exit 0. This script moves those logs into the workdir. It aborts if the tool directory is dirty afterwards.

Import will not start when the production instance already has a user with no `externalId`. Leave users who already have an `externalId` in place.

## Preview deploys

Preview builds fail without Clerk development keys (`pk_test_` and `sk_test_`) and a `DATABASE_URL`. Set `PRODUCTION_DB_HOST` to the production database host or Supabase project ref. That value is not a secret and is not a connection string. The host parsed from `DATABASE_URL` must be different. See `SETUP.md`.

## Tests

```bash
scripts/clerk-migration/test/test-remap.sh
scripts/clerk-migration/test/test-guards.sh
scripts/clerk-migration/test/test-dry-run.sh
```

`test-remap.sh` builds a throwaway local Postgres. Point `PGBIN` at your `initdb` directory if it is not found automatically.
