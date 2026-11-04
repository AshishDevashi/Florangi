import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !user.emailVerifiedAt) return <AdminLoginForm />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link className="font-serif text-2xl font-semibold" href="/admin">Florangi <span className="font-sans text-sm font-medium text-[var(--muted)]">Admin</span></Link>
          <LogoutButton />
        </div>
      </header>
      <nav aria-label="Admin navigation" className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl gap-5 overflow-x-auto px-5 py-3 text-sm sm:px-8">
          <Link className="shrink-0 hover:underline" href="/admin">Overview</Link>
          <Link className="shrink-0 hover:underline" href="/admin/categories">Categories</Link>
          <Link className="shrink-0 hover:underline" href="/admin/products">Products</Link>
          <Link className="shrink-0 hover:underline" href="/admin/inventory">Inventory</Link>
          <Link className="shrink-0 hover:underline" href="/admin/orders">Orders</Link>
          <Link className="shrink-0 hover:underline" href="/admin/replacements">Replacements</Link>
          <Link className="shrink-0 hover:underline" href="/admin/settings">Settings</Link>
        </div>
      </nav>
      {children}
    </div>
  );
}