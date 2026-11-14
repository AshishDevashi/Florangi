"use client";

import { useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductCard } from "./home-product-card";
import { collectionLabel, type HomeCategory, type HomeProduct } from "./types";
import styles from "./home.module.css";

export function HomeEdit({ products, categories }: { products: HomeProduct[]; categories: HomeCategory[] }) {
  const [category, setCategory] = useState("");
  const [visible, setVisible] = useState(8);
  const filtered = category ? products.filter((product) => product.category.slug === category) : products;
  const filters = categories.filter((item) => products.some((product) => product.category.slug === item.slug));

  return (
    <section className={styles.section} id="the-edit" aria-labelledby="edit-title">
      <div className={styles.sectionHeading}>
        <h2 id="edit-title">The dress edit</h2>
        <span className={styles.sectionCount}>{products.length} styles to discover</span>
      </div>
      <div className={styles.filters} role="group" aria-label="Filter dresses by collection">
        {[{ slug: "", name: "All dresses" }, ...filters].map((item) => (
          <Button
            key={item.slug}
            variant="ghost"
            aria-pressed={category === item.slug}
            onClick={() => { setCategory(item.slug); setVisible(8); }}
            className={`${styles.filter} ${category === item.slug ? styles.activeFilter : ""}`}
          >
            {collectionLabel(item.name)}
          </Button>
        ))}
      </div>
      <p className="sr-only" role="status">Showing {Math.min(visible, filtered.length)} of {filtered.length} dresses{category ? ` in ${collectionLabel(filters.find((item) => item.slug === category)?.name ?? "")}` : ""}.</p>
      {filtered.length ? <div className={styles.productGrid}>{filtered.slice(0, visible).map((product) => <HomeProductCard product={product} key={product.id} />)}</div> : <p className={styles.empty}>Something beautiful is on its way. Explore our collections below.</p>}
      {filtered.length > visible && <div className={styles.loadMore}><Button variant="secondary" className={styles.outlineButton} onClick={() => setVisible((count) => count + 4)}>Discover more dresses <ArrowDown size={16} aria-hidden="true" /></Button><span>{Math.min(visible, filtered.length)} of {filtered.length} pieces</span></div>}
    </section>
  );
}
