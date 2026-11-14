# Storage Migration

Local uploads are stored under `public/uploads/` for product and category images and `storage/private/` for replacement photos. Database rows keep provider/key references; the configured storage adapter creates URLs at read time.

## Migration to Cloudinary

Public preview product and category images have been migrated and their delivery verified with the configured Cloudinary account. Authenticated replacement-photo delivery and production rollback still require credentialed staging verification. Before using it in staging:

1. Configure separate staging Cloudinary credentials and set `STORAGE_DRIVER=cloudinary`.
2. Take a database backup and copy all local upload directories to a protected migration host.
3. Run `npm run storage:migrate-cloudinary` with the source database and Cloudinary credentials available. The script uploads each file and updates the database reference only after the upload succeeds.
4. Verify product and category images on public routes and replacement photos through authenticated, expiring application links; compare record counts and byte totals. A signed link also requires the admin session or the relevant guest-order access cookie.
5. Keep the local backup until staging verification and production rollback approval are complete.

The migration script is resumable: rows already using Cloudinary are skipped. It does not delete local files. Remove old files only after a separate verified backup/retention decision. Cloudinary behavior, authenticated delivery, and rollback must be verified with a staging account before production use.

## Website-derived preview images

The preview import originally used `static` references under `public/images/fixtures/florangi/`, which the general local-upload migration does not handle. A development-only migration targets the manifest's product and category slugs:

```powershell
npm run storage:migrate-preview
npm run storage:migrate-preview -- --apply
npm run storage:migrate-preview -- --apply --remove-local
```

The dry run reports pending records. Applying copies original files and reference metadata into the ignored `test-results/cloudinary-preview-backup/` directory, uploads each image to its own Cloudinary key, verifies delivery and dimensions, then switches its database reference with an audit entry. It resumes by skipping Cloudinary rows. The removal option first verifies every target's Cloudinary delivery and checks for remaining static references and order snapshots before removing only manifest-listed original files.

The completed migration contains 87 product image records and 12 category image records. All 99 Cloudinary deliveries were verified before removing the 87 unique public source files. No replacement photos existed during this migration. Keep the ignored rollback backup separately protected; it is not a committed or off-machine backup. Future preview imports upload directly to Cloudinary.
