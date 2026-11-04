export type OrderContact = { name: string | null; email: string; phone: string | null };

export function readOrderContact(snapshot: unknown, fallback: OrderContact): OrderContact {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = snapshot as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name : fallback.name,
    email: typeof value.email === "string" ? value.email : fallback.email,
    phone: typeof value.phone === "string" ? value.phone : fallback.phone,
  };
}