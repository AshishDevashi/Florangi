"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Menu, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StoreImage } from "./store-image";
import { collectionLabel, type HomeCategory, type HomeProduct } from "./types";
import styles from "./home.module.css";

const navigation = [
  { href: "#the-edit", label: "Shop dresses" },
  { href: "#collections", label: "Collections" },
  { href: "#occasions", label: "Occasion edit" },
  { href: "#spotlight", label: "In the spotlight" },
];

export function StoreHeader({ products, categories, homepage = true }: { products: Pick<HomeProduct, "id" | "name" | "slug" | "images" | "category">[]; categories: HomeCategory[]; homepage?: boolean }) {
  const [panel, setPanel] = useState<"search" | "menu" | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const results = normalized ? products.filter((product) => `${product.name} ${collectionLabel(product.category.name)}`.toLocaleLowerCase().includes(normalized)) : [];
  const sectionHref = (hash: string) => homepage ? hash : `/${hash}`;

  return (
    <>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <div className={styles.announcement}><Link href={sectionHref("#the-edit")}>Discover the Florangi dress edit <ArrowUpRight size={12} aria-hidden="true" /></Link></div>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerTools}>
            <Button variant="ghost" size="icon" className={styles.mobileMenu} aria-label="Open menu" onClick={() => setPanel("menu")}><Menu size={21} strokeWidth={1.4} aria-hidden="true" /></Button>
            <Button variant="ghost" className={styles.searchButton} aria-label="Search dresses" onClick={() => setPanel("search")}><Search size={19} strokeWidth={1.4} aria-hidden="true" /><span>Search</span></Button>
          </div>
          <Link href="/" aria-label="Florangi home" className={styles.wordmark}>Florangi</Link>
          <div className={styles.headerRight}><Link className={styles.trackLink} href="/track-order">Track order</Link><Link className={styles.bagLink} href="/cart" aria-label="Shopping bag"><ShoppingBag size={21} strokeWidth={1.4} aria-hidden="true" /><span>Bag</span></Link></div>
        </div>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navigation.slice(0, 3).map((item) => <Link href={sectionHref(item.href)} key={item.href}>{item.label}</Link>)}
          {categories.filter((category) => /bridal/i.test(category.name)).slice(0, 1).map((category) => (
            <Link href={`/collections/${category.slug}`} key={category.id}>Bridal reception</Link>
          ))}
          <Link href={sectionHref("#spotlight")}>In the spotlight</Link>
        </nav>
      </header>
      <Dialog open={panel === "search"} onClose={() => setPanel(null)} title="Find your next favourite" description="Search this season’s edit by dress name or occasion." initialFocusRef={searchRef}>
        <div className={styles.searchContent}>
          <label className={styles.searchLabel} htmlFor="dress-search">Search dresses</label>
          <div className={styles.searchInput}><Search size={19} aria-hidden="true" /><input id="dress-search" ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try pearl, cocktail, celebration…" autoComplete="off" /></div>
          {normalized ? <><p className={styles.searchStatus} role="status">{results.length ? `${results.length} ${results.length === 1 ? "dress" : "dresses"} found` : "No dresses found. Try another name or browse a collection below."}</p><div className={styles.searchResults}>{results.map((product) => <Link key={product.id} href={`/products/${product.slug}`} className={styles.searchResult} onClick={() => setPanel(null)}><div className={styles.searchThumb}><StoreImage src={product.images[0]?.url ?? "/images/demo-dress.svg"} alt="" fill sizes="64px" className={styles.coverImage} /></div><div><span>{product.name}</span><small>{collectionLabel(product.category.name)}</small></div><ArrowUpRight size={17} aria-hidden="true" /></Link>)}</div></> : <p className={styles.searchStatus}>A special evening, a celebration, or just because.</p>}
          <nav aria-label="Search collections" className={styles.searchCollections}>{categories.map((category) => <Link href={`/collections/${category.slug}`} onClick={() => setPanel(null)} key={category.id}>{collectionLabel(category.name)} <ArrowUpRight size={12} aria-hidden="true" /></Link>)}</nav>
        </div>
      </Dialog>
      <Dialog open={panel === "menu"} onClose={() => setPanel(null)} title="Explore Florangi" description="Find something that feels like you.">
        <nav className={styles.menuLinks} aria-label="Mobile navigation">
          <Link href={sectionHref("#the-edit")} onClick={() => setPanel(null)}>Shop all dresses <ArrowUpRight size={18} aria-hidden="true" /></Link>
          {categories.map((category) => (
            <Link href={`/collections/${category.slug}`} key={category.id} onClick={() => setPanel(null)}>
              {collectionLabel(category.name)} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ))}
          <Link href="/track-order">Track your order<ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link href="/contact">Get in touch<ArrowUpRight size={18} aria-hidden="true" /></Link>
        </nav>
      </Dialog>
    </>
  );
}
