import { ReplacementManager } from "@/components/admin/replacement-manager";
import { listAdminReplacementRequests } from "@/server/services/replacements";

export const instant = false;

export default async function AdminReplacementsPage() {
  const requests = await listAdminReplacementRequests();
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Customer care</p>
      <h1 className="mt-2 font-serif text-4xl">Replacement requests</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">DD exchanges reserve an allocated size when accepted. Physical pickup and re-dispatch remain manual.</p>
      <div className="mt-6"><ReplacementManager initialRequests={requests} /></div>
    </main>
  );
}