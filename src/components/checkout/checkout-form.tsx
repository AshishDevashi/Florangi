"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { formatPaise } from "@/server/domain/money";
import { openRazorpayCheckout, type RazorpayClientOrder, type RazorpayPaymentResponse } from "@/components/checkout/payment-client";

type CartLine = {
  lineId?: string;
  productId: string;
  productName?: string;
  type?: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  variantId?: string | null;
  size?: string;
  measurements?: Record<string, unknown>;
  quantity: number;
  acceptedUnitPaise?: number | null;
  unitPricePaise?: number;
  lineTotalPaise?: number;
  quoteVersion?: string;
  state: string;
};

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

  async function changePaymentMethod(method: "ONLINE" | "COD") {
    setPaymentMethod(method);
    setQuote(null);
    setError("");
    try {
      await loadQuote(method);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout totals could not be refreshed.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart || !quote || busy) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    const lines = cart.lines.map((line) => ({
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
              setBusy(false);
              return;
            }
            localStorage.removeItem("florangi-cart-v1");
            router.push(`/orders/${result.order!.id}/confirmation`);
          },
          onFailure: (message) => {
            setError(message);
            setBusy(false);
          },
          onDismiss: () => setBusy(false),
        });
        setBusy(false);
        return;
      }
      localStorage.removeItem("florangi-cart-v1");
      router.push(`/orders/${result.order.id}/confirmation`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A network error interrupted checkout. Your details are still here; retry safely.");
      setBusy(false);
    }
  }

  if (loading) return <p className="py-10 text-sm text-muted" role="status">Loading checkout…</p>;

  const containsCustom = cart?.lines.some((line) => line.type === "CUSTOM_DRESS") ?? false;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_21rem]">
      <form className="space-y-8" onSubmit={submit}>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 font-serif text-2xl">Your contact details</legend>
          {contactFields.map((field) => (
            <label className="text-sm" htmlFor={field.name} key={field.name}>
              {field.label}
              <input
                autoComplete={field.autocomplete}
                className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3"
                id={field.name}
                name={field.name}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                pattern={field.name === "phoneNumber" ? "(\\+91[- ]?)?[6-9][0-9]{9}" : undefined}
                required
                type="text"
                value={values[field.name]}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2" htmlFor="checkoutEmail">
            Email address
            <input autoComplete="email" className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3 sm:max-w-md" id="checkoutEmail" name="email" onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} required type="email" value={values.email} />
          </label>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 font-serif text-2xl">Delivery address</legend>
          {addressFields.map((field) => (
            <label className={`text-sm ${field.name === "line1" || field.name === "line2" ? "sm:col-span-2" : ""}`} htmlFor={field.name} key={field.name}>
              {field.label}
              <input
                autoComplete={field.autocomplete}
                className="mt-1 block min-h-11 w-full border border-border-strong bg-surface px-3 outline-none focus:border-accent focus:ring-2 focus:ring-focus/20"
                id={field.name}
                maxLength={field.name === "pinCode" ? 6 : 240}
                name={field.name}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                pattern={field.name === "pinCode" ? "[1-9][0-9]{5}" : undefined}
                required={!(("optional" in field) && field.optional)}
                value={values[field.name]}
              />
              {field.name === "pinCode" && <span className="mt-1 block text-xs text-muted">India only · six-digit PIN</span>}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-3 border-t border-border pt-6">
          <legend className="font-serif text-2xl">Payment method</legend>
          <label className={`flex min-h-14 items-center gap-3 border px-4 ${paymentMethod === "ONLINE" ? "border-accent bg-surface" : "border-border-strong"}`}>
            <input checked={paymentMethod === "ONLINE"} name="paymentMethod" onChange={() => void changePaymentMethod("ONLINE")} type="radio" />
            <span className="text-sm font-medium">Pay online</span>
          </label>
          <label className={`flex min-h-14 items-center gap-3 border px-4 ${paymentMethod === "COD" ? "border-accent bg-surface" : "border-border-strong"}`}>
            <input checked={paymentMethod === "COD"} name="paymentMethod" onChange={() => void changePaymentMethod("COD")} type="radio" />
            <span className="text-sm font-medium">Cash on Delivery</span>
          </label>
          {paymentMethod === "COD" && containsCustom && (
            <p className="border-l-2 border-warning-border bg-surface px-4 py-3 text-sm leading-6 text-warning">This dress is made to your measurements and cannot be resold. Please place a Cash on Delivery order only if you intend to accept delivery.</p>
          )}
        </fieldset>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button className="min-h-12 w-full bg-accent px-5 text-sm font-semibold text-on-accent disabled:cursor-wait disabled:opacity-50 sm:w-auto" disabled={busy || !quote || !cart || cart.hasBlockingLines || cart.needsAcceptance} type="submit">
          {busy ? "Placing order…" : paymentMethod === "COD" ? "Place Cash on Delivery order" : "Place order"}
        </button>
      </form>

      <aside className="h-fit border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6">
        <h2 className="font-serif text-2xl">Order summary</h2>
        <ul className="mt-4 divide-y divide-border text-sm">
          {cart?.lines.map((line) => (
            <li className="flex justify-between gap-4 py-3" key={line.lineId}>
              <span>{line.productName ?? "Dress"} · {line.type === "CUSTOM_DRESS" ? "Custom" : line.size} × {line.quantity}</span>
              <span className="shrink-0">{formatPaise(line.lineTotalPaise ?? 0)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <SummaryRow label="Subtotal" value={quote?.subtotalPaise} />
          <SummaryRow label="Shipping" value={quote?.shippingFeePaise} />
          <div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Total</span><span>{formatPaise(quote?.totalPaise ?? 0)}</span></div>
        </div>
        <Link className="mt-5 inline-block text-xs underline" href="/cart">Return to bag</Link>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: number }) {
  return <div className="flex justify-between"><span>{label}</span><span>{formatPaise(value ?? 0)}</span></div>;
}