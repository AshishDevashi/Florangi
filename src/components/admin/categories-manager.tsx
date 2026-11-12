"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { ArrowUpRight, Check, Eye, EyeOff, FolderOpen, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

type Category = { id: string; name: string; slug: string; visible: boolean; sortOrder: number; images: Array<{ id: string; position: number; url: string }>; _count: { products: number } };
type Draft = Pick<Category, "name" | "slug" | "visible" | "sortOrder">;
const inputClass = "mt-2 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-rose/30";
const emptyDraft: Draft = { name: "", slug: "", visible: true, sortOrder: 0 };

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slugEdited, setSlugEdited] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const visibleCount = categories.filter((category) => category.visible).length;
  const results = categories.filter((category) => filter === "all" || category.visible === (filter === "visible"));

  async function request(url: string, options: RequestInit) {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "This change could not be saved. Please try again.");
    return result;
  }

  async function run(key: string, action: () => Promise<void>) {
    if (pending) return;
    setPending(key); setError(""); setMessage("");
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again."); }
    finally { setPending(null); }
  }

  function openCreate() {
    setDraft({ ...emptyDraft, sortOrder: categories.length ? Math.max(...categories.map((category) => category.sortOrder)) + 1 : 0 });
    setSlugEdited(false); setEditing(null); setCreating(true); setError(""); setMessage("");
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("save", async () => {
      const result = await request(editing ? `/api/admin/categories/${editing}` : "/api/admin/categories", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      }) as Category;
      setCategories((current) => (editing
        ? current.map((item) => item.id === editing ? { ...item, ...result } : item)
        : [...current, { ...result, images: [], _count: { products: 0 } }]).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setMessage(editing ? "Category changes saved." : "Category created. You can now add collection images.");
      setCreating(false); setEditing(null);
    });
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Delete “${category.name}”? This permanently removes the category and its images.`)) return;
    await run(`delete-${category.id}`, async () => {
      await request(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setMessage(`“${category.name}” deleted.`);
    });
  }

  async function changeImage(category: Category, position: number, file?: File) {
    await run(`image-${category.id}-${position}`, async () => {
      if (file && file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      const data = new FormData();
      if (file) { data.set("file", file); data.set("position", String(position)); }
      await request(`/api/admin/categories/${category.id}/images`, file
        ? { method: "POST", body: data }
        : { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position }) });
      const refreshed = await fetch("/api/admin/categories", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Image change saved, but the list could not refresh. Reload the page to see it.");
      setCategories(await refreshed.json() as Category[]);
      setMessage(file ? "Collection image saved." : "Collection image removed.");
    });
  }

  const editor = (
    <form className="rounded-xl border border-success-border bg-surface p-5 sm:p-6" onSubmit={saveCategory}>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-medium">{editing ? "Edit category" : "Create a category"}</h2><p className="mt-1 text-sm text-muted">Give your dresses a place in the collection.</p></div><Button aria-label="Close category editor" size="icon" disabled={!!pending} onClick={() => { setEditing(null); setCreating(false); }} type="button"><X size={18} /></Button></div>
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={!!pending}>
        <label className="text-sm font-medium">Category name<input autoFocus className={inputClass} maxLength={100} onChange={(event) => { const name = event.target.value; setDraft({ ...draft, name, ...(!editing && !slugEdited ? { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) } : {}) }); }} placeholder="e.g. Occasion wear" required value={draft.name} /></label>
        <label className="text-sm font-medium">URL slug<input className={inputClass} maxLength={100} onChange={(event) => { setSlugEdited(true); setDraft({ ...draft, slug: event.target.value }); }} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="occasion-wear" required title="Use lowercase letters, numbers and single hyphens between words." value={draft.slug} /><span className="mt-2 block break-all text-xs font-normal text-muted">/collections/{draft.slug || "your-category"}</span></label>
        <label className="text-sm font-medium">Display order<input className={inputClass} min={0} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} required step={1} type="number" value={draft.sortOrder} /><span className="mt-2 block text-xs font-normal text-muted">Lower numbers appear first.</span></label>
        <label className="flex items-start gap-3 rounded-lg bg-surface-muted p-4 text-sm"><input checked={draft.visible} className="mt-1 size-4 accent-accent" onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} type="checkbox" /><span><span className="font-medium">Visible on storefront</span><span className="mt-1 block text-xs leading-5 text-muted">Hiding a category also hides its products from public collections.</span></span></label>
      </fieldset>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-5"><Button disabled={!!pending} onClick={() => { setEditing(null); setCreating(false); }} type="button">Cancel</Button><Button variant="primary" disabled={!!pending} type="submit">{pending === "save" ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}{pending === "save" ? "Saving…" : editing ? "Save changes" : "Create category"}</Button></div>
    </form>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Filter by visibility" className="flex gap-1 rounded-lg border border-border bg-surface p-1" role="group">{[["all", "All", categories.length], ["visible", "Visible", visibleCount], ["hidden", "Hidden", categories.length - visibleCount]].map(([value, label, count]) => <Button aria-pressed={filter === value} variant={filter === value ? "primary" : "ghost"} key={value} onClick={() => setFilter(String(value))} type="button">{label} <span className="ml-1 text-xs opacity-75">{count}</span></Button>)}</div>
        <Button variant="primary" disabled={!!pending || creating || !!editing} onClick={openCreate} type="button"><Plus size={17} />Add category</Button>
      </div>
      {(message || error) && <div className={`flex items-start gap-2 rounded-lg border p-4 text-sm ${error ? "border-danger-border bg-danger-bg text-danger" : "border-success-border bg-success-bg text-success"}`} role={error ? "alert" : "status"}>{!error && <Check className="shrink-0" size={18} />}{error || message}</div>}
      {creating && editor}
      <p aria-live="polite" className="text-xs text-muted">Showing {results.length} of {categories.length} categories · Sorted by display order</p>
      <ul className="space-y-4">
        {results.map((category) => <li key={category.id}>{editing === category.id ? editor : <article className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="break-all font-serif text-2xl">{category.name}</h3><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${category.visible ? "bg-success-bg text-success" : "bg-surface-hover text-muted"}`}>{category.visible ? <Eye size={12} /> : <EyeOff size={12} />}{category.visible ? "Visible" : "Hidden"}</span></div><p className="mt-2 break-all text-xs text-muted">/collections/{category.slug}</p></div><Button aria-label={`Edit ${category.name}`} disabled={!!pending || creating || !!editing} onClick={() => { setDraft({ name: category.name, slug: category.slug, visible: category.visible, sortOrder: category.sortOrder }); setCreating(false); setEditing(category.id); setError(""); setMessage(""); }} type="button"><Pencil size={15} />Edit</Button></div>
          <div className="grid gap-6 p-5 sm:px-6 lg:grid-cols-[1fr_260px]">
            <div><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Collection images</p><p className="text-xs text-muted">Optional · JPG, PNG, WebP · Max 5 MB</p></div><div className="grid max-w-lg grid-cols-2 gap-3">{[0, 1].map((position) => {
              const image = category.images.find((item) => item.position === position);
              const busy = pending === `image-${category.id}-${position}`;
              return <div key={position}><div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-muted">{image ? <Image alt={`${category.name} collection image ${position + 1}`} className="object-cover" fill sizes="(max-width: 640px) 40vw, 240px" src={image.url} unoptimized /> : <div className="text-center text-muted"><ImagePlus aria-hidden="true" className="mx-auto mb-2" size={24} /><span className="text-xs">Image {position + 1}</span></div>}{busy && <div className="absolute inset-0 flex items-center justify-center bg-surface/80"><Loader2 aria-label="Updating image" className="animate-spin text-accent" size={24} /></div>}</div><div className="mt-2 flex gap-2"><label className={buttonStyles({ size: "sm", className: `relative min-w-0 flex-1 focus-within:ring-2 focus-within:ring-focus ${pending ? "cursor-not-allowed opacity-50" : "cursor-pointer"}` })}><ImagePlus aria-hidden="true" size={14} />{image ? "Replace" : "Upload"}<input accept="image/jpeg,image/png,image/webp" aria-label={`${image ? "Replace" : "Upload"} ${category.name} image ${position + 1}`} className="absolute inset-0 w-full cursor-pointer opacity-0" disabled={!!pending} onChange={(event) => { if (event.target.files?.[0]) void changeImage(category, position, event.target.files[0]); event.currentTarget.value = ""; }} type="file" /></label>{image && <Button aria-label={`Remove ${category.name} image ${position + 1}`} size="icon" variant="danger" disabled={!!pending} onClick={() => void changeImage(category, position)} type="button"><Trash2 size={15} /></Button>}</div></div>;
            })}</div></div>
            <div className="flex flex-col justify-between gap-5 rounded-lg bg-surface-muted p-4"><dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted">Linked products</dt><dd className="font-semibold">{category._count.products}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Display order</dt><dd className="font-semibold">{category.sortOrder}</dd></div></dl><div className="space-y-3">{category.visible && <Link className={buttonStyles({ variant: "link" })} href={`/collections/${category.slug}`} rel="noopener noreferrer" target="_blank">View collection<ArrowUpRight size={16} /></Link>}<div className="border-t border-border pt-3"><Button variant="danger-link" disabled={category._count.products > 0 || !!pending} onClick={() => void deleteCategory(category)} type="button"><Trash2 size={15} />{pending === `delete-${category.id}` ? "Deleting…" : "Delete category"}</Button>{category._count.products > 0 && <p className="text-xs leading-5 text-muted">Move or remove all linked products before deleting, including drafts and archived products.</p>}</div></div></div>
          </div>
        </article>}</li>)}
      </ul>
      {!results.length && <div className="rounded-xl border border-dashed border-border-strong bg-surface px-5 py-14 text-center"><FolderOpen aria-hidden="true" className="mx-auto text-muted" size={36} /><h3 className="mt-4 text-lg font-medium">{categories.length ? "No categories in this view" : "A home for every collection"}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{categories.length ? "Choose another visibility filter to see your categories." : "Create your first category to start organizing your dresses."}</p>{categories.length ? <Button className="mt-5" onClick={() => { setFilter("all"); }} type="button">Clear filters</Button> : !creating && <Button className="mt-5" variant="primary" onClick={openCreate} type="button"><Plus size={16} />Create category</Button>}</div>}
    </div>
  );
}
