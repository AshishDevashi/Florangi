import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ProductCard } from "@/components/catalog/product-card";
import { getPublicCollection } from "@/server/services/catalog";

export const instant = false;

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const collection = await getPublicCollection(slug);
  if (!collection) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <Link className="font-serif text-2xl font-medium" href="/">Florangi</Link>
        <nav aria-label="Store navigation" className="flex gap-5 text-sm"><Link className="underline" href="/cart">Bag</Link></nav>
      </header>
      <section className="py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Collection</p>
        <h1 className="mt-2 font-serif text-4xl">{collection.name}</h1>
        {collection.images.length > 0 && <div className="mt-6 grid gap-4 sm:grid-cols-2">{collection.images.map((image) => <div className="relative aspect-[4/3] overflow-hidden bg-surface-hover" key={image.id}><Image alt={collection.name} className="object-cover" fill sizes="(max-width: 640px) 100vw, 50vw" src={image.url} unoptimized /></div>)}</div>}
        {collection.products.length === 0 ? (
          <p className="mt-8 border-t border-border py-6 text-sm text-muted">There are no dresses in this collection yet.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
            {collection.products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </section>
    </main>
  );
}