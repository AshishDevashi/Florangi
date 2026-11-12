import { CategoriesManager } from "@/components/admin/categories-manager";
import { listAdminCategories } from "@/server/services/catalog";

export const instant = false;

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Catalog</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Categories</h1>
      <div className="mt-4"><CategoriesManager initialCategories={categories} /></div>
    </main>
  );
}
