import Link from "next/link";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export default function CheckoutPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-stone-200 pb-5">
        <Link className="font-serif text-2xl font-semibold" href="/">Florangi</Link>
        <Link className="text-sm underline" href="/cart">Back to bag</Link>
      </header>
      <section className="py-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Secure checkout</p>
        <h1 className="mt-2 font-serif text-4xl">Delivery and payment</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Your order is checked by the Florangi team before it is prepared.</p>
        <div className="mt-8"><CheckoutForm /></div>
      </section>
    </main>
  );
}