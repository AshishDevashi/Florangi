export type RazorpayPaymentResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayClientOrder = {
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string | null;
};

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
};

type RazorpayCheckout = {
  open(): void;
  on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

let scriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpayCheckout(
  order: RazorpayClientOrder,
  handlers: {
    onSuccess: (response: RazorpayPaymentResponse) => void | Promise<void>;
    onFailure: (message: string) => void;
    onDismiss: () => void;
  },
): Promise<void> {
  if (!order.keyId) throw new Error("Razorpay public key is not configured.");
  if (!(await loadRazorpayScript()) || !window.Razorpay) throw new Error("Razorpay Checkout could not be loaded.");

  const checkout = new window.Razorpay({
    key: order.keyId,
    order_id: order.providerOrderId,
    amount: order.amountPaise,
    currency: order.currency,
    name: "Florangi",
    description: "Florangi order payment",
    handler: handlers.onSuccess,
    modal: { ondismiss: handlers.onDismiss },
    theme: { color: "#694653" },
  });
  checkout.on("payment.failed", (response) => handlers.onFailure(response.error?.description ?? "Payment failed. You can retry while the order is awaiting payment."));
  checkout.open();
}