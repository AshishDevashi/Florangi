"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { StoreImage } from "@/components/storefront/store-image";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatPaise } from "@/server/domain/money";
import type { QuotedCartLine as CartLine } from "@/server/services/cart";

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
  const requestLock = useRef(false);

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
    if (requestLock.current || !Number.isInteger(quantity) || quantity < 1) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const nextLines = guestLines.map((item) => item.lineId === line.lineId ? { ...item, quantity } : item);
      const nextQuote = await getGuestQuote(nextLines);
      const nextLine = nextQuote.lines.find((item) => item.lineId === line.lineId);
      if (!nextLine || nextLine.state === "INVALID" || (nextLine.state === "UNAVAILABLE" && !(line.state === "UNAVAILABLE" && quantity < line.quantity))) {
        throw new Error(nextLine?.message ?? "This quantity is unavailable.");
      }
      localStorage.setItem("florangi-cart-v1", JSON.stringify(nextLines));
      setGuestLines(nextLines);
      setQuote(nextQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quantity could not be changed.");
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  async function removeLine(line: CartLine) {
    if (requestLock.current) return;
    requestLock.current = true;
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
      requestLock.current = false;
      setBusy(false);
    }
  }

  async function clearCart() {
    if (requestLock.current) return;
    requestLock.current = true;
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
      requestLock.current = false;
      setBusy(false);
    }
  }

  async function acceptCurrentPrices() {
    if (requestLock.current || !quote) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const nextLines = guestLines.map((guestLine) => {
        const current = quote.lines.find((line) => line.lineId === guestLine.lineId);
        return current?.state === "PRICE_CHANGED"
          ? { ...guestLine, acceptedUnitPaise: current.unitPricePaise, acceptedQuoteVersion: current.quoteVersion }
          : guestLine;
      });
      const nextQuote = await getGuestQuote(nextLines);
      localStorage.setItem("florangi-cart-v1", JSON.stringify(nextLines));
      setGuestLines(nextLines);
      setQuote(nextQuote);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Updated prices could not be accepted.");
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }

  if (mode === "loading" || mode === "error") {
    return (
      <div className="mt-8 border-t border-border py-12">
        {mode === "loading" ? <p className="text-sm text-muted" role="status">Refreshing your bag…</p> : (
          <div className="rounded-xl border border-danger-border bg-danger-bg p-6">
            <p className="text-sm text-danger" role="alert">{error}</p>
            <Button className="mt-4" onClick={() => {
              setMode("loading");
              void load().catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : "Your cart could not be loaded.");
                setMode("error");
              });
            }}>Try again</Button>
          </div>
        )}
      </div>
    );
  }

  const hasItems = Boolean(quote?.lines.length);
  return (
    <div className="mt-8">
      {error && <p className="mb-5 rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger" role="alert">{error}</p>}
      {!hasItems ? (
        <div className="flex flex-col items-center border-t border-border py-16 text-center sm:py-24">
          <span className="flex size-20 items-center justify-center rounded-full bg-surface-muted text-accent"><ShoppingBag size={30} strokeWidth={1.2} aria-hidden="true" /></span>
          <h2 className="mt-6 font-serif text-4xl">Your bag is empty</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">Explore our collections and find something you love.</p>
          <Link className={buttonStyles({ variant: "primary", className: "mt-7 min-h-12 px-7" })} href="/collections">Explore collections <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      ) : quote && <CartSection quote={quote} busy={busy} onQuantity={updateQuantity} onRemove={removeLine} onClear={clearCart} onAcceptPrices={acceptCurrentPrices} />}
    </div>
  );
}

