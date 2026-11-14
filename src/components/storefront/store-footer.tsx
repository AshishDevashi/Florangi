import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./home.module.css";

export function StoreFooter({ preview, homepage = true }: { preview: boolean; homepage?: boolean }) {
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
            <Link href={sectionHref("#collections")}>All collections</Link>
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
        <p>© {new Date().getFullYear()} Florangi</p>
        <span>India · INR ₹</span>
        <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
      </div>
      {preview && <p className={styles.previewNote}>Preview catalog · Collection groupings, sizes and prices are for design preview.</p>}
    </footer>
  );
}
