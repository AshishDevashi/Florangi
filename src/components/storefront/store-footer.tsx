import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowUpRight, Heart } from "lucide-react";
import styles from "./home.module.css";

async function CopyrightYear() {
  await connection();
  return new Date().getFullYear();
}

export function StoreFooter({ homepage = true }: { homepage?: boolean }) {
  const sectionHref = (hash: string) => homepage ? hash : `/${hash}`;
  return (
    <footer className={styles.footer}>
      <div className={styles.footerMain}>
        <div className={styles.footerBrand}>
          <Link href="/" className={styles.footerWordmark}>Florangi</Link>
          <p>Occasionwear, made personal.</p>
          <Link href="/contact" className={styles.footerContact}>Say hello <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        <div>
          <h2>Explore</h2>
          <nav aria-label="Footer shopping">
            <Link href={sectionHref("#the-edit")}>Shop dresses</Link>
            <Link href="/collections">All collections</Link>
            <Link href={sectionHref("#occasions")}>Occasion edit</Link>
            <Link href={sectionHref("#spotlight")}>In the spotlight</Link>
          </nav>
        </div>
        <div>
          <h2>Customer care</h2>
          <nav aria-label="Customer care">
            <Link href="/track-order">Track your order</Link>
            <Link href="/shipping">Shipping & delivery</Link>
            <Link href="/replacement">Replacements</Link>
            <Link href="/contact">Contact us</Link>
          </nav>
        </div>
        <div className={styles.footerStatement}>
          <p>For the moments<br />you’ll remember.</p>
          <span>With love, Florangi.</span>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <p>© <Suspense><CopyrightYear /></Suspense> Florangi</p>
        <nav aria-label="Legal"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms & conditions</Link></nav>
      </div>
      <div className={styles.footerOrigin}>
        <span><span aria-hidden="true">🇮🇳</span> Made for India</span>
        <span><Heart size={13} fill="currentColor" aria-hidden="true" /> Crafted in Mumbai</span>
      </div>
    </footer>
  );
}
