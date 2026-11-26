import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPaise } from "@/server/domain/money";
import { StoreImage } from "./store-image";
import type { HomeProduct } from "./types";
import styles from "./home.module.css";

export function HomeProductCard({ product, imageIndex = 0, eager = false }: { product: Omit<HomeProduct, "category">; imageIndex?: number; eager?: boolean }) {
  const prices = product.type === "CUSTOM_DRESS"
    ? [product.basePricePaise + (product.customizationFeePaise ?? 0)]
    : product.variants.map((variant) => variant.unitPricePaise);
  const price = prices.length ? Math.min(...prices) : product.basePricePaise;
  const available = product.type === "CUSTOM_DRESS" || product.variants.some((variant) => variant.available > 0);

  return (
    <article className={styles.productCard}>
      <Link href={`/products/${product.slug}`} className={styles.productLink} aria-label={`View ${product.name}`}>
        <div className={styles.productPhoto}>
          <StoreImage src={product.images[imageIndex]?.url ?? product.images[0]?.url ?? "/images/demo-dress.svg"} alt={product.name} fill loading={eager ? "eager" : "lazy"} sizes="(max-width: 700px) 50vw, 25vw" className={styles.coverImage} />
          {product.images.length > 1 && <StoreImage src={product.images[imageIndex === 0 ? 1 : 0].url} alt="" fill sizes="(max-width: 700px) 50vw, 25vw" className={styles.alternateImage} />}
          {!available && <span className={styles.stockBadge}>Sold out</span>}
          <span className={styles.productExplore}>Discover the dress <ArrowUpRight size={16} aria-hidden="true" /></span>
        </div>
        <div className={styles.productDetails}>
          <h3>{product.name}</h3>
          <p>{new Set(prices).size > 1 ? "From " : ""}{formatPaise(price)}</p>
        </div>
      </Link>
      <p className={styles.sizes}>{product.type === "CUSTOM_DRESS" ? "Made to your measurements" : product.variants.length ? product.variants.map((variant) => <span className={variant.available ? undefined : styles.unavailableSize} key={variant.id}>{variant.size}<span className="sr-only">{variant.available ? " available" : " sold out"}</span></span>) : "Currently unavailable"}</p>
    </article>
  );
}
