# Backup and Restore

The values below are proposed operational targets from OPS-3, not owner-approved guarantees: encrypted daily backups, 14-day retention, recovery point within 24 hours, and restore within 8 hours. Confirm hosting, budget, retention and target objectives before production.

## Backup

1. Schedule a database-consistent PostgreSQL dump at least daily. Use custom format and keep the output encrypted at rest in storage separate from the database host.
2. Back up `public/uploads/` and `storage/private/` for local storage. Private replacement photos contain personal information and require access controls matching the database backup.
3. Keep provider credentials out of dumps and source control. Back up environment configuration only through the approved secrets manager.
4. Record backup timestamp, database version, migration version, file counts and byte totals. Alert the owner when a backup fails.

Example database dump command:

```sh
pg_dump "$DATABASE_URL" --format=custom --file="florangi-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

## Restore rehearsal

1. Restore the dump into an isolated PostgreSQL instance; never test restore over production.
2. Apply or verify committed Prisma migrations and confirm the restored migration ledger.
3. Restore matching public/private files and verify representative product images and access-controlled replacement photos.
4. Check orders, address/measurement snapshots, payment/refund IDs, inventory reservations, audit history and email jobs.
5. Run `npm run db:validate` and `npm run typecheck`, then verify critical workflows against the isolated restored instance without contacting live payment or email providers.
6. Record elapsed recovery time, missing records, corrective actions and the next rehearsal date.

Before a production migration, take and verify a fresh backup and document a rollback or forward-fix path (DAT-2). The Cloudinary migration procedure is in [storage-migration.md](storage-migration.md).