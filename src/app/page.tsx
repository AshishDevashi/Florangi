import Link from "next/link";
import { connection } from "next/server";
import { ProductCard } from "@/components/catalog/product-card";
import { listFeaturedProducts, listVisibleCategories } from "@/server/services/catalog";

export const instant = false;

export default async function HomePage() {
  await connection();
  const [categories, products] = await Promise.all([listVisibleCategories(), listFeaturedProducts()]);

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Florangi home" className="font-serif text-2xl font-medium tracking-wide">Florangi</Link>
        <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm">
          <Link className="text-muted hover:text-[var(--foreground)]" href="/track-order">Track order</Link>
          <Link className="text-muted hover:text-[var(--foreground)]" href="/cart">Bag</Link>
        </nav>
      </header>
      <section className="mx-auto grid min-h-[72vh] w-full max-w-7xl content-center px-5 py-16 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Occasionwear, made personal</p>
        <h1 className="mt-5 max-w-3xl font-serif font-normal text-5xl leading-[1.08] sm:text-7xl">A dress that feels like it was made for you.</h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted">Explore designer pieces and made-to-measure dresses, thoughtfully created in India.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link className="bg-accent px-5 py-3 text-sm font-semibold text-on-accent hover:bg-accent-hover" href="#collections">Shop dresses</Link>
          <Link className="border border-border-strong px-5 py-3 text-sm font-semibold hover:border-accent" href="/cart">View bag</Link>
        </div>
      </section>
      <section className="border-t border-border bg-surface/70" id="collections">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Collections</p>
              <h2 className="mt-2 font-serif text-3xl">Find your next favorite</h2>
            </div>
            <nav aria-label="Collections" className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Link className="border border-border-strong px-3 py-2 text-sm hover:border-accent" href={`/collections/${category.slug}`} key={category.id}>
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
          {products.length === 0 ? (
            <p className="mt-8 border-t border-border py-6 text-sm text-muted">New pieces are being prepared.</p>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          )}
        </div>
      </section>
      <footer className="border-t border-border px-5 py-5 text-center text-xs text-muted">
        <p>Florangi · India</p>
        <nav aria-label="Policies and support" className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link className="underline" href="/shipping">Shipping</Link>
          <Link className="underline" href="/replacement">Replacements</Link>
          <Link className="underline" href="/privacy">Privacy</Link>
          <Link className="underline" href="/terms">Terms</Link>
          <Link className="underline" href="/contact">Contact</Link>
        </nav>
      </footer>
    </main>
  );
}
