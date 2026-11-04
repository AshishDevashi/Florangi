import Image from "next/image";
import Link from "next/link";
import { formatPaise } from "@/server/domain/money";

type Product = {
  name: string;
  slug: string;
  type: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  basePricePaise: number;
  customizationFeePaise: number | null;
  images: Array<{ url: string; position: number }>;
  variants: Array<{ unitPricePaise: number; available: number }>;
};

export function ProductCard({ product }: { product: Product }) {
  const prices = product.type === "DESIGNER_DRESS"
    ? product.variants.map((variant) => variant.unitPricePaise)
    : [product.basePricePaise + (product.customizationFeePaise ?? 0)];
  const minimumPrice = Math.min(...prices);
  const hasDifferentPrices = new Set(prices).size > 1;
  const image = product.images[0]?.url ?? "/images/demo-dress.svg";

  return (
    <article>
      <Link aria-label={`View ${product.name}`} className="group block" href={`/products/${product.slug}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
          <Image alt={product.name} className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" fill sizes="(max-width: 768px) 50vw, 25vw" src={image} unoptimized />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium leading-5 group-hover:underline">{product.name}</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{product.type === "CUSTOM_DRESS" ? "Custom" : "Ready to ship"}</p>
          </div>
          <p className="shrink-0 text-sm">{hasDifferentPrices ? "From " : ""}{formatPaise(minimumPrice)}</p>
        </div>
      </Link>
    </article>
  );
}