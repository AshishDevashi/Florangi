import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ProductOptions } from "@/components/catalog/product-options";
import { formatPaise } from "@/server/domain/money";
import { getPublicProduct } from "@/server/services/catalog";

export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const product = await getPublicProduct(slug);
  if (!product) notFound();

  const image = product.images[0]?.url ?? "/images/demo-dress.svg";
  const price = product.type === "CUSTOM_DRESS"
    ? product.basePricePaise + (product.customizationFeePaise ?? 0)
    : Math.min(...product.variants.map((variant) => variant.unitPricePaise));

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-stone-200 pb-5">
        <Link className="font-serif text-2xl font-semibold" href="/">Florangi</Link>
        <nav aria-label="Store navigation" className="flex gap-5 text-sm"><Link className="underline" href="/cart">Bag</Link></nav>
      </header>
      <nav aria-label="Breadcrumb" className="py-5 text-sm text-[var(--muted)]">
        <Link className="underline" href={`/collections/${product.category.slug}`}>{product.category.name}</Link>
      </nav>
      <article className="grid gap-8 pb-12 md:grid-cols-2 md:gap-14">
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
          <Image alt={product.name} className="object-cover" fill priority sizes="(max-width: 768px) 100vw, 50vw" src={image} unoptimized />
        </div>
        <div className="py-2 md:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            {product.type === "CUSTOM_DRESS" ? "Made to measure" : "Ready to ship"}
          </p>
          <h1 className="mt-3 font-serif text-4xl">{product.name}</h1>
          <p className="mt-4 text-lg">{product.type === "DESIGNER_DRESS" && product.variants.length > 1 ? "From " : ""}{formatPaise(price)}</p>
          <p className="mt-6 whitespace-pre-line text-sm leading-7 text-[var(--muted)]">{product.description}</p>
          <ProductOptions product={product} />
          <div className="mt-8 border-t border-stone-200 pt-5 text-sm leading-6">
            <p>Dispatch: {product.type === "CUSTOM_DRESS" ? "7–10 days after approval" : "24–48 hours after approval"}</p>
            <p className="mt-2">Replacement requests are available for 4 days after delivery.</p>
          </div>
        </div>
      </article>
    </main>
  );
}