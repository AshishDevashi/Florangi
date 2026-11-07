"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { formatPaise } from "@/server/domain/money";

type CartLine = {
  lineId?: string;
  productId: string;
  productName?: string;
  type?: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  variantId?: string | null;
  size?: string;
  measurements?: Record<string, unknown>;
  quantity: number;
  available?: number;
  unitPricePaise?: number;
  lineTotalPaise?: number;
  quoteVersion?: string;
  acceptedUnitPaise?: number | null;
  state: "AVAILABLE" | "PRICE_CHANGED" | "UNAVAILABLE" | "INVALID";
  message?: string;
  fieldErrors?: Record<string, string>;
};

type CartQuote = {
  lines: CartLine[];
  shippingFeePaise: number;
  subtotalPaise: number;
  totalPaise: number;
  hasBlockingLines: boolean;
  needsAcceptance: boolean;
};

type GuestLine = {
  lineId: string;
  productId: string;
  variantId?: string | null;
  measurements?: Record<string, unknown>;
  quantity: number;
  acceptedUnitPaise?: number;
  acceptedQuoteVersion?: string;
};

function readGuestLines(): GuestLine[] {
  try {
    const raw = localStorage.getItem("florangi-cart-v1");
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value as GuestLine[] : [];
  } catch {
    return [];
  }
}

async function getGuestQuote(lines: GuestLine[]): Promise<CartQuote> {
  const response = await fetch("/api/cart/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lines),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Cart prices could not be refreshed.");
  return response.json() as Promise<CartQuote>;
}

