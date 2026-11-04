# Storage Migration

Local uploads are stored under `public/uploads/` for product images and `storage/private/` for replacement photos. Database rows keep provider/key references; the configured storage adapter creates URLs at read time.

## Migration to Cloudinary

Cloudinary is scaffolded but has not been validated with account credentials. Before using it in staging:

1. Configure separate staging Cloudinary credentials and set `STORAGE_DRIVER=cloudinary`.
2. Take a database backup and copy all local upload directories to a protected migration host.
3. Run `npm run storage:migrate-cloudinary` with the source database and Cloudinary credentials available. The script uploads each file and updates the database reference only after the upload succeeds.
4. Verify product images on public routes and replacement photos through authenticated, expiring links; compare record counts and byte totals.
5. Keep the local backup until staging verification and production rollback approval are complete.

The migration script is resumable: rows already using Cloudinary are skipped. It does not delete local files. Remove old files only after a separate verified backup/retention decision. Cloudinary behavior, authenticated delivery, and rollback remain untested until real staging credentials are configured.