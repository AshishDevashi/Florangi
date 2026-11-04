"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";

type Category = { id: string; name: string; slug: string; visible: boolean; sortOrder: number; images: Array<{ id: string; position: number; url: string }>; _count: { products: number } };

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function changeImage(category: Category, position: number, file?: File) {
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const data = new FormData();
      if (file) { data.set("file", file); data.set("position", String(position)); }
      const response = await fetch(`/api/admin/categories/${category.id}/images`, file
        ? { method: "POST", body: data }
        : { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Category image could not be updated.");
      const refreshed = await fetch("/api/admin/categories", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Categories could not be refreshed.");
      setCategories(await refreshed.json() as Category[]);
      setMessage(file ? "Category image saved." : "Category image removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Category image could not be updated.");
    } finally { setUploading(false); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, visible: true, sortOrder: categories.length }),
    });
    const result = await response.json() as Category | { error?: string };
    if (!response.ok || !("id" in result)) {
      setError("error" in result ? result.error ?? "Category could not be created." : "Category could not be created.");
      return;
    }
    setCategories((current) => [...current, { ...result, images: [], _count: { products: 0 } }].sort((a, b) => a.sortOrder - b.sortOrder));
    setName("");
    setSlug("");
    setMessage("Category created.");
  }

  async function updateCategory(category: Category, changes: Partial<Category>) {
    setError("");
    const response = await fetch(`/api/admin/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Category could not be updated.");
      return;
    }
    const updated = await response.json() as Category;
    setCategories((current) => current.map((item) => item.id === category.id ? { ...updated, images: item.images, _count: category._count } : item).sort((a, b) => a.sortOrder - b.sortOrder));
    setMessage("Category updated.");
  }

  return (
    <div className="space-y-8">
      <form className="grid gap-3 border-b border-stone-200 pb-7 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createCategory}>
        <label className="text-sm" htmlFor="categoryName">Name<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="categoryName" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <label className="text-sm" htmlFor="categorySlug">Slug<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="categorySlug" maxLength={100} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={slug} /></label>
        <button className="self-end bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white" type="submit">Add category</button>
      </form>
      {(message || error) && <p className={error ? "text-sm text-red-800" : "text-sm text-emerald-800"} role={error ? "alert" : "status"}>{error || message}</p>}
      <ul className="divide-y divide-stone-200">
        {categories.map((category) => (
          <li className="grid gap-4 py-5 md:grid-cols-[1fr_1fr_120px_140px_auto] md:items-end" key={category.id}>
            <label className="text-sm" htmlFor={`name-${category.id}`}>Name<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" defaultValue={category.name} id={`name-${category.id}`} maxLength={100} onBlur={(event) => event.target.value !== category.name && void updateCategory(category, { name: event.target.value })} /></label>
            <label className="text-sm" htmlFor={`slug-${category.id}`}>Slug<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" defaultValue={category.slug} id={`slug-${category.id}`} maxLength={100} onBlur={(event) => event.target.value !== category.slug && void updateCategory(category, { slug: event.target.value })} /></label>
            <label className="text-sm" htmlFor={`order-${category.id}`}>Order<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" defaultValue={category.sortOrder} id={`order-${category.id}`} min="0" onBlur={(event) => Number(event.target.value) !== category.sortOrder && void updateCategory(category, { sortOrder: Number(event.target.value) })} type="number" /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm" htmlFor={`visible-${category.id}`}><input checked={category.visible} id={`visible-${category.id}`} onChange={(event) => void updateCategory(category, { visible: event.target.checked })} type="checkbox" />Visible</label>
            <p className="pb-3 text-xs text-[var(--muted)]">{category._count.products} products</p>
            <div className="flex flex-wrap gap-5 md:col-span-5">
              {[0, 1].map((position) => {
                const image = category.images.find((item) => item.position === position);
                return <div className="w-40" key={position}>
                  <p className="mb-2 text-xs text-[var(--muted)]">Image {position + 1} (optional)</p>
                  <div className="relative aspect-[4/3] bg-stone-100">{image && <Image alt={`${category.name} image ${position + 1}`} className="object-cover" fill sizes="160px" src={image.url} unoptimized />}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="relative flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 border border-stone-300 text-xs" title={image ? "Replace image" : "Upload image"}>
                      <ImagePlus aria-hidden="true" size={16} />{image ? "Replace" : "Upload"}
                      <input accept="image/jpeg,image/png,image/webp" aria-label={`${category.name} image ${position + 1}`} className="absolute inset-0 cursor-pointer opacity-0" disabled={uploading} onChange={(event) => { if (event.target.files?.[0]) void changeImage(category, position, event.target.files[0]); event.currentTarget.value = ""; }} type="file" />
                    </label>
                    {image && <button aria-label={`Remove ${category.name} image ${position + 1}`} className="flex h-10 w-10 items-center justify-center border border-stone-300 text-red-800" disabled={uploading} onClick={() => void changeImage(category, position)} title="Remove image" type="button"><Trash2 aria-hidden="true" size={16} /></button>}
                  </div>
                </div>;
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}