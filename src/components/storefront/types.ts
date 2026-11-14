import type { listHomepageProducts } from "@/server/services/catalog";

export type HomeProduct = Awaited<ReturnType<typeof listHomepageProducts>>[number];
export type HomeCategory = { id: string; name: string; slug: string; images: Array<{ url: string }> };

export function collectionLabel(name: string) {
  return name.replace(/^PREVIEW\s*[·–-]\s*/i, "");
}
