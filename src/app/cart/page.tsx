import Link from "next/link";
import { CartView } from "@/components/cart/cart-view";

export default function CartPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <Link className="font-serif text-2xl font-medium" href="/">Florangi</Link>
        <Link className="text-sm underline" href="/">Continue browsing</Link>
      </header>
      <section className="py-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your selection</p>
        <h1 className="mt-2 font-serif text-4xl">Shopping bag</h1>
        <div className="mt-7"><CartView /></div>
      </section>
    </main>
  );
}