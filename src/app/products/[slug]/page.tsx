import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowUpRight, ChevronDown, ChevronRight, MessageCircle, Package, Ruler } from "lucide-react";
import { z } from "zod";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { ProductDetails } from "@/components/catalog/product-details";
import { ProductOptions } from "@/components/catalog/product-options";
import { HomeProductCard } from "@/components/storefront/home-product-card";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { collectionLabel } from "@/components/storefront/types";
import { parseMeasurementRanges, type MeasurementRanges } from "@/server/domain/measurements";
import { getPublicProduct, listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import { getEffectiveSetting } from "@/server/services/settings";
import shell from "@/components/storefront/home.module.css";
import styles from "@/components/catalog/product.module.css";

export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const [product, categories, catalog, replacementSetting] = await Promise.all([
    getPublicProduct(slug),
    listVisibleCategories(),
    listHomepageProducts(),
    getEffectiveSetting("replacement_window_hours"),
  ]);
  if (!product) notFound();

  let measurementRanges: MeasurementRanges | undefined;
  if (product.type === "CUSTOM_DRESS") {
    const setting = await getEffectiveSetting("measurement_ranges");
    try { measurementRanges = parseMeasurementRanges(setting?.value); } catch { /* Ordering stays disabled until valid ranges are configured. */ }
  }
  const custom = product.type === "CUSTOM_DRESS";
  const preview = product.description.includes("[UI PREVIEW]");
  const description = product.description.split("[UI PREVIEW]")[0].trim();
  const replacement = z.object({ hours: z.number().int().positive() }).safeParse(replacementSetting?.value ?? { hours: 96 });
  const replacementWindow = replacement.success
    ? replacement.data.hours % 24 === 0 ? `${replacement.data.hours / 24} days` : `${replacement.data.hours} hours`
    : null;
  const alternatives = catalog.filter((item) => item.id !== product.id);
  const related = [
    ...alternatives.filter((item) => item.category.slug === product.category.slug),
    ...alternatives.filter((item) => item.category.slug !== product.category.slug),
  ].slice(0, 4);

  return (
    <div className={`${shell.home} ${styles.productPage}`}>
      <StoreHeader homepage={false} categories={categories} products={catalog.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content">
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/">Home</Link><ChevronRight size={11} aria-hidden="true" />
          <Link href={`/collections/${product.category.slug}`}>{collectionLabel(product.category.name)}</Link>
          <ChevronRight size={11} aria-hidden="true" /><span aria-current="page">{product.name}</span>
        </nav>

        <article className={styles.productLayout}>
          <ProductGallery key={product.id} images={product.images} name={product.name} />
          <ProductDetails>
            <div className={styles.purchasePanel}>
              <Link className={styles.collectionLink} href={`/collections/${product.category.slug}`}>{collectionLabel(product.category.name)} <ArrowUpRight size={12} aria-hidden="true" /></Link>
              <ProductOptions key={product.id} product={product} measurementRanges={measurementRanges} />

              <div className={styles.dispatchNote}>
                <Package size={19} strokeWidth={1.4} aria-hidden="true" />
                <div><span>Estimated dispatch</span><p>{custom ? "7–10 days" : "24–48 hours"} after approval</p></div>
              </div>
              <div className={styles.accordions}>
                <details open>
                  <summary>The details <ChevronDown size={17} aria-hidden="true" /></summary>
                  <div className={styles.accordionBody}><p className={styles.description}>{description}</p>{preview && <p className={styles.previewNote}>Part of our preview catalog. Sizes and prices are for design preview.</p>}</div>
                </details>
                <details>
                  <summary>Size & fit <ChevronDown size={17} aria-hidden="true" /></summary>
                  <div className={styles.accordionBody}><p>{custom ? "Created to your measurements. Enter your measurements above and add any fit notes before placing your order." : "Choose from the available sizes above. Need the measurements for a specific size? Contact us before ordering and we’ll help you find your fit."}</p><Link href="/contact">Ask about sizing <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
                </details>
                <details>
                  <summary>Delivery & replacements <ChevronDown size={17} aria-hidden="true" /></summary>
                  <div className={styles.accordionBody}>
                    <p>Dispatch target: {custom ? "7–10 days" : "24–48 hours"} after order approval. This is a dispatch estimate, rather than an arrival date. Delivery charges are calculated at checkout.</p>
                    <p>{replacementWindow ? `Replacement requests can be submitted within ${replacementWindow} of recorded delivery, subject to eligibility and policy terms.` : "See the replacement policy for eligibility and request windows."}</p>
                    <Link href="/shipping">Shipping information <ArrowUpRight size={13} aria-hidden="true" /></Link>
                    <Link href="/replacement">Replacement policy <ArrowUpRight size={13} aria-hidden="true" /></Link>
                  </div>
                </details>
              </div>
              <Link className={styles.contactLink} href="/contact"><MessageCircle size={17} strokeWidth={1.4} aria-hidden="true" />A little help finding the one? <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
          </ProductDetails>
        </article>

        {related.length > 0 && <section className={styles.related} aria-labelledby="related-title">
          <div className={shell.sectionHeading}><h2 id="related-title">You might also fall for</h2><Link className={shell.textLink} href={`/collections/${product.category.slug}`}>Explore the collection <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
          <div className={shell.productGrid}>{related.map((item) => <HomeProductCard product={item} key={item.id} />)}</div>
        </section>}
        <div className={styles.productCare}>
          <span><Ruler size={17} strokeWidth={1.4} aria-hidden="true" />Find a fit that feels like you</span>
          <Link href="/contact">Here to help <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
      </main>
      <StoreFooter homepage={false} preview={preview} />
    </div>
  );
}
