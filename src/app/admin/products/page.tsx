import { ProductsManager } from "@/components/admin/products-manager";
import { listAdminCategories, listAdminProducts } from "@/server/services/catalog";

export const instant = false;

export default async function AdminProductsPage() {
  const [categories, products] = await Promise.all([listAdminCategories(), listAdminProducts()]);
  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Catalog</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Products</h1>
      <div className="mt-4"><ProductsManager initialCategories={categories} initialProducts={products} /></div>
    </main>
  );
}