export function CartView() {
  const [mode, setMode] = useState<"loading" | "error" | "ready">("loading");
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [guestLines, setGuestLines] = useState<GuestLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const localLines = readGuestLines();
    const nextQuote = await getGuestQuote(localLines);
    setGuestLines(localLines);
    setQuote(nextQuote);
    setMode("ready");
  }

  useEffect(() => {
    startTransition(() => {
      void load().catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Your cart could not be loaded.");
        setMode("error");
      });
    });
  }, []);

  async function updateQuantity(line: CartLine, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setBusy(true);
    setError("");
    try {
      const nextLines = guestLines.map((item) => item.lineId === line.lineId ? { ...item, quantity } : item);
      const nextQuote = await getGuestQuote(nextLines);
      const nextLine = nextQuote.lines.find((item) => item.lineId === line.lineId);
      if (!nextLine || nextLine.state === "UNAVAILABLE" || nextLine.state === "INVALID") {
        throw new Error(nextLine?.message ?? "This quantity is unavailable.");
      }
      setGuestLines(nextLines);
      localStorage.setItem("florangi-cart-v1", JSON.stringify(nextLines));
      setQuote(nextQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quantity could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(line: CartLine) {
    setBusy(true);
    setError("");
    try {
      const nextLines = guestLines.filter((item) => item.lineId !== line.lineId);
      const nextQuote = await getGuestQuote(nextLines);
      localStorage.setItem("florangi-cart-v1", JSON.stringify(nextLines));
      setGuestLines(nextLines);
      setQuote(nextQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cart item could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearCart() {
    setBusy(true);
    setError("");
    try {
      const nextQuote = await getGuestQuote([]);
      localStorage.removeItem("florangi-cart-v1");
      setGuestLines([]);
      setQuote(nextQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cart could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptCurrentPrices() {
    setBusy(true);
    setError("");
    try {
      if (!quote) return;
      const nextLines = guestLines.map((guestLine) => {
        const current = quote.lines.find((line) => line.lineId === guestLine.lineId);
        return current?.state === "PRICE_CHANGED"
          ? { ...guestLine, acceptedUnitPaise: current.unitPricePaise, acceptedQuoteVersion: current.quoteVersion }
          : guestLine;
      });
      const nextQuote = await getGuestQuote(nextLines);
      setGuestLines(nextLines);
      setQuote(nextQuote);
      localStorage.setItem("florangi-cart-v1", JSON.stringify(nextLines));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Updated prices could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading" || mode === "error") {
    return (
      <div className="py-10">
        {mode === "loading" ? <p className="text-sm text-[var(--muted)]" role="status">Loading your cart…</p> : (
          <div>
            <p className="text-sm text-red-800" role="alert">{error}</p>
            <button className="mt-4 border border-stone-300 px-4 py-2 text-sm" onClick={() => {
              setMode("loading");
              void load().catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : "Your cart could not be loaded.");
                setMode("error");
              });
            }} type="button">Retry</button>
          </div>
        )}
      </div>
    );
  }

  const hasItems = Boolean(quote?.lines.length);
  return (
    <div>
      {error && <p className="mb-5 text-sm text-red-800" role="alert">{error}</p>}
      {!hasItems ? (
        <div className="border-t border-stone-200 py-10">
          <p className="text-[var(--muted)]">Your bag is empty.</p>
          <Link className="mt-4 inline-block text-sm font-medium underline" href="/">Continue browsing</Link>
        </div>
      ) : (
        <>
          {quote && <CartSection quote={quote} busy={busy} onQuantity={updateQuantity} onRemove={removeLine} />}
          {quote?.needsAcceptance && (
            <button className="mt-5 min-h-11 border border-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy || quote.hasBlockingLines} onClick={() => void acceptCurrentPrices()} type="button">
              Accept updated prices
            </button>
          )}
          <div className="mt-8 border-t border-stone-200 pt-5">
            <button className="text-sm text-[var(--muted)] underline disabled:opacity-50" disabled={busy} onClick={() => void clearCart()} type="button">Clear bag</button>
          </div>
        </>
      )}
      <div className="mt-8">
        {quote?.lines.length && !quote.hasBlockingLines && !quote.needsAcceptance && <Link className="inline-flex min-h-11 items-center bg-[var(--accent)] px-5 text-sm font-semibold text-white" href="/checkout">Continue to checkout</Link>}
      </div>
    </div>
  );
}

function CartSection({
  quote,
  busy,
  onQuantity,
  onRemove,
}: {
  quote: CartQuote;
  busy: boolean;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl">Your bag</h2>
      <CartLines quote={quote} busy={busy} onQuantity={onQuantity} onRemove={onRemove} />
      <div className="ml-auto mt-8 max-w-sm border-t border-stone-200 pt-4 text-sm">
        <div className="flex justify-between py-1"><span>Subtotal</span><span>{formatPaise(quote.subtotalPaise)}</span></div>
        <div className="flex justify-between py-1"><span>Shipping</span><span>{formatPaise(quote.shippingFeePaise)}</span></div>
        <div className="mt-2 flex justify-between border-t border-stone-200 pt-3 font-semibold"><span>Total</span><span>{formatPaise(quote.totalPaise)}</span></div>
        <p className="mt-3 text-xs text-[var(--muted)]">Cash on Delivery surcharge, if any, is shown at checkout.</p>
      </div>
    </section>
  );
}

function CartLines({
  quote,
  busy,
  onQuantity,
  onRemove,
}: {
  quote: CartQuote;
  busy: boolean;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
}) {
  return (
    <ul className="mt-4 divide-y divide-stone-200">
      {quote.lines.map((line, index) => (
        <li className="grid gap-4 py-5 sm:grid-cols-[1fr_auto]" key={line.lineId ?? `${line.productId}-${index}`}>
          <div>
            <h3 className="font-medium">{line.productName ?? "Dress"}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{line.type === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size ?? "selected"}`}</p>
            {line.type === "CUSTOM_DRESS" && line.measurements && <p className="mt-2 text-xs text-[var(--muted)]">Measurements saved for this cart line.</p>}
            {line.message && <p className={`mt-2 text-sm ${line.state === "PRICE_CHANGED" ? "text-amber-900" : "text-red-800"}`} role="status">{line.message}</p>}
            {line.fieldErrors && <ul className="mt-2 list-inside list-disc text-xs text-red-800">{Object.entries(line.fieldErrors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}
            <button className="mt-3 text-xs underline" disabled={busy} onClick={() => onRemove(line)} type="button">Remove</button>
          </div>
          <div className="flex items-center justify-between gap-5 sm:justify-end">
            {line.type === "DESIGNER_DRESS" && (line.available === undefined || line.available > 0) && (
              <label className="text-xs" htmlFor={`quantity-${line.lineId ?? index}`}>
                Quantity
                <input className="ml-2 min-h-10 w-20 border border-stone-300 bg-white px-2 text-sm" disabled={busy} defaultValue={line.quantity} id={`quantity-${line.lineId ?? index}`} max={line.available} min="1" onBlur={(event) => Number(event.target.value) !== line.quantity && onQuantity(line, Number(event.target.value))} type="number" />
              </label>
            )}
            <p className="text-sm font-medium">{line.lineTotalPaise === undefined ? "—" : formatPaise(line.lineTotalPaise)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
