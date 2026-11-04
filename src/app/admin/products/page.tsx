import { ProductsManager } from "@/components/admin/products-manager";
import { listAdminCategories, listAdminProducts } from "@/server/services/catalog";

export const instant = false;

export default async function AdminProductsPage() {
  const [categories, products] = await Promise.all([listAdminCategories(), listAdminProducts()]);
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Catalog</p>
      <h1 className="mt-2 font-serif text-4xl">Products</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Draft products stay private until activated. Products with order history can be archived, not deleted.</p>
      <div className="mt-8"><ProductsManager initialCategories={categories} initialProducts={products} /></div>
    </main>
  );
}