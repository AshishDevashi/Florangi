import { z } from "zod";
import { formatPaise } from "@/server/domain/money";
import { getEffectiveSetting } from "@/server/services/settings";
import { StoreHeaderClient, type StoreHeaderProps } from "./store-header-client";

export async function StoreHeader(props: StoreHeaderProps) {
  const setting = await getEffectiveSetting("shipping_free_threshold_paise");
  const threshold = z.object({ amountPaise: z.number().int().nonnegative().refine(Number.isSafeInteger) }).safeParse(setting?.value);
  const announcements = [
    "Track your order online",
    "Need help? Chat with us on WhatsApp",
  ];

  if (threshold.success) {
    announcements.unshift(threshold.data.amountPaise === 0
      ? "Free delivery on all orders"
      : `Free delivery on subtotals of ${formatPaise(threshold.data.amountPaise)} or more`);
  } else {
    console.error("Free delivery announcement unavailable: the shipping threshold is missing or invalid.");
    announcements.unshift("Crafted in Mumbai");
  }

  return <StoreHeaderClient {...props} announcements={announcements} />;
}
