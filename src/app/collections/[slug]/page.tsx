import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { HomeProductCard } from "@/components/storefront/home-product-card";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreImage } from "@/components/storefront/store-image";
import { collectionLabel } from "@/components/storefront/types";
import { getPublicCollection, listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import styles from "@/components/storefront/home.module.css";

export const instant = false;

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const [collection, categories, products] = await Promise.all([
    getPublicCollection(slug),
    listVisibleCategories(),
    listHomepageProducts(),
  ]);
  if (!collection) notFound();

  const name = collectionLabel(collection.name);

  return (
    <div className={styles.home}>
      <StoreHeader homepage={false} categories={categories} products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content" className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-16 pt-8 sm:px-8 sm:pt-10">
        <Link className="inline-flex min-h-11 items-center gap-2 text-xs text-muted hover:text-accent" href="/collections"><ArrowLeft size={15} aria-hidden="true" /> All collections</Link>
        <div className="mb-7 mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The collection</p>
            <h1 className="mt-3 break-words font-serif text-5xl leading-tight sm:text-6xl">{name}</h1>
          </div>
          <p className="text-xs text-muted">{collection.products.length} {collection.products.length === 1 ? "dress" : "dresses"}</p>
        </div>

        {collection.images.length > 0 && (
          <div className={`grid gap-1 ${collection.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {collection.images.map((image) => (
              <div className={`relative overflow-hidden bg-surface-muted ${collection.images.length > 1 ? "aspect-[3/4] sm:aspect-[4/3]" : "aspect-[4/3] sm:aspect-[16/7]"}`} key={image.id}>
                <StoreImage alt={collection.name} className="object-cover object-[center_35%]" fill loading="eager" sizes={collection.images.length > 1 ? "50vw" : "100vw"} src={image.url} />
              </div>
            ))}
          </div>
        )}

        <section className="mt-10 sm:mt-14" aria-labelledby="collection-dresses">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="font-serif text-3xl sm:text-4xl" id="collection-dresses">The dress edit</h2>
            <Link className="inline-flex min-h-11 items-center gap-2 text-xs text-accent" href="/collections">Explore collections <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          {collection.products.length ? (
            <div className={styles.productGrid}>
              {collection.products.map((product) => <HomeProductCard key={product.id} product={product} />)}
            </div>
          ) : <p className="py-6 text-sm text-muted">There are no dresses in this collection yet.</p>}
        </section>
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}
