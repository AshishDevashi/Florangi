"use client";

import Link from "next/link";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { ArrowUpRight, Check, Ruler, ShoppingBag } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatPaise } from "@/server/domain/money";
import type { MeasurementRanges } from "@/server/domain/measurements";
import type { QuotedCartLine } from "@/server/services/cart";
import styles from "./product.module.css";

type Product = {
  id: string;
  name: string;
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
  ["heightFeet", "Height (feet)"],
  ["heightInches", "Height (inches)"],
] as const;

type BagLine = { productId: string; variantId?: string | null; quantity: number; [key: string]: unknown };

function isBagLine(line: unknown): line is BagLine {
  return Boolean(line && typeof line === "object" && "productId" in line && typeof line.productId === "string"
    && "quantity" in line && typeof line.quantity === "number" && Number.isSafeInteger(line.quantity) && line.quantity > 0
    && (!("variantId" in line) || line.variantId == null || typeof line.variantId === "string"));
}

function readBag(): BagLine[] {
  const raw = localStorage.getItem("florangi-cart-v1");
  const lines: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(lines) || !lines.every(isBagLine)) throw new Error("Invalid bag");
  return lines;
}

function variantCounts(lines: BagLine[], productId: string) {
  const counts: Record<string, number> = {};
  for (const line of lines) {
    if (line.productId === productId && typeof line.variantId === "string") {
      counts[line.variantId] = (counts[line.variantId] ?? 0) + line.quantity;
    }
  }
  return counts;
}

