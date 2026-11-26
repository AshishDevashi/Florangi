import Link from "next/link";
import type { ReactNode } from "react";
import { StoreFooter } from "@/components/storefront/store-footer";
import styles from "@/components/storefront/home.module.css";

type PolicyPageProps = { title: string } & (
  | { placeholder: string; children?: never; draft?: never }
  | { children: ReactNode; draft: true; placeholder?: never }
);

export function PolicyPage({ title, placeholder, children, draft }: PolicyPageProps) {
  return (
    <div className={styles.home}>
      <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <Link className="font-serif text-2xl font-medium" href="/">Florangi</Link>
          <Link className="text-sm underline" href="/cart">Bag</Link>
        </header>
        <article className="py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Florangi policies</p>
          <h1 className="mt-2 font-serif text-4xl">{title}</h1>
          {draft && <p className="mt-6 max-w-2xl border-l-2 border-accent bg-surface px-4 py-3 text-sm leading-6">Draft for review. This policy has not yet been approved and must be reviewed before launch.</p>}
          {placeholder ? <p className="mt-6 max-w-2xl text-sm leading-7 text-muted">{placeholder}</p> : (
            <div className="mt-8 max-w-2xl space-y-8 text-sm leading-7 text-muted [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:text-foreground [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4">
              {children}
            </div>
          )}
        </article>
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}