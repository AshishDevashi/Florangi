"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/server/domain/money";

type Product = {
  id: string;
  slug: string;
  type: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  basePricePaise: number;
  customizationFeePaise: number | null;
  variants: Array<{ id: string; size: "XS" | "S" | "M"; available: number; unitPricePaise: number }>;
};

const measurements = [
  ["bust", "Bust (inches)"],
  ["underbust", "Underbust (inches)"],
  ["waist", "Waist (inches)"],
  ["hips", "Hips (inches)"],
  ["dressLength", "Dress length (inches)"],
] as const;

export function ProductOptions({ product }: { product: Product }) {
  const router = useRouter();
  const firstAvailable = product.variants.find((variant) => variant.available > 0);
  const [selectedVariant, setSelectedVariant] = useState(firstAvailable?.id ?? "");
  const activeVariant = product.variants.find((variant) => variant.id === selectedVariant);
  const [reviewedPrice, setReviewedPrice] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function addLine(measurementValues?: Record<string, number | string>) {
    if (product.type === "DESIGNER_DRESS" && !activeVariant) return;
    const displayedUnitPaise = product.type === "DESIGNER_DRESS"
      ? reviewedPrice ?? activeVariant!.unitPricePaise
      : reviewedPrice ?? product.basePricePaise + (product.customizationFeePaise ?? 0);
    const line = {
      productId: product.id,
      variantId: product.type === "DESIGNER_DRESS" ? activeVariant!.id : null,
      measurements: measurementValues,
      quantity: 1,
      acceptedUnitPaise: displayedUnitPaise,
    };
    setBusy(true);
    setMessage("");
    try {
      const quoteResponse = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ ...line, lineId: "product-preview" }]),
      });
      const quote = await quoteResponse.json() as { lines?: Array<{ state: string; message?: string; fieldErrors?: Record<string, string>; unitPricePaise?: number; quoteVersion?: string; available?: number }> };
      const quotedLine = quote.lines?.[0];
      if (!quotedLine || quotedLine.state === "UNAVAILABLE" || quotedLine.state === "INVALID") {
        const fieldMessages = quotedLine?.fieldErrors
          ? Object.entries(quotedLine.fieldErrors).map(([field, error]) => `${field}: ${error}`).join(" ")
          : "";
        setMessage([quotedLine?.message ?? "This item cannot be added right now.", fieldMessages].filter(Boolean).join(" "));
        return;
      }
      if (quotedLine.state === "PRICE_CHANGED") {
        setReviewedPrice(quotedLine.unitPricePaise ?? null);
        setMessage(`The current price is ${formatPaise(quotedLine.unitPricePaise ?? 0)}. Review it and select Add again.`);
        return;
      }

      const existing = localStorage.getItem("florangi-cart-v1");
      const guestLines = existing ? JSON.parse(existing) as Array<Record<string, unknown>> : [];
      guestLines.push({
        ...line,
        lineId: crypto.randomUUID(),
        acceptedUnitPaise: quotedLine.unitPricePaise,
        acceptedQuoteVersion: quotedLine.quoteVersion,
      });
      localStorage.setItem("florangi-cart-v1", JSON.stringify(guestLines));
      router.push("/cart");
    } catch {
      setMessage("A network error interrupted the request. Your measurements are still here; try again.");
    } finally {
      setBusy(false);
    }
  }

  if (product.type === "DESIGNER_DRESS") {
    return (
      <fieldset className="mt-8">
        <legend className="text-sm font-semibold">Choose a size</legend>
        <div className="mt-3 flex gap-2">
          {product.variants.map((variant) => (
            <button
              aria-pressed={selectedVariant === variant.id}
              className={`min-w-16 border px-3 py-2 text-sm ${selectedVariant === variant.id ? "border-accent bg-accent text-on-accent" : "border-border-strong"} disabled:cursor-not-allowed disabled:opacity-45`}
              disabled={variant.available < 1}
              key={variant.id}
              onClick={() => setSelectedVariant(variant.id)}
              type="button"
            >
              {variant.size}{variant.available < 1 ? " · Sold out" : ""}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="mt-4 text-sm">
          {activeVariant ? formatPaise(activeVariant.unitPricePaise) : "Currently sold out"}
        </p>
        {message && <p className="mt-3 text-sm text-warning" role="status">{message}</p>}
        <button className="mt-5 min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={!activeVariant || busy} onClick={() => void addLine()} type="button">
          {busy ? "Adding…" : `Add to bag · ${formatPaise(reviewedPrice ?? activeVariant?.unitPricePaise ?? 0)}`}
        </button>
      </fieldset>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, key === "fitNotes" ? String(value) : Number(value)]));
      void addLine(values as Record<string, number | string>);
    }}>
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Your measurements</legend>
        {measurements.map(([name, label]) => (
          <label className="text-sm" htmlFor={name} key={name}>
            {label}
            <input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id={name} name={name} min="0" step="0.1" type="number" required />
          </label>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm" htmlFor="heightFeet">
            Height (feet)
            <input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id="heightFeet" name="heightFeet" min="1" step="1" type="number" required />
          </label>
          <label className="text-sm" htmlFor="heightInches">
            Inches
            <input className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3" id="heightInches" name="heightInches" min="0" max="11.9" step="0.1" type="number" required />
          </label>
        </div>
      </fieldset>
      <label className="block text-sm" htmlFor="fitNotes">
        Fit notes <span className="text-muted">(optional)</span>
        <textarea className="mt-1 block min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="fitNotes" maxLength={1000} name="fitNotes" />
      </label>
      <p className="text-sm font-medium">Customization fee: {formatPaise(product.customizationFeePaise ?? 0)}</p>
      <p className="text-sm">Total: {formatPaise(reviewedPrice ?? product.basePricePaise + (product.customizationFeePaise ?? 0))}</p>
      {message && <p className="text-sm text-warning" role="status">{message}</p>}
      <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy} type="submit">{busy ? "Adding…" : "Add to bag"}</button>
    </form>
  );
}