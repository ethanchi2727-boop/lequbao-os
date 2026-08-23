# Encrypted backup and restore drill

Production uses encrypted PostgreSQL physical/WAL backups with a core-transaction RPO of at most five minutes and cross-fault-domain retention. The repository scripts are the portable logical verification path; they do not replace continuous WAL archiving.

## Create the drill backup

1. Use a controlled, production-shaped drill database with business writes frozen. Include at least one completed customer-deletion case so restore replay is observable. Do not use this logical snapshot procedure as the production backup scheduler.
2. Set `DATABASE_URL`, `BACKUP_ENCRYPTION_RECIPIENT` and `BACKUP_DRILL_WRITE_FROZEN=true` in the controlled runner.
3. Run `ops/scripts/backup-postgres.ps1 -OutputDirectory <evidence-directory>`. The unencrypted custom-format dump exists only under the OS temporary directory during the command. On a handled failure, the script removes the temporary dump and any incomplete encrypted/manifest pair it created.
4. Preserve both the encrypted `.dump.age` file and its `.manifest.json`. JSON evidence is emitted as UTF-8 without a byte-order mark for identical strict parsing across PowerShell versions. The manifest records start/completion time, encrypted hash and a typed per-tenant financial snapshot covering every tenant; tenants without current facts remain present with an empty metric object. Metrics cover orders, verified payments, successful refunds, verification use and reward entries/grants. It contains no connection string or encryption identity.

## Restore and verify

1. Record the already-reached simulated failure time in canonical millisecond UTC form (`yyyy-MM-ddTHH:mm:ss.fffZ`) and set it as `DRILL_FAILURE_TIME_UTC`. A future failure time is rejected so RTO cannot become negative. Set `RESTORE_ADMIN_URL` and `AGE_IDENTITY_FILE` only in the controlled runner.
2. Choose a database name matching `lequ_restore_[a-z0-9_]+` that does not exist. Choose a new `.json` report path; the script refuses to replace existing evidence.
3. Run `ops/scripts/restore-verify.ps1 -EncryptedBackup <file.dump.age> -TargetDatabase <lequ_restore_name> -ReportPath <new-report.json>`.
4. The script requires the exact manifest schema and native JSON types, then verifies the backup filename, positive byte size and lowercase SHA-256 values before decrypting only to an OS temporary file. It creates a fresh database, restores with fail-fast options, enqueues deletion replay, compares the restored per-tenant financial digest with the backup manifest and runs every SQL fixture including RLS and immutable-ledger checks.
5. The report records backup/failure/restore times, measured RPO/RTO, the exact encrypted-artifact and financial-snapshot SHA-256 values repeated from the manifest, verification booleans, privacy replay count and the exact fixture list. PASS requires both hashes to match the manifest, the complete current set of 23 SQL fixtures with no omissions or additions, at least one privacy replay task, RPO at most 300 seconds and RTO at most 3,600 seconds. The evidence verifier independently derives the fixture set from `database/tests` and recomputes RPO/RTO from the recorded timeline.

The restored database remains available for approver inspection and must never be promoted automatically. Separately sample object-store, search, vector and cache deletion receipts with zero remaining matches and attach a structured cross-fault-domain WAL/physical-backup timeline. Promotion is prohibited on an unexplained one-cent difference, mismatched artifact/snapshot hash, missing deletion replay, failed audit immutability, cross-tenant result, absent report or failed result.
