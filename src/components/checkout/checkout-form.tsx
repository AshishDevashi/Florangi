"use client";

import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Banknote, CreditCard, ShoppingBag } from "lucide-react";
import { StoreImage } from "@/components/storefront/store-image";
import { Button, buttonStyles } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderConfirmDialog } from "@/components/checkout/order-confirm-dialog";
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

type SavedOrder = { id: string; orderNumber: string };
type CheckoutPhase = "creating" | "opening" | "payment" | "verifying" | "redirecting";

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<CheckoutPhase | null>(null);
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null);

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

  function requestConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart || !quote || busy || quoteLock.current || submitLock.current || savedOrder) return;
    setConfirmOpen(true);
  }

  async function submitOrder() {
    if (!cart || !quote || busy || quoteLock.current || submitLock.current || savedOrder) return;
    submitLock.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    setConfirmOpen(false);
    setBusy(true);
    setPhase("creating");
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
      const result = await response.json() as { order?: SavedOrder; error?: string };
      if (!response.ok || !result.order?.id || !result.order.orderNumber) throw new Error(result.error ?? "Your order could not be placed.");
      const order = result.order;
      setSavedOrder(order);
      const trackUrl = `/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}`;
      if (paymentMethod === "ONLINE") {
        setPhase("opening");
        const paymentResponse = await fetch("/api/payments/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id }),
        });
        const paymentOrder = await paymentResponse.json() as RazorpayClientOrder & { driver?: string; error?: string };
        if (!paymentResponse.ok) throw new Error(`${paymentOrder.error ?? "Payment could not be started."} Your order is saved; retry from order details.`);
        if (paymentOrder.driver === "mock") {
          setPhase("redirecting");
          router.replace(trackUrl);
          return;
        }
        let verificationStarted = false;
        let dismissed = false;
        let paymentFailure = "";
        await openRazorpayCheckout(paymentOrder, {
          onSuccess: async (payment: RazorpayPaymentResponse) => {
            if (verificationStarted) return;
            verificationStarted = true;
            submitLock.current = true;
            setBusy(true);
            setError("");
            setPhase("verifying");
            try {
              const verified = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payment),
              });
              const verification = await verified.json() as { error?: string };
              if (!verified.ok) throw new Error(verification.error ?? "Payment could not be verified yet.");
              localStorage.removeItem("florangi-cart-v1");
              setPhase("redirecting");
              router.replace(trackUrl);
            } catch (caught) {
              const detail = caught instanceof Error ? caught.message : "The verification request was interrupted.";
              setError(`${detail} Your payment status is not confirmed. Check your order before attempting payment again.`);
              submitLock.current = false;
              setBusy(false);
              setPhase(null);
            }
          },
          onFailure: (message) => {
            if (verificationStarted || dismissed) return;
            paymentFailure = message;
          },
          onDismiss: () => {
            if (verificationStarted || dismissed) return;
            dismissed = true;
            setError(`${paymentFailure ? `${paymentFailure} ` : "Payment was closed. "}Your order is saved; check its status before retrying payment.`);
            submitLock.current = false;
            setBusy(false);
            setPhase(null);
          },
        });
        if (!verificationStarted && !dismissed) setPhase("payment");
        return;
      }
      localStorage.removeItem("florangi-cart-v1");
      setPhase("redirecting");
      router.replace(trackUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A network error interrupted checkout. Your details are still here; retry safely.");
      submitLock.current = false;
      setBusy(false);
      setPhase(null);
    }
  }

  if (loading) return <CheckoutSkeleton />;

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
    <>
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
                  <p className="mt-2 text-sm font-semibold">{quoteLoading ? <Skeleton className="h-4 w-20" /> : pricedLine?.lineTotalPaise === undefined ? "—" : formatPaise(pricedLine.lineTotalPaise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-4 border-t border-border pt-5 text-sm" aria-live="polite">
          <SummaryRow label="Subtotal" value={quote?.subtotalPaise} loading={quoteLoading} />
          <SummaryRow label="Shipping" value={quote?.shippingFeePaise} loading={quoteLoading} free />
          <div className="flex justify-between gap-4 border-t border-border pt-5 text-base font-semibold"><span>Total</span><span>{quoteLoading ? <Skeleton className="h-5 w-20" /> : quote ? formatPaise(quote.totalPaise) : "—"}</span></div>
          {quoteLoading && <span className="sr-only" role="status">Updating totals…</span>}
        </div>
        {!quote && !quoteLoading && error && (
          <div className="mt-5 rounded-lg border border-danger-border bg-danger-bg p-4">
            <p className="text-sm leading-6 text-danger" role="alert">{error}</p>
            <Button className="mt-3 w-full" onClick={() => void refreshQuote(paymentMethod)}>Retry totals</Button>
          </div>
        )}
        <p className="mt-5 text-xs leading-5 text-muted">Prices and availability are checked again when you place your order.</p>
      </aside>

      <form className="space-y-6 lg:order-1" onSubmit={requestConfirmation}>
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
        {savedOrder && !busy && (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm">
            <p>Your order {savedOrder.orderNumber} is saved.</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link className="font-semibold text-accent underline" href={`/orders/${encodeURIComponent(savedOrder.id)}`}>Open secure order details</Link>
              <Link className="font-semibold text-accent underline" href={`/track-order?orderNumber=${encodeURIComponent(savedOrder.orderNumber)}`}>Track order</Link>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent hover:underline" href="/cart"><ArrowLeft size={16} aria-hidden="true" /> Return to bag</Link>
          <Button className="min-h-12 sm:min-w-64" variant="primary" disabled={busy || quoteLoading || !quote || Boolean(savedOrder)} type="submit">
            {busy ? "Placing order…" : paymentMethod === "COD" ? "Place Cash on Delivery order" : "Place order"} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
    <OrderConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => void submitOrder()} paymentMethod={paymentMethod} totalPaise={quote?.totalPaise ?? 0} />
    {phase && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-5">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-2xl" role="status" aria-live="polite">
          <span className="mx-auto block size-8 rounded-full border-2 border-border border-t-accent motion-safe:animate-spin" aria-hidden="true" />
          <p className="mt-4 font-serif text-2xl">{phase === "verifying" ? "Verifying your payment" : phase === "redirecting" ? "Opening your order" : phase === "payment" ? "Complete your payment" : phase === "opening" ? "Opening secure payment" : "Placing your order"}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{phase === "verifying" ? "Please wait while we check the payment. Do not close this page." : phase === "payment" ? "Continue in the secure payment window." : "Please keep this page open."}</p>
          {phase === "redirecting" && savedOrder && <Link className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline" href={`/track-order?orderNumber=${encodeURIComponent(savedOrder.orderNumber)}`}>Open tracking</Link>}
        </div>
      </div>
    )}
    </>
  );
}

function CheckoutSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Preparing your checkout…</span>
      <div aria-hidden="true" className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 lg:order-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
          <div className="mt-4 flex gap-3 border-b border-border py-4">
            <Skeleton className="aspect-[3/4] w-16 shrink-0" />
            <div className="flex-1 space-y-3 pt-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <div className="space-y-4 pt-5">
            {[0, 1, 2].map((row) => <div className="flex justify-between" key={row}><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-16" /></div>)}
          </div>
        </div>
        <div className="space-y-6 lg:order-1">
          {[4, 6].map((fieldCount) => (
            <div className="rounded-xl border border-border bg-surface p-5 sm:p-8" key={fieldCount}>
              <Skeleton className="h-8 w-48 max-w-full" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {Array.from({ length: fieldCount }, (_, index) => (
                  <div key={index}><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-12 w-full" /></div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-surface p-5 sm:p-8">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <div className="mt-6 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, loading = false, free = false }: { label: string; value?: number; loading?: boolean; free?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted">{label}</span><span>{loading ? <Skeleton className="h-4 w-16" /> : value === undefined ? "—" : free && value === 0 ? "Free" : formatPaise(value)}</span></div>;
}