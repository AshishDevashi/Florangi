import { connection } from "next/server";
import { CollectionCard } from "@/components/storefront/collection-card";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
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
              <CollectionCard
                category={category}
                loading={eagerImages.has(category.images[0]?.url ?? "/images/demo-dress.svg") ? "eager" : "lazy"}
                key={category.id}
              />
            ))}
          </section>
        ) : <p className="mt-10 border-t border-border py-6 text-sm text-muted">New collections are on their way.</p>}
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}
