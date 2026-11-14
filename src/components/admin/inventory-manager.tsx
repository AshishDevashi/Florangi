"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, CircleCheck, Info, PackageOpen, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { InventoryAdjustmentDialog } from "./inventory-adjustment-dialog";
import type { InventoryVariant } from "./inventory-types";

const sizeOrder = { XS: 0, S: 1, M: 2 };
function stockLevel(variant: InventoryVariant, threshold: number) {
  const available = variant.onHand - variant.reserved;
  return available === 0 ? "out" : available <= threshold ? "low" : "healthy";
}
const levelLabels = { out: "Out of stock", low: "Low stock", healthy: "In stock" };
const levelStyles = { out: "border-danger-border bg-danger-bg text-danger", low: "border-warning-border bg-warning-bg text-warning", healthy: "border-success-border bg-success-bg text-success" };
const rowColumns = "sm:grid-cols-[3rem_repeat(3,minmax(0,1fr))_minmax(7rem,1.2fr)_8.5rem]";

export function InventoryManager({ initialVariants, lowStockThreshold }: { initialVariants: InventoryVariant[]; lowStockThreshold: number }) {
  const [variants, setVariants] = useState(initialVariants);
  const [stockFilter, setStockFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refreshLock = useRef(false);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const selected = variants.find((variant) => variant.id === adjustingId);
  const { groups, totals, counts } = useMemo(() => {
    const grouped = new Map<string, { product: InventoryVariant["product"]; variants: InventoryVariant[] }>();
    const totals = { onHand: 0, reserved: 0, available: 0 };
    const counts = { low: 0, out: 0, healthy: 0 };
    for (const variant of variants) {
      const level = stockLevel(variant, lowStockThreshold);
      if (level !== "healthy") counts.low++;
      if (level === "out") counts.out++;
      if (level === "healthy") counts.healthy++;
      totals.onHand += variant.onHand; totals.reserved += variant.reserved; totals.available += variant.onHand - variant.reserved;
      const group = grouped.get(variant.product.id);
      if (group) group.variants.push(variant); else grouped.set(variant.product.id, { product: variant.product, variants: [variant] });
    }
    const groups = Array.from(grouped.values());
    for (const group of groups) group.variants.sort((a, b) => sizeOrder[a.size] - sizeOrder[b.size]);
    groups.sort((a, b) => a.product.name.localeCompare(b.product.name));
    return { groups, totals, counts };
  }, [variants, lowStockThreshold]);
  const visibleGroups = groups.filter((group) => statusFilter === "all" || group.product.status === statusFilter).map((group) => ({ ...group, matches: group.variants.filter((variant) => {
    const level = stockLevel(variant, lowStockThreshold);
    return stockFilter === "all" || (stockFilter === "low" ? level !== "healthy" : level === stockFilter);
  }) })).filter((group) => group.matches.length);
  const visibleCount = visibleGroups.reduce((count, group) => count + group.matches.length, 0);

  function updateVariants(next: InventoryVariant[]) {
    setVariants(next);
    if (adjustingId && !next.some((variant) => variant.id === adjustingId)) {
      setAdjustingId(null); setMessage("Stock refreshed. That size variant is no longer available.");
    }
  }

  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true; setRefreshing(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("Inventory could not be refreshed. Please try again.");
      updateVariants(await response.json() as InventoryVariant[]);
      setMessage("Inventory refreshed with the latest stock and reservations.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Check your connection and try refreshing again."); }
    finally { refreshLock.current = false; setRefreshing(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted"><span className="font-semibold text-foreground">{groups.length}</span> {groups.length === 1 ? "product" : "products"} · {variants.length} size variants</p><Button disabled={refreshing || !!selected} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : ""} size={16} />{refreshing ? "Refreshing…" : "Refresh stock"}</Button></div>
      <dl aria-label="Total designer-dress stock" className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface py-3">{[
        { label: "On hand", value: totals.onHand }, { label: "Reserved", value: totals.reserved }, { label: "Available", value: totals.available },
      ].map(({ label, value }) => <div className="px-4 sm:px-5" key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-IN")}</dd></div>)}</dl>
      {(message || error) && <p className={`flex items-start gap-2 rounded-lg border p-4 text-sm ${error ? "border-danger-border bg-danger-bg text-danger" : "border-success-border bg-success-bg text-success"}`} ref={feedbackRef} role={error ? "alert" : "status"} tabIndex={-1}>{error ? <AlertCircle aria-hidden="true" className="shrink-0" size={18} /> : <Check aria-hidden="true" className="shrink-0" size={18} />}{error || message}</p>}
      {variants.length > 0 && <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"><div className="flex flex-wrap gap-2"><Select aria-label="Filter inventory by stock level" onValueChange={setStockFilter} options={[{ value: "all", label: `All sizes (${variants.length})` }, { value: "low", label: `Low stock (${counts.low})` }, { value: "out", label: `Out of stock (${counts.out})` }, { value: "healthy", label: `Healthy stock (${counts.healthy})` }]} value={stockFilter} /><Select aria-label="Filter inventory by product status" onValueChange={setStatusFilter} options={[{ value: "all", label: "All product statuses" }, ...["ACTIVE", "DRAFT", "HIDDEN", "ARCHIVED"].map((status) => ({ value: status, label: status.charAt(0) + status.slice(1).toLowerCase() }))]} value={statusFilter} /></div><p aria-live="polite" className="text-xs text-muted">Showing {visibleCount} of {variants.length} sizes</p></div><p className="text-xs leading-5 text-muted">Available = on hand − reserved. Low stock means {lowStockThreshold} or fewer available units, including out-of-stock sizes. Totals include all product statuses.</p></div>}
      <ul aria-label="Inventory by product" className="space-y-4">
        {visibleGroups.map(({ product, variants: productVariants, matches }) => <li key={product.id}>
          <article className="overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div className="min-w-0"><h2 className="break-words font-sans text-base font-medium sm:text-lg">{product.name}</h2><p className="mt-1 text-xs text-muted">Designer dress · {matches.length} of {productVariants.length} sizes shown</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${product.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-surface-hover text-muted"}`}>{product.status}</span></header>
            <div aria-hidden="true" className={`hidden items-center gap-4 border-b border-border bg-surface-muted px-5 py-2 text-xs font-medium text-muted sm:grid ${rowColumns}`}><span>Size</span><span>On hand</span><span>Reserved</span><span>Available</span><span>Stock level</span><span className="w-[8.5rem]">Action</span></div>
            <ul className="divide-y divide-border">
              {matches.map((variant) => {
                const level = stockLevel(variant, lowStockThreshold);
                return <li className={`grid grid-cols-[3rem_1fr] items-center gap-4 p-4 sm:px-5 ${rowColumns}`} key={variant.id}>
                  <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface-muted text-sm font-semibold" title={`Size ${variant.size}`}>{variant.size}</span>
                  <dl aria-label={`Size ${variant.size} stock`} className="grid grid-cols-3 gap-2 sm:contents">{[
                    { label: "On hand", value: variant.onHand }, { label: "Reserved", value: variant.reserved }, { label: "Available", value: variant.onHand - variant.reserved },
                  ].map(({ label, value }) => <div key={label}><dt className="text-[10px] text-muted sm:sr-only">{label}</dt><dd className={`mt-1 text-base tabular-nums sm:mt-0 ${label === "Available" ? "font-semibold text-accent" : "text-foreground"}`}>{value}</dd></div>)}</dl>
                  <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 sm:contents"><span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${levelStyles[level]}`}>{level === "healthy" ? <CircleCheck aria-hidden="true" size={13} /> : <AlertCircle aria-hidden="true" size={13} />}{levelLabels[level]}</span><Button aria-label={`Adjust ${product.name} size ${variant.size}`} disabled={refreshing} onClick={() => { setError(""); setMessage(""); setAdjustingId(variant.id); }} size="sm"><Pencil aria-hidden="true" size={14} />Adjust stock</Button></div>
                </li>;
              })}
            </ul>
          </article>
        </li>)}
      </ul>
      {!visibleGroups.length && <div className="rounded-xl border border-dashed border-border-strong bg-surface px-5 py-14 text-center"><PackageOpen aria-hidden="true" className="mx-auto text-muted" size={36} /><h2 className="mt-4 text-2xl">{variants.length ? "No sizes in this view" : "Your stock starts with a product"}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{variants.length ? "Try a different stock level or product status." : "Create a designer dress with size variants to start managing inventory. Custom dresses are made to order."}</p>{variants.length ? <Button className="mt-5" onClick={() => { setStockFilter("all"); setStatusFilter("all"); }}>Clear filters</Button> : <Link className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline" href="/admin/products">Manage products<ArrowUpRight aria-hidden="true" size={16} /></Link>}</div>}
      <p className="flex items-start gap-2 text-xs leading-5 text-muted"><Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />Reserved units belong to open orders. Available units can be sold. Custom dresses do not use size-based inventory.</p>
      {selected && <InventoryAdjustmentDialog key={selected.id} onClose={() => setAdjustingId(null)} onRefreshed={updateVariants} onSaved={(counts) => { setVariants((current) => current.map((variant) => variant.id === selected.id ? { ...variant, ...counts } : variant)); setAdjustingId(null); setMessage(`${selected.product.name} · Size ${selected.size}: on hand set to ${counts.onHand}, with ${counts.onHand - counts.reserved} available. Adjustment recorded.`); requestAnimationFrame(() => feedbackRef.current?.focus()); }} variant={selected} />}
    </div>
  );
}
