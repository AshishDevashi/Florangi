import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { CampaignCard } from "@/components/storefront/campaign-card";
import { HomeEdit } from "@/components/storefront/home-edit";
import { HomeProductCard } from "@/components/storefront/home-product-card";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreImage } from "@/components/storefront/store-image";
import { collectionLabel } from "@/components/storefront/types";
import { listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import styles from "@/components/storefront/home.module.css";

export const instant = false;

export default async function HomePage() {
  await connection();
  const [categories, products] = await Promise.all([listVisibleCategories(), listHomepageProducts()]);
  const collection = categories.find((category) => /rustic/i.test(category.name)) ?? categories[0];
  const bridal = categories.find((category) => /bridal/i.test(category.name));
  const campaigns = categories.filter((category) => category.id !== collection?.id && category.id !== bridal?.id).slice(0, 2);
  const heroImage = collection?.images[0]?.url ?? products[0]?.images[0]?.url;
  const companionImage = collection?.images[1]?.url;
  const heroName = collectionLabel(collection?.name ?? "The Florangi edit");
  const collectionHref = collection ? `/collections/${collection.slug}` : "#the-edit";
  const spotlight = products.slice(-4).reverse();

  return (
    <div className={styles.home} id="top">
      <StoreHeader
        products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))}
        categories={categories}
      />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.heroImages} ${companionImage ? "" : styles.singlePhoto}`}>
            <div className={styles.heroPhoto}>
              <StoreImage
                src={heroImage ?? "/images/demo-dress.svg"}
                alt={`${heroName} — Florangi occasionwear`}
                fill
                preload
                sizes="(max-width: 700px) 100vw, 50vw"
                className={styles.coverImage}
              />
            </div>
            {companionImage && (
              <div className={styles.heroCompanion}>
                <StoreImage src={companionImage} alt={`Another look from ${heroName}`} fill loading="eager" sizes="50vw" className={styles.coverImage} />
              </div>
            )}
          </div>
          <div className={styles.heroCaption}>
            <p>The collection</p>
            <h1 id="hero-title">{heroName}</h1>
            <Link href={collectionHref} className={buttonStyles({ variant: "primary", className: styles.campaignButton })}>
              Shop the collection <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className={`${styles.section} ${styles.collectionSection}`} id="collections" aria-labelledby="collections-title">
          <div className={styles.sectionHeading}>
            <h2 id="collections-title">Find your occasion</h2>
            <Link href="#the-edit" className={styles.textLink}>Shop all dresses <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          {categories.length ? (
            <nav className={styles.collectionGallery} aria-label="Shop collections">
              {categories.map((category) => (
                <Link href={`/collections/${category.slug}`} className={styles.collectionTile} key={category.id}>
                  <div className={styles.collectionThumb}>
                    <StoreImage
                      src={category.images[0]?.url ?? "/images/demo-dress.svg"}
                      alt=""
                      fill
                      loading={(category.images[0]?.url ?? "/images/demo-dress.svg") === (heroImage ?? "/images/demo-dress.svg") ? "eager" : "lazy"}
                      sizes="(max-width: 700px) 38vw, (max-width: 1000px) 25vw, 17vw"
                      className={styles.coverImage}
                    />
                  </div>
                  <span>{collectionLabel(category.name)} <ArrowUpRight size={13} aria-hidden="true" /></span>
                </Link>
              ))}
            </nav>
          ) : <p className={styles.empty}>New collections are on their way.</p>}
        </section>

        <HomeEdit products={products} categories={categories} />

        <section className={styles.occasionSection} id="occasions" aria-labelledby="occasion-title">
          <div className={styles.campaignHeading}>
            <h2 id="occasion-title">An occasion to dress up.</h2>
            <Link href="/collections" className={styles.textLink}>Explore every collection <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          {campaigns.length ? (
            <div className={styles.campaignGrid}>
              {campaigns.map((category, index) => (
                <CampaignCard category={category} eyebrow={index === 0 ? "After-hours dressing" : "Make an entrance"} key={category.id} />
              ))}
            </div>
          ) : <p className={styles.empty}>Explore the dress edit for your next occasion.</p>}
        </section>

        <section className={`${styles.section} ${styles.spotlightSection}`} id="spotlight" aria-labelledby="spotlight-title">
          <div className={styles.sectionHeading}>
            <h2 id="spotlight-title">In the spotlight</h2>
            <Link href="#the-edit" className={styles.textLink}>Discover the edit <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.productGrid}>
            {spotlight.map((product) => <HomeProductCard product={product} imageIndex={1} key={product.id} />)}
          </div>
        </section>

        {bridal && (
          <section className={styles.bridalSection} aria-labelledby="bridal-title">
            <h2 className="sr-only" id="bridal-title">The bridal reception edit</h2>
            <div className={styles.bridalImages}>
              <CampaignCard category={bridal} eyebrow="Your next chapter" imageIndex={0} wide />
              <Link href={`/collections/${bridal.slug}`} className={styles.bridalDetail} aria-label={`Discover ${collectionLabel(bridal.name)}`}>
                <StoreImage
                  src={bridal.images[1]?.url ?? bridal.images[0]?.url ?? "/images/demo-dress.svg"}
                  alt={`A closer look at ${collectionLabel(bridal.name)}`}
                  fill
                  sizes="(max-width: 700px) 50vw, 40vw"
                  className={styles.coverImage}
                />
                <span>The details make the dress <ArrowUpRight size={17} aria-hidden="true" /></span>
              </Link>
            </div>
          </section>
        )}

        {/* <div className={styles.careLinks}>
          <Link href="/contact">Need help finding the one? <ArrowRight size={14} aria-hidden="true" /></Link>
          <Link href="/shipping">Delivery information <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link href="/track-order">Track your order <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div> */}
      </main>
      <StoreFooter />
    </div>
  );
}
