import { InventoryManager } from "@/components/admin/inventory-manager";
import { connection } from "next/server";
import { listAdminInventory } from "@/server/services/catalog";
import { getEffectiveSetting } from "@/server/services/settings";

export const instant = false;

export default async function AdminInventoryPage() {
  await connection();
  const [variants, thresholdSetting] = await Promise.all([
    listAdminInventory(),
    getEffectiveSetting("low_stock_threshold"),
  ]);
  const thresholdValue = thresholdSetting?.value;
  const lowStockThreshold = thresholdValue && typeof thresholdValue === "object" && !Array.isArray(thresholdValue) && "availableUnits" in thresholdValue && typeof thresholdValue.availableUnits === "number"
    ? thresholdValue.availableUnits
    : 2;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Catalog</p>
      <h1 className="mt-2 font-serif text-4xl">Inventory</h1>
      <p className="mt-2 text-sm text-muted">Stock changes are audited. On-hand units cannot be reduced below open reservations.</p>
      <div className="mt-6"><InventoryManager initialVariants={variants} lowStockThreshold={lowStockThreshold} /></div>
    </main>
  );
}