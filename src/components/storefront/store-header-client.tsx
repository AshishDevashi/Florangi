"use client";

import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import { ArrowUpRight, Menu, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StoreImage } from "./store-image";
import { collectionLabel, type HomeCategory, type HomeProduct } from "./types";
import styles from "./home.module.css";

export type StoreHeaderProps = { products: Pick<HomeProduct, "id" | "name" | "slug" | "images" | "category">[]; categories: HomeCategory[]; homepage?: boolean };

export function StoreHeaderClient({ products, categories, homepage = true, announcements }: StoreHeaderProps & { announcements: string[] }) {
  const [panel, setPanel] = useState<"search" | "menu" | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const results = normalized ? products.filter((product) => `${product.name} ${collectionLabel(product.category.name)}`.toLocaleLowerCase().includes(normalized)) : [];
  const sectionHref = (hash: string) => homepage ? hash : `/${hash}`;
  const navigation = [
    { href: homepage ? "#top" : "/", label: "Home" },
    { href: "/collections", label: "Collection" },
    { href: sectionHref("#spotlight"), label: "In the spotlight" },
    { href: "/about", label: "About us" },
    { href: "/contact", label: "Appointment" },
  ];
  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    setPanel(null);
    if (homepage && href.startsWith("#") && window.location.hash === href && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      requestAnimationFrame(() => document.getElementById(href.slice(1))?.scrollIntoView());
    }
  };

  return (
    <>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <div className={styles.announcement}>
        <div className="sr-only">{announcements.join(". ")}</div>
        <div className={styles.announcementSlides} aria-hidden="true">
          {announcements.map((announcement, index) => <span className={styles.announcementSlide} style={{ animationDelay: `${index === 0 ? 0 : -6 * (announcements.length - index)}s` }} key={announcement}>{announcement}</span>)}
        </div>
      </div>
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
          {navigation.map((item) => <Link href={item.href} key={item.label} onClick={(event) => navigate(event, item.href)}>{item.label}</Link>)}
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
          {navigation.map((item) => (
            <Link href={item.href} key={item.label} onClick={(event) => navigate(event, item.href)}>
              {item.label} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </Dialog>
    </>
  );
}
