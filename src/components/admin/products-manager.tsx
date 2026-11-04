"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatPaise, parseRupeesToPaise } from "@/server/domain/money";

type Category = { id: string; name: string; slug: string; visible: boolean };
type ProductImage = { id: string; provider: string; key: string; mimeType: string; sizeBytes: number; position: number; url: string };
type Variant = { id: string; size: "XS" | "S" | "M"; sizePremiumPaise: number; onHand: number; reserved: number };
type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  status: "DRAFT" | "ACTIVE" | "HIDDEN" | "ARCHIVED";
  basePricePaise: number;
  customizationFeePaise: number | null;
  category: { name: string; slug: string; visible: boolean };
  images: ProductImage[];
  variants: Variant[];
};

export function ProductsManager({ initialCategories, initialProducts }: { initialCategories: Category[]; initialProducts: Product[] }) {
  const [categories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [kind, setKind] = useState<"DESIGNER_DRESS" | "CUSTOM_DRESS">("DESIGNER_DRESS");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? "");
  const [basePrice, setBasePrice] = useState("");
  const [customizationFee, setCustomizationFee] = useState("");
  const [stock, setStock] = useState({ XS: "0", S: "0", M: "0" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reloadProducts() {
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    if (response.ok) setProducts(await response.json() as Product[]);
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const body = {
        name,
        slug,
        description,
        categoryId,
        type: kind,
        basePricePaise: parseRupeesToPaise(basePrice),
        customizationFeePaise: kind === "CUSTOM_DRESS" ? parseRupeesToPaise(customizationFee) : null,
        variants: kind === "DESIGNER_DRESS"
          ? (["XS", "S", "M"] as const).map((size) => ({ size, sizePremiumPaise: 0, onHand: Number(stock[size]) }))
          : [],
      };
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Product could not be created.");
      setName("");
      setSlug("");
      setDescription("");
      setBasePrice("");
      setCustomizationFee("");
      setMessage("Product created as a draft. Add images before activating it.");
      await reloadProducts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Product could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(product: Product, status: Product["status"]) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Product status could not be updated.");
      setMessage("Product status updated.");
      await reloadProducts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Product status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`Permanently delete ${product.name}? Products with order or stock history must be archived instead.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Product could not be deleted.");
      setMessage("Product deleted.");
      await reloadProducts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Product could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(productId: string, file: File | undefined) {
    if (!file) return;
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(`/api/admin/products/${productId}/images`, { method: "POST", body: formData });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Image upload failed.");
      return;
    }
    setMessage("Image uploaded.");
    await reloadProducts();
  }

  async function moveImage(product: Product, index: number, direction: -1 | 1) {
    const next = [...product.images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const response = await fetch(`/api/admin/products/${product.id}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: next.map((image) => image.id) }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Image order could not be changed.");
      return;
    }
    await reloadProducts();
  }

  async function removeImage(product: Product, image: ProductImage) {
    const response = await fetch(`/api/admin/products/${product.id}/images/${image.id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Image could not be removed.");
      return;
    }
    setMessage("Image removed.");
    await reloadProducts();
  }

  return (
    <div className="space-y-10">
      <form className="grid gap-4 border-b border-stone-200 pb-8 md:grid-cols-2" onSubmit={createProduct}>
        <h2 className="font-serif text-2xl md:col-span-2">Add product</h2>
        {categories.length === 0 && <p className="text-sm text-red-800 md:col-span-2">Create a category before adding products.</p>}
        <label className="text-sm" htmlFor="productName">Product name<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="productName" maxLength={160} onChange={(event) => { setName(event.target.value); setSlug(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} required value={name} /></label>
        <label className="text-sm" htmlFor="productSlug">Slug<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="productSlug" maxLength={100} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={slug} /></label>
        <label className="text-sm" htmlFor="productCategory">Category<select className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="productCategory" onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.visible ? "" : " (hidden)"}</option>)}</select></label>
        <label className="text-sm" htmlFor="productType">Type<select className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="productType" onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}><option value="DESIGNER_DRESS">Designer dress</option><option value="CUSTOM_DRESS">Custom dress</option></select></label>
        <label className="text-sm" htmlFor="basePrice">Base price (₹)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="basePrice" inputMode="decimal" onChange={(event) => setBasePrice(event.target.value)} required value={basePrice} /></label>
        {kind === "CUSTOM_DRESS" ? (
          <label className="text-sm" htmlFor="customizationFee">Customization fee (₹)<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="customizationFee" inputMode="decimal" onChange={(event) => setCustomizationFee(event.target.value)} required value={customizationFee} /></label>
        ) : (
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-1 text-sm">Initial stock by size</legend>
            {(["XS", "S", "M"] as const).map((size) => <label className="text-sm" htmlFor={`stock-${size}`} key={size}>{size}<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id={`stock-${size}`} min="0" onChange={(event) => setStock({ ...stock, [size]: event.target.value })} type="number" value={stock[size]} /></label>)}
          </fieldset>
        )}
        <label className="text-sm md:col-span-2" htmlFor="productDescription">Description<textarea className="mt-1 block min-h-24 w-full border border-stone-300 bg-white px-3 py-2" id="productDescription" maxLength={10000} onChange={(event) => setDescription(event.target.value)} required value={description} /></label>
        {(error || message) && <p className={`text-sm md:col-span-2 ${error ? "text-red-800" : "text-emerald-800"}`} role={error ? "alert" : "status"}>{error || message}</p>}
        <button className="min-h-11 w-fit bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || categories.length === 0} type="submit">{busy ? "Creating…" : "Create draft"}</button>
      </form>

      <section>
        <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-2xl">Products</h2><p className="text-xs text-[var(--muted)]">Only active products in visible categories appear publicly.</p></div>
        {products.length === 0 ? <p className="mt-5 text-sm text-[var(--muted)]">No products yet.</p> : (
          <ul className="mt-4 divide-y divide-stone-200">
            {products.map((product) => (
              <li className="grid gap-4 py-5 lg:grid-cols-[120px_1fr_auto]" key={product.id}>
                <div className="relative aspect-[3/4] w-full max-w-28 overflow-hidden bg-stone-100">
                  {product.images[0] && <Image alt="" className="object-cover" fill sizes="112px" src={product.images[0].url} unoptimized />}
                </div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-2"><h3 className="font-medium">{product.name}</h3><span className="border border-stone-300 px-2 py-0.5 text-xs">{product.status}</span></div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{product.category.name} · {product.type === "CUSTOM_DRESS" ? "Custom" : "Designer"}</p>
                  <p className="mt-1 text-sm">{formatPaise(product.basePricePaise)}{product.customizationFeePaise ? ` + ${formatPaise(product.customizationFeePaise)} customization` : ""}</p>
                  {product.variants.length > 0 && <p className="mt-1 text-xs text-[var(--muted)]">{product.variants.map((variant) => `${variant.size}: ${variant.onHand - variant.reserved} available`).join(" · ")}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer border border-stone-300 px-3 py-2 text-xs font-medium hover:border-[var(--accent)]">
                      Upload image
                      <input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void uploadImage(product.id, event.target.files?.[0]); event.currentTarget.value = ""; }} type="file" />
                    </label>
                    {product.status !== "ACTIVE" && <button className="border border-stone-300 px-3 py-2 text-xs" onClick={() => void updateStatus(product, "ACTIVE")} type="button">Activate</button>}
                    {product.status === "ACTIVE" && <button className="border border-stone-300 px-3 py-2 text-xs" onClick={() => void updateStatus(product, "HIDDEN")} type="button">Hide</button>}
                    {product.status !== "ARCHIVED" && <button className="border border-stone-300 px-3 py-2 text-xs" onClick={() => void updateStatus(product, "ARCHIVED")} type="button">Archive</button>}
                    <button aria-label={`Delete ${product.name}`} className="flex h-10 w-10 items-center justify-center border border-red-300 text-red-800 disabled:opacity-50" disabled={busy} onClick={() => void removeProduct(product)} title="Delete product" type="button"><Trash2 aria-hidden="true" size={16} /></button>
                  </div>
                  {product.images.length > 0 && <ol className="mt-4 flex flex-wrap gap-3">{product.images.map((image, index) => <li className="flex items-center gap-2" key={image.id}><span className="text-xs text-[var(--muted)]">Image {index + 1}</span><button aria-label={`Move image ${index + 1} earlier`} className="border border-stone-300 px-2 py-1 text-xs disabled:opacity-40" disabled={index === 0} onClick={() => void moveImage(product, index, -1)} type="button">↑</button><button aria-label={`Move image ${index + 1} later`} className="border border-stone-300 px-2 py-1 text-xs disabled:opacity-40" disabled={index === product.images.length - 1} onClick={() => void moveImage(product, index, 1)} type="button">↓</button><button aria-label={`Remove image ${index + 1}`} className="border border-stone-300 px-2 py-1 text-xs" onClick={() => void removeImage(product, image)} type="button">Remove</button></li>)}</ol>}
                </div>
                <div className="text-xs text-[var(--muted)]">{product.images.length} / 8 images</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}