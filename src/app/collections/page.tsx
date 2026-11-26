import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreImage } from "@/components/storefront/store-image";
import { collectionLabel } from "@/components/storefront/types";
import { listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import styles from "@/components/storefront/home.module.css";

export const instant = false;
export const metadata = { title: "Collections | Florangi" };

export default async function CollectionsPage() {
  await connection();
  const [categories, products] = await Promise.all([listVisibleCategories(), listHomepageProducts()]);
  const eagerImages = new Set(categories.slice(0, 3).map((category) => category.images[0]?.url ?? "/images/demo-dress.svg"));

  return (
    <div className={styles.home}>
      <StoreHeader homepage={false} categories={categories} products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content" className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-16 pt-10 sm:px-8 sm:pt-14">
        <h1 className="text-center font-serif text-5xl leading-tight sm:text-6xl">Our collection</h1>
        {categories.length ? (
          <section aria-label="All collections" className={styles.collectionsGrid}>
            {categories.map((category) => (
              <Link className={styles.collectionCard} href={`/collections/${category.slug}`} key={category.id}>
                <StoreImage
                  src={category.images[0]?.url ?? "/images/demo-dress.svg"}
                  alt=""
                  fill
                  loading={eagerImages.has(category.images[0]?.url ?? "/images/demo-dress.svg") ? "eager" : "lazy"}
                  sizes="(max-width: 700px) 100vw, 33vw"
                  className={styles.coverImage}
                />
                <div className={styles.collectionCardCaption}>
                  <h2>{collectionLabel(category.name)}</h2>
                  <span className={styles.collectionCardAction}>
                    <span>Explore collection</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </section>
        ) : <p className="mt-10 border-t border-border py-6 text-sm text-muted">New collections are on their way.</p>}
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}
