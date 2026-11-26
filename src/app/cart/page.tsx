import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CartView } from "@/components/cart/cart-view";
import { StoreFooter } from "@/components/storefront/store-footer";
import styles from "@/components/storefront/home.module.css";

export default function CartPage() {
  return (
    <div className={styles.home}>
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link className="font-serif text-4xl font-medium tracking-tight" href="/" aria-label="Florangi home">Florangi</Link>
          <Link className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted hover:text-accent" href="/collections"><ArrowLeft size={15} aria-hidden="true" /> Continue shopping</Link>
        </div>
      </header>
      <main className="mx-auto min-h-[65vh] w-full max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your selection</p>
        <h1 className="mt-2 font-serif text-5xl leading-tight sm:text-6xl">Shopping bag</h1>
        <CartView />
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}