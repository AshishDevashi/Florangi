"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Archive, ArrowUpRight, Check, ChevronDown, Eye, EyeOff, ImagePlus, Images, Info, Loader2, PackageOpen, Plus, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ProductImages } from "./product-images";
import { CreateProductDialog } from "./create-product-dialog";
import type { AdminProduct, ProductCategory, ProductImage } from "./product-types";
import { formatPaise } from "@/server/domain/money";

const statuses = ["DRAFT", "ACTIVE", "HIDDEN", "ARCHIVED"] as const;
const statusStyles = {
  DRAFT: "bg-surface-hover text-accent",
  ACTIVE: "bg-success-bg text-success",
  HIDDEN: "bg-surface-muted text-muted",
  ARCHIVED: "bg-surface-hover text-muted",
};

export function ProductsManager({ initialCategories, initialProducts }: { initialCategories: ProductCategory[]; initialProducts: AdminProduct[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mutationLock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const results = products.filter((product) => (statusFilter === "all" || product.status === statusFilter) && (typeFilter === "all" || product.type === typeFilter));

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "This change could not be saved. Please try again.");
    return result;
  }

  async function reloadProducts() {
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    if (!response.ok) throw new Error("Your change was saved, but the list could not refresh. Reload the page to see it.");
    setProducts(await response.json() as AdminProduct[]);
  }

  async function run(key: string, action: () => Promise<void>, success: string) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setPending(key); setError(""); setMessage("");
    try { await action(); setMessage(success); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { mutationLock.current = false; setPending(null); }
  }

  async function updateStatus(product: AdminProduct, status: AdminProduct["status"]) {
    await run(`status-${product.id}`, async () => {
      await request(`/api/admin/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, status } : item));
    }, `“${product.name}” ${status === "ACTIVE" ? "activated" : status === "HIDDEN" ? "hidden from the storefront" : "archived"}.`);
  }

  async function removeProduct(product: AdminProduct) {
    if (!window.confirm(`Permanently delete “${product.name}”? Products with order or stock history must be archived instead.`)) return;
    await run(`delete-${product.id}`, async () => {
      await request(`/api/admin/products/${product.id}`, { method: "DELETE" });
      setProducts((current) => current.filter((item) => item.id !== product.id));
    }, "Product deleted.");
  }

  async function uploadImage(product: AdminProduct, file?: File) {
    if (!file) return;
    await run(`upload-${product.id}`, async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      const data = new FormData(); data.set("file", file);
      await request(`/api/admin/products/${product.id}/images`, { method: "POST", body: data });
      await reloadProducts();
    }, "Product image uploaded.");
  }

  async function reorderImages(product: AdminProduct, images: ProductImage[]) {
    await run(`images-${product.id}`, async () => {
      await request(`/api/admin/products/${product.id}/images`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds: images.map((image) => image.id) }) });
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, images: images.map((image, position) => ({ ...image, position })) } : item));
    }, "Image order updated. The first image is the product cover.");
  }
  async function removeImage(product: AdminProduct, image: ProductImage) {
    await run(`images-${product.id}`, async () => {
      await request(`/api/admin/products/${product.id}/images/${image.id}`, { method: "DELETE" });
      await reloadProducts();
    }, "Product image removed.");
  }

  function openCreate() { setError(""); setMessage(""); setCreating(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted"><span className="font-semibold text-foreground">{products.length}</span> {products.length === 1 ? "product" : "products"} in your catalog</p>
        <Button disabled={!!pending || !initialCategories.length} onClick={openCreate} variant="primary"><Plus aria-hidden="true" size={17} />Add product</Button>
      </div>
      {!initialCategories.length && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm"><p>Create a category before adding your first product.</p><Link className="font-semibold text-accent underline" href="/admin/categories">Manage categories</Link></div>}
      {error && <p className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
      {message && <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-bg p-4 text-sm text-success" role="status"><Check aria-hidden="true" className="shrink-0" size={18} />{message}</p>}
      <section aria-label="Product list" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Filter products by status" onValueChange={setStatusFilter} options={[{ value: "all", label: `All statuses (${products.length})` }, ...statuses.map((status) => ({ value: status, label: `${status.charAt(0) + status.slice(1).toLowerCase()} (${products.filter((product) => product.status === status).length})` }))]} value={statusFilter} />
            <Select aria-label="Filter products by dress type" onValueChange={setTypeFilter} options={[{ value: "all", label: "All dress types" }, { value: "DESIGNER_DRESS", label: "Designer dresses" }, { value: "CUSTOM_DRESS", label: "Custom dresses" }]} value={typeFilter} />
          </div>
          <p aria-live="polite" className="text-xs text-muted">Showing {results.length} of {products.length}</p>
        </div>
        <ul className="space-y-4">
          {results.map((product) => {
            const activationHelp = !product.images.length ? "Add at least one image before activating." : !product.category.visible ? "Make the category visible before activating." : product.type === "DESIGNER_DRESS" && !product.variants.length ? "Add a size variant before activating." : "";
            const actionBusy = pending?.endsWith(product.id);
            return <li key={product.id}>
              <article aria-label={product.name} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-4 sm:gap-5">
                    <div className="relative flex aspect-[3/4] w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted sm:w-32">
                      {product.images[0] ? <Image alt={product.name} className="object-cover" fill sizes="(max-width: 640px) 96px, 128px" src={product.images[0].url} unoptimized /> : <div className="p-2 text-center text-muted"><ImagePlus aria-hidden="true" className="mx-auto mb-2" size={24} /><span className="text-xs">No image yet</span></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${statusStyles[product.status]}`}>{product.status}</span><span className="text-xs text-muted">{product.type === "CUSTOM_DRESS" ? "Made to measure" : "Designer dress"}</span></div>
                      <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:gap-4">
                        <div className="min-w-0"><h2 className="break-words font-sans text-base font-medium sm:text-lg">{product.name}</h2><p className="mt-1 text-xs text-muted">{product.category.name}{!product.category.visible && " · Category hidden"}</p></div>
                        <div className="shrink-0 sm:text-right"><p className="text-base font-semibold">{formatPaise(product.basePricePaise)}</p>{product.type === "CUSTOM_DRESS" && <p className="mt-1 text-xs text-muted">+ {formatPaise(product.customizationFeePaise ?? 0)} customization</p>}</div>
                      </div>
                      <p className="mt-2 hidden break-all text-xs text-muted sm:block">/products/{product.slug}</p>
                      {product.variants.length > 0 && <dl aria-label="Available stock by size" className="mt-3 flex flex-wrap gap-2">{product.variants.map((variant) => <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs" key={variant.id}><dt className="font-semibold">{variant.size}</dt><dd className={variant.onHand - variant.reserved === 0 ? "text-danger" : "text-muted"}>{variant.onHand - variant.reserved} available</dd></div>)}</dl>}
                      {product.type === "CUSTOM_DRESS" && <p className="mt-3 text-xs text-muted">Made to order · No size-based stock</p>}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={buttonStyles({ size: "sm", className: `relative focus-within:ring-2 focus-within:ring-focus ${pending || product.images.length >= 8 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}` })}>
                        {pending === `upload-${product.id}` ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <ImagePlus aria-hidden="true" size={15} />}{product.images.length >= 8 ? "8 images added" : "Upload image"}
                        <input accept="image/jpeg,image/png,image/webp" aria-label={`Upload image for ${product.name}`} className="absolute inset-0 w-full cursor-pointer opacity-0" disabled={!!pending || product.images.length >= 8} onChange={(event) => { void uploadImage(product, event.target.files?.[0]); event.currentTarget.value = ""; }} type="file" />
                      </label>
                      {product.status !== "ACTIVE" ? <Button disabled={!!pending || !!activationHelp} onClick={() => void updateStatus(product, "ACTIVE")} size="sm" title={activationHelp || "Show on storefront"} variant="primary"><Eye aria-hidden="true" size={14} />{pending === `status-${product.id}` ? "Updating…" : "Activate"}</Button> : <Button disabled={!!pending} onClick={() => void updateStatus(product, "HIDDEN")} size="sm"><EyeOff aria-hidden="true" size={14} />{pending === `status-${product.id}` ? "Updating…" : "Hide"}</Button>}
                      {product.status !== "ARCHIVED" && <Button disabled={!!pending} onClick={() => void updateStatus(product, "ARCHIVED")} size="sm" variant="ghost"><Archive aria-hidden="true" size={14} />Archive</Button>}
                      {product.status === "ACTIVE" && product.category.visible && <Link className={buttonStyles({ variant: "link", size: "sm" })} href={`/products/${product.slug}`} rel="noopener noreferrer" target="_blank">View<ArrowUpRight aria-hidden="true" size={14} /></Link>}
                    </div>
                    <Button aria-label={`Delete ${product.name}`} disabled={!!pending} onClick={() => void removeProduct(product)} size="icon" title="Permanently delete product" variant="danger-link">{pending === `delete-${product.id}` ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Trash2 aria-hidden="true" size={16} />}</Button>
                  </div>
                  {product.status !== "ACTIVE" && activationHelp && <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted"><Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />{activationHelp}</p>}
                  {actionBusy && <span className="sr-only" role="status">Saving changes to {product.name}…</span>}
                </div>
                <details className="group border-t border-border">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 bg-surface-muted px-4 py-3 text-xs font-medium sm:px-5 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Images aria-hidden="true" size={15} />Images ({product.images.length}/8)<span className="hidden font-normal text-muted sm:inline">· Manage cover and order</span></span><ChevronDown aria-hidden="true" className="transition-transform group-open:rotate-180" size={16} /></summary>
                  <div className="p-4 sm:p-5">
                    <ProductImages active={product.status === "ACTIVE"} disabled={!!pending} images={product.images} onRemove={(image) => void removeImage(product, image)} onReorder={(images) => reorderImages(product, images)} productName={product.name} />
                  </div>
                </details>
              </article>
            </li>;
          })}
        </ul>
        {!results.length && <div className="rounded-xl border border-dashed border-border-strong bg-surface px-5 py-14 text-center"><PackageOpen aria-hidden="true" className="mx-auto text-muted" size={36} /><h2 className="mt-4 text-2xl">{products.length ? "No products in this view" : "Your next collection starts here"}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{products.length ? "Choose a different status or dress type to see more products." : "Add your first dress, upload its images, then activate it when you’re ready."}</p>{products.length ? <Button className="mt-5" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); }}>Clear filters</Button> : <Button className="mt-5" disabled={!initialCategories.length} onClick={openCreate} variant="primary"><Plus aria-hidden="true" size={16} />Add your first product</Button>}</div>}
      </section>
      <p className="text-xs leading-5 text-muted">Only active products in visible categories appear on the storefront. Products with order or stock history must be archived instead of deleted.</p>
      <CreateProductDialog categories={initialCategories} onClose={() => setCreating(false)} onCreated={(product) => { setProducts((current) => [product, ...current]); setStatusFilter("all"); setTypeFilter("all"); setMessage(`“${product.name}” saved as a draft. Upload an image, then activate it when ready.`); }} open={creating} />
    </div>
  );
}
