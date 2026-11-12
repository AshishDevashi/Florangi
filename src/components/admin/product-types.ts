export type ProductCategory = { id: string; name: string; slug: string; visible: boolean };
export type ProductImage = { id: string; position: number; url: string };
export type ProductVariant = { id: string; size: "XS" | "S" | "M"; sizePremiumPaise: number; onHand: number; reserved: number };
export type AdminProduct = {
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
  variants: ProductVariant[];
};
