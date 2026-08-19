# Encrypted backup and restore drill

Production uses encrypted PostgreSQL physical/WAL backups with a core-transaction RPO of at most five minutes and cross-fault-domain retention. The repository scripts are the portable logical verification path; they do not replace continuous WAL archiving.

## Create the drill backup

1. Use a controlled, production-shaped drill database with business writes frozen. Include at least one completed customer-deletion case so restore replay is observable. Do not use this logical snapshot procedure as the production backup scheduler.
2. Set `DATABASE_URL`, `BACKUP_ENCRYPTION_RECIPIENT` and `BACKUP_DRILL_WRITE_FROZEN=true` in the controlled runner.
3. Run `ops/scripts/backup-postgres.ps1 -OutputDirectory <evidence-directory>`.
4. Preserve both the encrypted `.dump.age` file and its `.manifest.json`. The manifest records start/completion time, encrypted hash and a per-tenant financial snapshot covering orders, verified payments, successful refunds, verification use and reward entries/grants. It contains no connection string or encryption identity.

## Restore and verify

1. Record the simulated failure time in UTC and set it as `DRILL_FAILURE_TIME_UTC`. Set `RESTORE_ADMIN_URL` and `AGE_IDENTITY_FILE` only in the controlled runner.
2. Choose a database name matching `lequ_restore_[a-z0-9_]+` that does not exist. Choose a new `.json` report path; the script refuses to replace existing evidence.
3. Run `ops/scripts/restore-verify.ps1 -EncryptedBackup <file.dump.age> -TargetDatabase <lequ_restore_name> -ReportPath <new-report.json>`.
4. The script verifies the encrypted hash, decrypts only to an OS temporary file, creates a fresh database, restores with fail-fast options, enqueues deletion replay, compares the restored per-tenant financial digest with the backup manifest and runs every SQL fixture including RLS and immutable-ledger checks.
5. The report records backup/failure/restore times, measured RPO/RTO, hash and financial comparison, privacy replay count and the exact fixture list. PASS requires RPO at most 300 seconds and RTO at most 3,600 seconds.

The restored database remains available for approver inspection and must never be promoted automatically. Separately sample object-store, search, vector and cache deletion receipts and attach the WAL/physical-backup evidence. Promotion is prohibited on an unexplained one-cent difference, missing deletion replay, failed audit immutability, cross-tenant result, absent report or failed result.
