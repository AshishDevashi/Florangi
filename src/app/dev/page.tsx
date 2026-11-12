import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DevTools } from "@/components/dev/dev-tools";

export const instant = false;

export default async function DevelopmentToolsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-8 sm:px-8">
      <header className="border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-success">Florangi / Development</p>
        <h1 className="mt-2 font-serif text-4xl">Development tools</h1>
      </header>
      <div className="mt-8"><DevTools /></div>
    </main>
  );
}