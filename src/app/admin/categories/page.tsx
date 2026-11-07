import { CategoriesManager } from "@/components/admin/categories-manager";
import { listAdminCategories } from "@/server/services/catalog";

export const instant = false;

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Catalog</p>
      <h1 className="mt-2 font-serif text-4xl">Categories</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Hidden categories and their products are not shown in public collections. Only categories with no linked products can be deleted.</p>
      <div className="mt-8"><CategoriesManager initialCategories={categories} /></div>
    </main>
  );
}