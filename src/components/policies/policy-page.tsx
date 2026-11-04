import Link from "next/link";

export function PolicyPage({ title, placeholder }: { title: string; placeholder: string }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-stone-200 pb-5">
        <Link className="font-serif text-2xl font-semibold" href="/">Florangi</Link>
        <Link className="text-sm underline" href="/cart">Bag</Link>
      </header>
      <article className="py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Florangi policies</p>
        <h1 className="mt-2 font-serif text-4xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--muted)]">{placeholder}</p>
      </article>
    </main>
  );
}