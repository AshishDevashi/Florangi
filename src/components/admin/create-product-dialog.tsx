"use client";

import { useRef, useState, type FormEvent } from "react";
import { Info, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { parseRupeesToPaise } from "@/server/domain/money";
import type { AdminProduct, ProductCategory } from "./product-types";

const fieldClass = "mt-2 block min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-rose/30";
const sizes = ["XS", "S", "M"] as const;

type Props = { open: boolean; onClose: () => void; categories: ProductCategory[]; onCreated: (product: AdminProduct) => void };

export function CreateProductDialog({ open, onClose, categories, onCreated }: Props) {
  const [kind, setKind] = useState<AdminProduct["type"]>("DESIGNER_DRESS");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const defaultCategory = categories.find((category) => category.visible)?.id ?? categories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [basePrice, setBasePrice] = useState("");
  const [customizationFee, setCustomizationFee] = useState("");
  const [stock, setStock] = useState({ XS: "0", S: "0", M: "0" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectedCategory = categories.find((category) => category.id === categoryId);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(""); setBusy(true);
    try {
      if (!selectedCategory) throw new Error("Select an available category before creating a product.");
      const body = {
        name: name.trim(), slug, description: description.trim(), categoryId, type: kind,
        basePricePaise: parseRupeesToPaise(basePrice),
        customizationFeePaise: kind === "CUSTOM_DRESS" ? parseRupeesToPaise(customizationFee) : null,
        variants: kind === "DESIGNER_DRESS" ? sizes.map((size) => ({ size, sizePremiumPaise: 0, onHand: Number(stock[size]) })) : [],
      };
      const response = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as AdminProduct & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Product could not be created.");
      onCreated({ ...result, category: selectedCategory, images: [] });
      setName(""); setSlug(""); setSlugEdited(false); setDescription(""); setBasePrice(""); setCustomizationFee("");
      setStock({ XS: "0", S: "0", M: "0" }); setKind("DESIGNER_DRESS"); setCategoryId(defaultCategory);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Product could not be created. Please try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <Dialog busy={busy} description="Start with the details. Your product stays private as a draft until you add images and activate it." initialFocusRef={nameRef} onClose={onClose} open={open} title="Add product">
      <form className="flex min-h-0 flex-col" onSubmit={createProduct}>
        <div className="overflow-y-auto overscroll-contain p-5 sm:p-6">
          <fieldset className="space-y-6" disabled={busy}>
            <section aria-labelledby="product-details-title">
              <h3 className="mb-4 text-xl" id="product-details-title">Product details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium" htmlFor="productName">Product name<input ref={nameRef} className={fieldClass} id="productName" maxLength={160} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100)); }} placeholder="e.g. Rosewood silk dress" required value={name} /></label>
                <label className="text-sm font-medium" htmlFor="productSlug"><span id="product-slug-label">URL slug</span><input aria-labelledby="product-slug-label" aria-describedby="product-slug-help" className={fieldClass} id="productSlug" maxLength={100} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required title="Use lowercase letters, numbers and single hyphens between words." value={slug} /><span className="mt-1.5 block break-all text-xs font-normal text-muted" id="product-slug-help">/products/{slug || "your-product"}</span></label>
                <label className="text-sm font-medium" htmlFor="productCategory"><span id="product-category-label">Category</span><Select aria-labelledby="product-category-label" className="mt-2" disabled={busy} id="productCategory" onValueChange={setCategoryId} options={categories.map((category) => ({ value: category.id, label: `${category.name}${category.visible ? "" : " (hidden)"}` }))} required value={categoryId} /></label>
                <label className="text-sm font-medium" htmlFor="productType"><span id="product-type-label">Dress type</span><Select aria-labelledby="product-type-label" aria-describedby="product-type-help" className="mt-2" disabled={busy} id="productType" onValueChange={(value) => setKind(value as AdminProduct["type"])} options={[{ value: "DESIGNER_DRESS", label: "Designer dress" }, { value: "CUSTOM_DRESS", label: "Custom dress" }]} value={kind} /></label>
                <p className="text-xs leading-5 text-muted sm:col-span-2" id="product-type-help">{kind === "DESIGNER_DRESS" ? "Ready-to-wear dresses with stock tracked separately for XS, S and M." : "Made-to-measure dresses with a customization fee and no size-based stock."}</p>
                {selectedCategory && !selectedCategory.visible && <p className="rounded-lg bg-warning-bg p-3 text-xs leading-5 text-warning sm:col-span-2">This category is hidden. Make it visible before activating this product.</p>}
                <label className="text-sm font-medium sm:col-span-2" htmlFor="productDescription">Description<textarea className={`${fieldClass} min-h-28 resize-y py-3`} id="productDescription" maxLength={10000} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the fabric, fit and details your customers will love." required rows={4} value={description} /></label>
              </div>
            </section>
            <section aria-labelledby="product-pricing-title" className="border-t border-border pt-5">
              <h3 className="mb-4 text-xl" id="product-pricing-title">Pricing{kind === "DESIGNER_DRESS" ? " & stock" : ""}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium" htmlFor="basePrice">Base price (₹)<input className={fieldClass} id="basePrice" inputMode="decimal" min="0" onChange={(event) => setBasePrice(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={basePrice} /></label>
                {kind === "CUSTOM_DRESS" && <label className="text-sm font-medium" htmlFor="customizationFee"><span id="customization-label">Customization fee (₹)</span><input aria-labelledby="customization-label" aria-describedby="customization-help" className={fieldClass} id="customizationFee" inputMode="decimal" min="0" onChange={(event) => setCustomizationFee(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={customizationFee} /><span className="mt-1.5 block text-xs font-normal text-muted" id="customization-help">Added to the base price. Must be within your configured fee limits.</span></label>}
              </div>
              {kind === "DESIGNER_DRESS" && <fieldset className="mt-5 rounded-lg bg-surface-muted p-4"><legend className="text-sm font-medium">Initial stock by size</legend><div className="grid grid-cols-3 gap-3">{sizes.map((size) => <label className="text-sm font-medium" htmlFor={`stock-${size}`} key={size}>{size}<input className={fieldClass} id={`stock-${size}`} inputMode="numeric" min="0" onChange={(event) => setStock({ ...stock, [size]: event.target.value })} required step="1" type="number" value={stock[size]} /></label>)}</div><p className="mt-3 text-xs leading-5 text-muted">Enter units on hand. You can adjust stock later in Inventory.</p></fieldset>}
            </section>
          </fieldset>
          {error && <p className="mt-5 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-xs text-muted"><Info aria-hidden="true" size={15} />Images are added after saving.</p>
          <div className="flex gap-2"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !categories.length} type="submit" variant="primary">{busy ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Plus aria-hidden="true" size={16} />}{busy ? "Creating…" : "Create draft"}</Button></div>
        </footer>
      </form>
    </Dialog>
  );
}
