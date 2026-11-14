export type InventoryVariant = {
  id: string;
  size: "XS" | "S" | "M";
  onHand: number;
  reserved: number;
  product: { id: string; name: string; slug: string; status: string; type: string };
};

export type InventoryCounts = Pick<InventoryVariant, "onHand" | "reserved">;
