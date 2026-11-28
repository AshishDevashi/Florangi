import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Flower2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found | Florangi",
};

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between border-b border-border px-5 sm:px-8">
        <Link className="font-serif text-4xl font-medium tracking-tight" href="/" aria-label="Florangi home">Florangi</Link>
        <Link className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-accent hover:underline" href="/collections">
          Explore collections <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8" aria-labelledby="not-found-title">
        <div className="w-full max-w-2xl text-center">
          <div className="relative mx-auto flex h-48 w-full max-w-sm items-center justify-center sm:h-60" aria-hidden="true">
            <div className="absolute inset-x-7 inset-y-4 rounded-[50%] border border-border-strong" />
            <div className="absolute inset-x-7 inset-y-4 -rotate-12 rounded-[50%] border border-border" />
            <Flower2 className="absolute left-7 top-6 text-rose sm:left-10" size={26} strokeWidth={1} />
            <Flower2 className="absolute bottom-7 right-9 text-rose sm:right-12" size={19} strokeWidth={1} />
            <span className="font-serif text-[clamp(7rem,25vw,12rem)] leading-none tracking-[-0.06em] text-accent">404</span>
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Page not found</p>
          <h1 id="not-found-title" className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">This page wandered off.</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted">
            The page you&apos;re looking for isn&apos;t here. Let&apos;s find you something beautiful instead.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className={buttonStyles({ variant: "primary", className: "min-h-12 rounded-none px-6" })} href="/">
              <ArrowLeft aria-hidden="true" size={16} /> Back to home
            </Link>
            <Link className={buttonStyles({ variant: "secondary", className: "min-h-12 rounded-none px-6" })} href="/collections">
              Explore collections <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <p className="mt-8 text-sm text-muted">
            Need a hand?{" "}
            <Link className="font-semibold text-accent underline underline-offset-4" href="/contact">Contact us</Link>
          </p>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-7xl border-t border-border px-5 py-5 text-center text-xs text-muted sm:px-8">
        Thoughtfully made, for moments that matter.
      </footer>
    </div>
  );
}
