"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Banknote, CreditCard, ShoppingBag } from "lucide-react";
import { StoreImage } from "@/components/storefront/store-image";
import { Button, buttonStyles } from "@/components/ui/button";
import { formatPaise } from "@/server/domain/money";
import { openRazorpayCheckout, type RazorpayClientOrder, type RazorpayPaymentResponse } from "@/components/checkout/payment-client";
import type { QuotedCartLine as CartLine } from "@/server/services/cart";

type GuestCartLine = {
  lineId: string;
  productId: string;
  variantId: string | null;
  measurements?: Record<string, unknown>;
  quantity: number;
  acceptedUnitPaise: number;
  acceptedQuoteVersion: string;
};

type CartState = {
  lines: CartLine[];
  subtotalPaise: number;
  shippingFeePaise: number;
  totalPaise: number;
  hasBlockingLines: boolean;
  needsAcceptance: boolean;
};

type CheckoutQuote = {
  subtotalPaise: number;
  shippingFeePaise: number;
  codSurchargePaise: number;
  totalPaise: number;
  lines: CartLine[];
};

const addressFields = [
  { name: "line1", label: "Address line 1", autocomplete: "address-line1" },
  { name: "line2", label: "Address line 2 (optional)", autocomplete: "address-line2", optional: true },
  { name: "landmark", label: "Landmark (optional)", autocomplete: "off", optional: true },
  { name: "city", label: "City", autocomplete: "address-level2" },
  { name: "state", label: "State", autocomplete: "address-level1" },
  { name: "pinCode", label: "PIN code", autocomplete: "postal-code" },
] as const;

const contactFields = [
  { name: "firstName", label: "First name", autocomplete: "given-name" },
  { name: "lastName", label: "Last name", autocomplete: "family-name" },
  { name: "phoneNumber", label: "Phone number", autocomplete: "tel" },
] as const;

function readGuestCart(): GuestCartLine[] {
  try {
    const raw = localStorage.getItem("florangi-cart-v1");
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value as GuestCartLine[] : [];
  } catch {
    return [];
  }
}

