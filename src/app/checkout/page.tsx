import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { StoreFooter } from "@/components/storefront/store-footer";
import styles from "@/components/storefront/home.module.css";

export default function CheckoutPage() {
  return (
    <div className={styles.home}>
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link className="font-serif text-4xl font-medium tracking-tight" href="/" aria-label="Florangi home">Florangi</Link>
          <Link className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted hover:text-accent" href="/cart"><ArrowLeft size={15} aria-hidden="true" /> Back to bag</Link>
        </div>
      </header>
      <main className="mx-auto min-h-[65vh] w-full max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Secure checkout</p>
        <h1 className="mt-2 font-serif text-5xl leading-tight sm:text-6xl">Delivery and payment</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Your order is checked by the Florangi team before it is prepared.</p>
        <div className="mt-8"><CheckoutForm /></div>
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}