function CartSection({
  quote,
  busy,
  onQuantity,
  onRemove,
  onClear,
  onAcceptPrices,
}: {
  quote: CartQuote;
  busy: boolean;
  onQuantity: (line: CartLine, quantity: number) => void;
  onRemove: (line: CartLine) => void;
  onClear: () => void;
  onAcceptPrices: () => void;
}) {
  const itemCount = quote.lines.reduce((total, line) => total + line.quantity, 0);
  const canCheckout = !busy && !quote.hasBlockingLines && !quote.needsAcceptance;
  const hasPricedItems = quote.lines.some((line) => line.state === "AVAILABLE" || line.state === "PRICE_CHANGED");
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <section aria-labelledby="bag-items-heading">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <h2 id="bag-items-heading" className="font-serif text-2xl">Your items <span className="font-sans text-sm font-normal text-muted">({itemCount})</span></h2>
          <Button variant="ghost" size="sm" className="text-muted underline underline-offset-4" disabled={busy} onClick={onClear}>Clear bag</Button>
        </div>
        <CartLines quote={quote} busy={busy} onQuantity={onQuantity} onRemove={onRemove} />
        <Link className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline" href="/collections"><ArrowLeft size={16} aria-hidden="true" /> Continue shopping</Link>
      </section>
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 lg:sticky lg:top-6">
        <h2 className="font-serif text-3xl">Order summary</h2>
        <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted">Subtotal</span><span>{formatPaise(quote.subtotalPaise)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">Shipping</span><span>{!hasPricedItems ? "—" : quote.shippingFeePaise === 0 ? "Free" : formatPaise(quote.shippingFeePaise)}</span></div>
          <div className="flex justify-between gap-4 border-t border-border pt-5 text-base font-semibold"><span>Total</span><span>{formatPaise(quote.totalPaise)}</span></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">Your bag and shipping are checked again at checkout.</p>
        {quote.hasBlockingLines && <p className="mt-5 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger" role="status">Please resolve unavailable items before checkout. Totals exclude these items.</p>}
        {quote.needsAcceptance && (
          <div className="mt-5 rounded-lg border border-warning-border bg-warning-bg p-4">
            <p className="text-sm leading-6 text-warning">Your quote has changed. Please review the updated totals and accept them before checkout.</p>
            <Button className="mt-3 w-full" disabled={busy || quote.hasBlockingLines} onClick={onAcceptPrices}>Accept updated prices</Button>
          </div>
        )}
        {canCheckout ? (
          <Link className={buttonStyles({ variant: "primary", className: "mt-6 min-h-12 w-full" })} href="/checkout">Continue to checkout <ArrowRight size={16} aria-hidden="true" /></Link>
        ) : (
          <Button variant="primary" className="mt-6 min-h-12 w-full" disabled>Continue to checkout <ArrowRight size={16} aria-hidden="true" /></Button>
        )}
        <p className="mt-4 text-center text-xs text-muted" aria-live="polite">{busy ? "Updating your bag…" : "Need help? Contact us for assistance."}</p>
        {!busy && <Link className="mt-1 block text-center text-xs text-accent underline underline-offset-4" href="/contact">Contact us</Link>}
      </div>
    </div>
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
  const eagerImages = new Set(quote.lines.slice(0, 3).map((line) => line.imageUrl).filter((url): url is string => Boolean(url)));
  return (
    <ul className="divide-y divide-border">
      {quote.lines.map((line, index) => (
        <li className="flex gap-4 py-6 sm:gap-6" key={line.lineId ?? `${line.productId}-${index}`}>
          <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-md bg-surface-muted sm:w-36">
            {line.imageUrl ? <StoreImage src={line.imageUrl} alt="" fill loading={eagerImages.has(line.imageUrl) ? "eager" : "lazy"} sizes="(max-width: 639px) 96px, 144px" className="object-cover object-[center_35%]" /> : <ShoppingBag className="absolute inset-0 m-auto text-muted" size={28} strokeWidth={1.2} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">{line.type === "CUSTOM_DRESS" ? "Made to measure" : line.type === "DESIGNER_DRESS" ? "Designer dress" : "Your selection"}</p>
                <h3 className="mt-1 break-words font-sans text-sm font-medium sm:text-base">{line.productSlug ? <Link className="hover:text-accent hover:underline" href={`/products/${line.productSlug}`}>{line.productName}</Link> : line.productName ?? "Dress"}</h3>
                {line.type === "DESIGNER_DRESS" && line.size && <p className="mt-1 text-xs text-muted">Size {line.size}</p>}
                {line.type === "CUSTOM_DRESS" && line.measurements && <p className="mt-1 text-xs text-muted">Measurements saved</p>}
              </div>
              <p className="text-sm font-semibold">{line.lineTotalPaise === undefined ? "—" : formatPaise(line.lineTotalPaise)}</p>
            </div>
            {line.unitPricePaise !== undefined && line.quantity > 1 && <p className="mt-1 text-xs text-muted">{formatPaise(line.unitPricePaise)} each</p>}
            {line.state === "PRICE_CHANGED" && line.acceptedUnitPaise != null && line.unitPricePaise !== undefined && line.acceptedUnitPaise !== line.unitPricePaise && <p className="mt-2 text-xs text-muted">Previously {formatPaise(line.acceptedUnitPaise)} each; now {formatPaise(line.unitPricePaise)} each.</p>}
            {line.message && <p className={`mt-3 text-xs leading-5 ${line.state === "PRICE_CHANGED" ? "text-warning" : "text-danger"}`} role="status">{line.message}</p>}
            {line.fieldErrors && <ul className="mt-2 list-inside list-disc text-xs text-danger">{Object.entries(line.fieldErrors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {line.type === "DESIGNER_DRESS" ? (
                <div className="inline-flex items-center rounded-md border border-border-strong" role="group" aria-label={`Quantity for ${line.productName ?? "dress"}${line.size ? `, size ${line.size}` : ""}`}>
                  <button className="flex size-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40" aria-label="Decrease quantity" disabled={busy || line.quantity <= 1} onClick={() => onQuantity(line, line.quantity - 1)} type="button"><Minus size={14} aria-hidden="true" /></button>
                  <span className="min-w-6 text-center text-sm" aria-live="polite">{line.quantity}</span>
                  <button className="flex size-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40" aria-label="Increase quantity" disabled={busy || line.state === "UNAVAILABLE" || line.state === "INVALID" || (line.available !== undefined && line.quantity >= line.available)} onClick={() => onQuantity(line, line.quantity + 1)} type="button"><Plus size={14} aria-hidden="true" /></button>
                </div>
              ) : <span className="text-xs text-muted">Quantity: {line.quantity}</span>}
              <Button variant="ghost" size="sm" aria-label={`Remove ${line.productName ?? "dress"}${line.size ? `, size ${line.size}` : ""}`} disabled={busy} onClick={() => onRemove(line)}><Trash2 size={15} aria-hidden="true" /> Remove</Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