export function CheckoutForm() {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const quoteLock = useRef(false);
  const submitLock = useRef(false);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    pinCode: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [cart, setCart] = useState<CartState | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [guestCartLines, setGuestCartLines] = useState<GuestCartLine[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);

  async function loadCart() {
    const localLines = readGuestCart();
    if (localLines.length === 0) {
      router.replace("/cart");
      return;
    }
    setGuestCartLines(localLines);
    const response = await fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localLines),
      cache: "no-store",
    });
    const currentCart = await response.json() as CartState & { error?: string };
    if (!response.ok) throw new Error(currentCart.error ?? "Your cart could not be refreshed.");
    setCart(currentCart);
    if (currentCart.hasBlockingLines || currentCart.needsAcceptance) {
      setError("Review your cart before checkout: some items are unavailable or have a changed price.");
      return;
    }
    await loadQuote(paymentMethod, localLines);
  }

  async function loadQuote(method: "ONLINE" | "COD", guestLines = guestCartLines) {
    const response = await fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: method,
        ...(guestLines ? { lines: guestLines.map((line) => ({
          lineId: line.lineId,
          productId: line.productId,
          variantId: line.variantId,
          measurements: line.measurements,
          quantity: line.quantity,
          acceptedUnitPaise: line.acceptedUnitPaise,
          acceptedQuoteVersion: line.acceptedQuoteVersion,
        })) } : {}),
      }),
      cache: "no-store",
    });
    const result = await response.json() as CheckoutQuote & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Checkout totals could not be refreshed.");
    setQuote(result);
  }

  const loadCartOnMount = useEffectEvent(async () => {
    await loadCart();
  });

  useEffect(() => {
    startTransition(() => {
      void loadCartOnMount()
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Your cart could not be loaded."))
        .finally(() => setLoading(false));
    });
  }, []);

  async function refreshQuote(method: "ONLINE" | "COD") {
    if (quoteLock.current || busy) return;
    quoteLock.current = true;
    setQuoteLoading(true);
    setQuote(null);
    setError("");
    try {
      await loadQuote(method);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout totals could not be refreshed.");
    } finally {
      quoteLock.current = false;
      setQuoteLoading(false);
    }
  }

  function changePaymentMethod(method: "ONLINE" | "COD") {
    if (quoteLock.current || busy || method === paymentMethod) return;
    setPaymentMethod(method);
    void refreshQuote(method);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart || !quote || busy || quoteLock.current || submitLock.current) return;
    submitLock.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    const lines = quote.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId ?? null,
      measurements: line.measurements,
      quantity: line.quantity,
      acceptedUnitPaise: line.unitPricePaise,
      quoteVersion: line.quoteVersion,
    }));
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          paymentMethod,
          firstName: values.firstName,
          lastName: values.lastName,
          phoneNumber: values.phoneNumber,
          email: values.email,
          address: {
            line1: values.line1,
            line2: values.line2,
            landmark: values.landmark,
            city: values.city,
            state: values.state,
            pinCode: values.pinCode,
          },
          lines,
        }),
      });
      const result = await response.json() as { order?: { id: string }; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error ?? "Your order could not be placed.");
      if (paymentMethod === "ONLINE") {
        const paymentResponse = await fetch("/api/payments/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: result.order.id }),
        });
        const paymentOrder = await paymentResponse.json() as RazorpayClientOrder & { driver?: string; error?: string };
        if (!paymentResponse.ok) throw new Error(`${paymentOrder.error ?? "Payment could not be started."} Your order is saved; retry from order details.`);
        if (paymentOrder.driver === "mock") {
          router.push(`/orders/${result.order.id}/confirmation`);
          return;
        }
        await openRazorpayCheckout(paymentOrder, {
          onSuccess: async (payment: RazorpayPaymentResponse) => {
            const verified = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payment),
            });
            const verification = await verified.json() as { error?: string };
            if (!verified.ok) {
              setError(verification.error ?? "Payment is not verified yet. Check your order status.");
              submitLock.current = false;
              setBusy(false);
              return;
            }
            localStorage.removeItem("florangi-cart-v1");
            router.push(`/orders/${result.order!.id}/confirmation`);
          },
          onFailure: (message) => {
            setError(message);
            submitLock.current = false;
            setBusy(false);
          },
          onDismiss: () => { submitLock.current = false; setBusy(false); },
        });
        submitLock.current = false;
        setBusy(false);
        return;
      }
      localStorage.removeItem("florangi-cart-v1");
      router.push(`/orders/${result.order.id}/confirmation`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A network error interrupted checkout. Your details are still here; retry safely.");
      submitLock.current = false;
      setBusy(false);
    }
  }

  if (loading) return <p className="border-t border-border py-12 text-sm text-muted" role="status">Preparing your checkout…</p>;

  if (!cart || cart.hasBlockingLines || cart.needsAcceptance) {
    return (
      <div className="rounded-xl border border-danger-border bg-danger-bg p-6">
        <p className="text-sm leading-6 text-danger" role="alert">{error || "Your bag needs to be reviewed before checkout."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!cart && <Button onClick={() => {
            setLoading(true);
            setError("");
            void loadCart().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Your cart could not be loaded.")).finally(() => setLoading(false));
          }}>Try again</Button>}
          <Link className={buttonStyles()} href="/cart">Return to bag</Link>
        </div>
      </div>
    );
  }

  const containsCustom = cart.lines.some((line) => line.type === "CUSTOM_DRESS");
  const itemCount = cart.lines.reduce((total, line) => total + line.quantity, 0);
  const eagerImages = new Set(cart.lines.slice(0, 3).map((line) => line.imageUrl).filter((url): url is string => Boolean(url)));
  const inputClass = "mt-2 block min-h-12 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground focus:border-accent disabled:opacity-60";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <aside aria-labelledby="checkout-summary" className="rounded-xl border border-border bg-surface p-6 sm:p-8 lg:order-2 lg:sticky lg:top-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl" id="checkout-summary">Order summary</h2>
            <p className="mt-1 text-xs text-muted">{itemCount} {itemCount === 1 ? "item" : "items"} in your bag</p>
          </div>
          <Link className="inline-flex min-h-11 items-center text-xs font-medium text-accent underline underline-offset-4" href="/cart">Edit bag</Link>
        </div>
        <ul aria-label="Items in your bag" className="mt-4 max-h-72 divide-y divide-border overflow-y-auto" tabIndex={cart.lines.length > 3 ? 0 : undefined}>
          {cart.lines.map((line, index) => {
            const pricedLine = quote?.lines.find((item) => item.lineId === line.lineId);
            return (
              <li className="flex gap-3 py-4" key={line.lineId ?? `${line.productId}-${index}`}>
                <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                  {line.imageUrl ? <StoreImage src={line.imageUrl} alt="" fill loading={eagerImages.has(line.imageUrl) ? "eager" : "lazy"} sizes="64px" className="object-cover object-[center_35%]" /> : <ShoppingBag className="absolute inset-0 m-auto text-muted" size={22} strokeWidth={1.2} aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{line.productName ?? "Dress"}</p>
                  <p className="mt-1 text-xs text-muted">{line.type === "CUSTOM_DRESS" ? "Made to measure" : line.size ? `Size ${line.size}` : "Selected size"} · Qty {line.quantity}</p>
                  <p className="mt-2 text-sm font-semibold">{pricedLine?.lineTotalPaise === undefined ? "—" : formatPaise(pricedLine.lineTotalPaise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-4 border-t border-border pt-5 text-sm" aria-live="polite">
          <SummaryRow label="Subtotal" value={quote?.subtotalPaise} />
          <SummaryRow label="Shipping" value={quote?.shippingFeePaise} free />
          <div className="flex justify-between gap-4 border-t border-border pt-5 text-base font-semibold"><span>Total</span><span>{quote ? formatPaise(quote.totalPaise) : "—"}</span></div>
          {quoteLoading && <p className="text-xs text-muted" role="status">Updating totals…</p>}
        </div>
        {!quote && !quoteLoading && error && (
          <div className="mt-5 rounded-lg border border-danger-border bg-danger-bg p-4">
            <p className="text-sm leading-6 text-danger" role="alert">{error}</p>
            <Button className="mt-3 w-full" onClick={() => void refreshQuote(paymentMethod)}>Retry totals</Button>
          </div>
        )}
        <p className="mt-5 text-xs leading-5 text-muted">Prices and availability are checked again when you place your order.</p>
      </aside>

      <form className="space-y-6 lg:order-1" onSubmit={submit}>
        <fieldset className="rounded-xl border border-border bg-surface p-5 sm:p-8" disabled={busy}>
          <legend className="sr-only">Your contact details</legend>
          <h2 className="font-serif text-3xl">Your contact details</h2>
          <p className="mt-1 text-sm leading-6 text-muted">We’ll use these details to contact you about your order.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {contactFields.map((field) => (
              <label className="text-sm font-medium" htmlFor={field.name} key={field.name}>
                {field.label}
                <input
                  autoComplete={field.autocomplete}
                  className={inputClass}
                  id={field.name}
                  name={field.name}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  pattern={field.name === "phoneNumber" ? "(\\+91(?:-| )?)?[6-9][0-9]{9}" : undefined}
                  required
                  type={field.name === "phoneNumber" ? "tel" : "text"}
                  value={values[field.name]}
                />
              </label>
            ))}
            <label className="text-sm font-medium" htmlFor="checkoutEmail">
              Email address
              <input autoComplete="email" className={inputClass} id="checkoutEmail" name="email" onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} required type="email" value={values.email} />
            </label>
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-border bg-surface p-5 sm:p-8" disabled={busy}>
          <legend className="sr-only">Delivery address</legend>
          <h2 className="font-serif text-3xl">Delivery address</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Tell us where to send your order in India.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {addressFields.map((field) => (
              <label className={`text-sm font-medium ${field.name === "line1" || field.name === "line2" ? "sm:col-span-2" : ""}`} htmlFor={field.name} key={field.name}>
                {field.label}
                <input
                  autoComplete={field.autocomplete}
                  className={inputClass}
                  id={field.name}
                  inputMode={field.name === "pinCode" ? "numeric" : undefined}
                  maxLength={field.name === "pinCode" ? 6 : 240}
                  name={field.name}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  pattern={field.name === "pinCode" ? "[1-9][0-9]{5}" : undefined}
                  required={!(("optional" in field) && field.optional)}
                  value={values[field.name]}
                />
                {field.name === "pinCode" && <span className="mt-1 block text-xs font-normal text-muted">India only · six-digit PIN</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-border bg-surface p-5 sm:p-8" disabled={busy || quoteLoading}>
          <legend className="sr-only">Payment method</legend>
          <h2 className="font-serif text-3xl">Payment method</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Choose how you would like to pay.</p>
          <div className="mt-6 grid gap-3">
            <label className={`flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border p-4 ${paymentMethod === "ONLINE" ? "border-accent bg-surface-hover" : "border-border-strong"}`}>
              <input checked={paymentMethod === "ONLINE"} name="paymentMethod" onChange={() => changePaymentMethod("ONLINE")} type="radio" />
              <CreditCard className="text-accent" size={21} strokeWidth={1.5} aria-hidden="true" />
              <span><span className="block text-sm font-semibold">Pay online</span><span className="mt-1 block text-xs text-muted">Continue to online payment after placing your order.</span></span>
            </label>
            <label className={`flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border p-4 ${paymentMethod === "COD" ? "border-accent bg-surface-hover" : "border-border-strong"}`}>
              <input checked={paymentMethod === "COD"} name="paymentMethod" onChange={() => changePaymentMethod("COD")} type="radio" />
              <Banknote className="text-accent" size={21} strokeWidth={1.5} aria-hidden="true" />
              <span><span className="block text-sm font-semibold">Cash on Delivery</span><span className="mt-1 block text-xs text-muted">Pay when your order is delivered.</span></span>
            </label>
          </div>
          {paymentMethod === "COD" && containsCustom && (
            <p className="mt-4 rounded-lg border border-warning-border bg-warning-bg p-4 text-sm leading-6 text-warning">This dress is made to your measurements and cannot be resold. Please place a Cash on Delivery order only if you intend to accept delivery.</p>
          )}
        </fieldset>
        {!quote && !quoteLoading && error && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger-border bg-danger-bg p-4">
            <p className="text-sm text-danger">Your totals couldn’t be updated.</p>
            <Button size="sm" onClick={() => void refreshQuote(paymentMethod)}>Retry totals</Button>
          </div>
        )}
        {error && quote && <p className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger" role="alert">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline" href="/cart"><ArrowLeft size={16} aria-hidden="true" /> Return to bag</Link>
          <Button className="min-h-12 sm:min-w-64" variant="primary" disabled={busy || quoteLoading || !quote} type="submit">
            {busy ? "Placing order…" : paymentMethod === "COD" ? "Place Cash on Delivery order" : "Place order"} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function SummaryRow({ label, value, free = false }: { label: string; value?: number; free?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted">{label}</span><span>{value === undefined ? "—" : free && value === 0 ? "Free" : formatPaise(value)}</span></div>;
}