export function ProductOptions({ product, measurementRanges }: { product: Product; measurementRanges?: MeasurementRanges }) {
  const router = useRouter();
  const formId = useId();
  const sizeRef = useRef<HTMLFieldSetElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const requestLock = useRef(false);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [reviewedPrice, setReviewedPrice] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [fitHelp, setFitHelp] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [bag, setBag] = useState<{ productId: string; counts: Record<string, number>; error: string } | null>(null);
  const custom = product.type === "CUSTOM_DRESS";
  const activeVariant = product.variants.find((variant) => variant.id === selectedVariant);
  const currentBag = bag?.productId === product.id ? bag : null;
  const selectedCount = activeVariant ? currentBag?.counts[activeVariant.id] ?? 0 : 0;
  const selectedUnavailable = activeVariant ? activeVariant.available < 1 || unavailable.includes(activeVariant.id) : false;
  const soldOut = !custom && !product.variants.some((variant) => variant.available > 0 && !unavailable.includes(variant.id));
  const prices = product.variants.map((variant) => variant.unitPricePaise);
  const startingPrice = custom ? product.basePricePaise + (product.customizationFeePaise ?? 0) : prices.length ? Math.min(...prices) : product.basePricePaise;
  const displayedPrice = reviewedPrice ?? activeVariant?.unitPricePaise ?? startingPrice;
  const hasPriceRange = !custom && !activeVariant && new Set(prices).size > 1;
  const disabled = busy || added || (custom ? !measurementRanges || !product.customizationFeePaise : !currentBag || Boolean(currentBag.error) || soldOut || selectedUnavailable);

  useEffect(() => {
    if (product.type !== "DESIGNER_DRESS") return;
    function refreshBag() {
      try {
        setBag({ productId: product.id, counts: variantCounts(readBag(), product.id), error: "" });
      } catch {
        setBag({ productId: product.id, counts: {}, error: "Your bag could not be read. Please open your bag or contact us for help." });
      }
    }
    startTransition(refreshBag);
    window.addEventListener("focus", refreshBag);
    window.addEventListener("pageshow", refreshBag);
    window.addEventListener("storage", refreshBag);
    return () => {
      window.removeEventListener("focus", refreshBag);
      window.removeEventListener("pageshow", refreshBag);
      window.removeEventListener("storage", refreshBag);
    };
  }, [product.id, product.type]);

  useEffect(() => {
    const button = actionRef.current;
    if (!button) return;
    const observer = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting), { threshold: 0.1, rootMargin: "-115px 0px -80px 0px" });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  function clearFeedback() {
    setReviewedPrice(null);
    setMessage("");
    setFieldErrors({});
  }

  function focusSelection() {
    const target = custom ? formRef.current : sizeRef.current;
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    target?.querySelector<HTMLElement>(custom ? "input" : "button:not(:disabled)")?.focus({ preventScroll: true });
  }

  async function addLine(measurementValues?: Record<string, number | string>) {
    if (requestLock.current || disabled || (!custom && !activeVariant)) return;
    requestLock.current = true;
    let saved = false;
    const line = {
      productId: product.id,
      variantId: custom ? null : activeVariant!.id,
      measurements: measurementValues,
      quantity: 1,
      acceptedUnitPaise: displayedPrice,
    };
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      const response = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ ...line, lineId: "product-preview" }]),
      });
      if (!response.ok) throw new Error("Quote unavailable");
      const quote = await response.json() as { lines?: QuotedCartLine[] };
      const quotedLine = quote.lines?.[0];
      if (!quotedLine || quotedLine.state === "UNAVAILABLE" || quotedLine.state === "INVALID") {
        setMessage(quotedLine?.message ?? "This dress can’t be added right now. Please try again.");
        setFieldErrors(quotedLine?.fieldErrors ?? {});
        const firstField = Object.keys(quotedLine?.fieldErrors ?? {})[0];
        if (firstField) (formRef.current?.elements.namedItem(firstField) as HTMLElement | null)?.focus();
        if (!custom && quotedLine?.state === "UNAVAILABLE" && activeVariant) {
          setUnavailable((values) => [...values, activeVariant.id]);
          setSelectedVariant("");
          setReviewedPrice(null);
        }
        return;
      }
      if (!Number.isSafeInteger(quotedLine.unitPricePaise) || quotedLine.unitPricePaise! < 0 || !quotedLine.quoteVersion) throw new Error("Invalid quote");
      if (quotedLine.state === "PRICE_CHANGED") {
        setReviewedPrice(quotedLine.unitPricePaise!);
        setMessage(`The price has changed to ${formatPaise(quotedLine.unitPricePaise!)}. Review the updated price, then accept it to add this dress.`);
        return;
      }
      if (quotedLine.state !== "AVAILABLE") throw new Error("Unrecognized quote");

      const guestLines = readBag();
      if (!custom && activeVariant && (variantCounts(guestLines, product.id)[activeVariant.id] ?? 0) > 0) {
        setBag({ productId: product.id, counts: variantCounts(guestLines, product.id), error: "" });
        setMessage(`Size ${activeVariant.size} is already in your bag.`);
        return;
      }
      guestLines.push({ ...line, lineId: crypto.randomUUID(), acceptedUnitPaise: quotedLine.unitPricePaise, acceptedQuoteVersion: quotedLine.quoteVersion });
      localStorage.setItem("florangi-cart-v1", JSON.stringify(guestLines));
      if (custom) {
        saved = true;
        setAdded(true);
        router.push("/cart");
      } else {
        setBag({ productId: product.id, counts: variantCounts(guestLines, product.id), error: "" });
      }
    } catch {
      setMessage("We couldn’t add this dress. Your selections are still here; please try again. If it continues, open your bag or contact us.");
    } finally {
      if (!saved) requestLock.current = false;
      setBusy(false);
    }
  }

  const actionLabel = added ? "Opening your bag…" : busy ? "Adding…" : soldOut || selectedUnavailable ? "Sold out" : reviewedPrice !== null ? "Accept price & add to bag" : "Add to bag";

  return (
    <>
      <div className={styles.productHeading}>
        <p className={styles.productType}>{custom ? "Made to measure" : "Designer dress"}</p>
        <h1>{product.name}</h1>
        <p className={styles.price} aria-live="polite">{hasPriceRange ? "From " : ""}{formatPaise(displayedPrice)}</p>
        <p className={styles.priceNote}>Shipping calculated at checkout.</p>
      </div>

      <div className={styles.fitHelpRow}>
        <span>{custom ? "A fit that’s personal to you" : "Find your fit"}</span>
        <Button variant="link" className={styles.fitButton} onClick={() => setFitHelp(true)}><Ruler size={16} aria-hidden="true" />Size & fit help</Button>
      </div>

      {!custom ? (
        <div className={styles.selection}>
          <fieldset ref={sizeRef} disabled={busy || added} className={styles.sizeFieldset}>
            <legend>Choose a size {activeVariant && <span>— {activeVariant.size}</span>}</legend>
            <div className={styles.sizeButtons}>
              {product.variants.map((variant) => {
                const isUnavailable = variant.available < 1 || unavailable.includes(variant.id);
                const inBag = (currentBag?.counts[variant.id] ?? 0) > 0;
                return <Button key={variant.id} variant="secondary" className={styles.sizeButton} aria-pressed={selectedVariant === variant.id} aria-label={`${variant.size}${isUnavailable ? " · Sold out" : ""}`} disabled={isUnavailable && !inBag} onClick={() => { setSelectedVariant(variant.id); clearFeedback(); }}>
                  {variant.size}{selectedVariant === variant.id && <Check size={12} aria-hidden="true" />}
                </Button>;
              })}
            </div>
          </fieldset>
          <p className={styles.availability} aria-live="polite">{activeVariant && selectedCount > 0 ? `Size ${activeVariant.size} · ${selectedCount} ${selectedCount === 1 ? "item" : "items"} in your bag${selectedUnavailable ? " · Sold out" : ""}` : soldOut ? "This dress is currently sold out." : activeVariant ? `Size ${activeVariant.size} is ${selectedUnavailable ? "sold out" : "available"}` : "Select your size before adding to bag."}</p>
          {currentBag?.error && <p className={styles.feedback} role="alert">{currentBag.error}</p>}
          {message && <p className={styles.feedback} role="status" id={`${formId}-message`}>{message}</p>}
          <div ref={actionRef}>
            {selectedCount > 0 && !busy ? <Link className={buttonStyles({ variant: "primary", className: styles.addButton })} href="/cart"><ShoppingBag size={17} aria-hidden="true" />Go to bag</Link> : (
              <Button variant="primary" className={styles.addButton} disabled={disabled || !activeVariant} onClick={() => void addLine()} aria-describedby={message ? `${formId}-message` : undefined}>
                <ShoppingBag size={17} aria-hidden="true" />{actionLabel}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <form ref={formRef} id={formId} className={styles.measurementForm} onChange={clearFeedback} onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const values = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, key === "fitNotes" ? String(value) : Number(value)]));
          void addLine(values);
        }}>
          <p className={styles.measurementIntro}>Enter your body measurements in inches. Keep the tape comfortably close, without pulling it tight.</p>
          <fieldset disabled={disabled} className={styles.measurementGrid}>
            <legend className="sr-only">Your measurements</legend>
            {measurements.map(([name, label]) => <label htmlFor={`${formId}-${name}`} key={name}>
              {label}
              <input id={`${formId}-${name}`} name={name} min={measurementRanges?.[name].min ?? 0} max={measurementRanges?.[name].max} step={name === "heightFeet" ? 1 : "any"} type="number" inputMode="decimal" required aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `${formId}-${name}-error` : undefined} />
              {fieldErrors[name] && <span className={styles.fieldError} id={`${formId}-${name}-error`}>{fieldErrors[name]}</span>}
            </label>)}
            <label className={styles.fitNotes} htmlFor={`${formId}-fitNotes`}>Fit notes <span>(optional)</span><textarea id={`${formId}-fitNotes`} name="fitNotes" maxLength={1000} rows={3} placeholder="Anything you’d like us to know about your fit…" /></label>
          </fieldset>
          <dl className={styles.priceBreakdown}>
            {reviewedPrice === null && <><div><dt>Dress</dt><dd>{formatPaise(product.basePricePaise)}</dd></div><div><dt>Customization fee</dt><dd>{formatPaise(product.customizationFeePaise ?? 0)}</dd></div></>}
            <div><dt>{reviewedPrice === null ? "Total" : "Updated total"}</dt><dd>{formatPaise(displayedPrice)}</dd></div>
          </dl>
          {(!measurementRanges || !product.customizationFeePaise) && <p className={styles.feedback}>Made-to-measure ordering is temporarily unavailable. <Link href="/contact">Contact us for help.</Link></p>}
          {message && <p className={styles.feedback} role="status">{message}</p>}
          <div ref={actionRef}><Button variant="primary" type="submit" className={styles.addButton} disabled={disabled}><ShoppingBag size={17} aria-hidden="true" />{actionLabel}</Button></div>
        </form>
      )}
      <p className={styles.bagNote}>Adding to your bag doesn’t reserve this dress.</p>

      <div className={`${styles.mobilePurchase} ${showSticky ? styles.mobilePurchaseVisible : ""}`} aria-hidden={!showSticky}>
        <div><span>{hasPriceRange ? "From " : ""}{formatPaise(displayedPrice)}</span><small>{custom ? "Made to measure" : activeVariant ? `Size ${activeVariant.size}${selectedCount ? ` · ${selectedCount} in bag` : ""}` : "Choose your size"}</small></div>
        {!custom && selectedCount > 0 && !busy ? <Link className={buttonStyles({ variant: "primary" })} href="/cart" tabIndex={showSticky ? 0 : -1}>Go to bag</Link> : (
          <Button variant="primary" tabIndex={showSticky ? 0 : -1} disabled={disabled} onClick={() => { if (custom || !activeVariant) focusSelection(); else void addLine(); }}>{custom ? "Enter measurements" : activeVariant || soldOut ? actionLabel : "Choose a size"}</Button>
        )}
      </div>

      <Dialog open={fitHelp} onClose={() => setFitHelp(false)} title="Size & fit help" description="A little guidance for finding your fit.">
        <div className={styles.fitHelpContent}>
          {!custom && <p>Available sizes for this dress: <strong>{product.variants.map((variant) => variant.size).join(", ") || "not currently available"}</strong>. For size-specific garment measurements or help choosing between sizes, <Link href="/contact">contact us before ordering <ArrowUpRight size={12} aria-hidden="true" /></Link>.</p>}
          <h3>How to measure</h3>
          <ul><li><strong>Bust:</strong> Measure around the fullest part, keeping the tape level.</li><li><strong>Waist:</strong> Measure around your natural waist without pulling tight.</li><li><strong>Hips:</strong> Measure around the fullest part of your hips.</li>{custom && <><li><strong>Underbust:</strong> Measure around your ribcage, just below your bust.</li><li><strong>Dress length:</strong> Measure from the top of your shoulder to your preferred hem.</li><li><strong>Height:</strong> Enter your height in feet and the remaining inches.</li></>}</ul>
          <p>Use a soft measuring tape and keep your posture relaxed. If you’re unsure, we’re happy to help.</p>
          <Link href="/contact" className={styles.helpLink}>Ask about fit <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </Dialog>
    </>
  );
}
