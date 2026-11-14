# Florangi storefront preview catalog

These are development-only UI fixtures copied with the owner's authorization from the public catalog at [florangi.com](https://florangi.com/). The site served gown pages and a sitemap when retrieved, rather than Shopify's public collection/product JSON endpoints.

## Contents and mapping

- 17 products with published names, short descriptions and starting prices in INR.
- Six categories prefixed `PREVIEW`: The Rustic Collection, Cocktail, Celebration, Engagement, Black tie and Bridal reception. The named collection takes precedence; other groups use the source's occasion tags. These are preview groupings, not an exported Shopify collection hierarchy.
- 87 WebP product photographs and 12 category covers stored in Cloudinary, resized to fit within 1200 × 1600 without upscaling. Category covers use photos from the corresponding group, with independent storage keys so deleting a cover cannot break a product photograph.
- The manifest at `prisma/fixtures/florangi-catalog.json` records source URLs, SKUs, price ranges, collection/occasion labels and image provenance.

The source gowns are made to order and quote price ranges. With the owner's approval, these fixtures use the app's designer-dress model and XS/S/M variants with **zero stock**, so they can appear in the storefront without inventing available inventory or a custom-dress fee. Their descriptions explicitly identify this mapping as a UI preview. The displayed base price is the published starting price, not a final made-to-measure quote. Products with zero availability cannot be purchased until inventory is deliberately configured.

## Import

Requires `NODE_ENV=development`, a configured database, the existing configured admin and `STORAGE_DRIVER=cloudinary` with valid Cloudinary credentials. Source images must remain available from the public source website; local image files are not required.

```powershell
npm run catalog:preview
npm run catalog:preview -- --apply
```

The first command is a read-only dry run. The second downloads and optimizes missing images in memory, uploads them to Cloudinary, then imports new preview records transactionally and records audit entries. Failed imports attempt to remove unreferenced staged uploads. Existing product slugs are skipped without updating their contents, stock or images. Existing categories retain their visibility and content; empty preview category image slots may be populated. The script does not change settings, orders, payments or existing stock. Preview imports are refused in production.

Products use `preview-` slugs; categories use `preview-` slugs and visible `PREVIEW` names. The manifest's original local image keys remain provenance only; database records now hold Cloudinary keys. The original public files were removed after verifying all 99 Cloudinary deliveries, with a rollback copy under the ignored `test-results/cloudinary-preview-backup/` directory. See [storage migration](storage-migration.md) for the migration command.

After the initial zero-stock import, the owner explicitly set all 51 demo variants to three units each. Re-running the importer preserves that inventory; new imports still default to zero. Review the model, category grouping, final prices, stock and approved policies before using any of these records for launch.
