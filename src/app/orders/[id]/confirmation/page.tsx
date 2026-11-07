import Link from "next/link";
import { getGuestOrder } from "@/server/services/orders";
import { formatPaise } from "@/server/domain/money";
import { getEnvironment } from "@/server/env";
import { PaymentAction } from "@/components/checkout/payment-action";
import { GuestOrderAccessGate } from "@/components/orders/guest-order-access-gate";

export const instant = false;

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getGuestOrder(id);
  if (!order) return <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-6 sm:px-8"><GuestOrderAccessGate orderId={id} /></main>;
  const environment = getEnvironment();

  const cod = order.paymentMethod === "COD";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8">
      <header className="border-b border-stone-200 pb-5"><Link className="font-serif text-2xl font-semibold" href="/">Florangi</Link></header>
      <section className="flex flex-1 flex-col justify-center py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{cod ? "Order received" : "Payment pending"}</p>
        <h1 className="mt-3 font-serif text-4xl">{cod ? "Thank you for your order." : "Your order is waiting for payment."}</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Order {order.orderNumber} · {formatPaise(order.totalPaise)}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{cod ? "Your order is awaiting owner approval. You will receive an email with the order details." : "Your order is saved and its stock is reserved for 30 minutes. Payment retry will be available when the payment gateway is connected."}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="min-h-11 bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white" href={`/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}`}>View order</Link>
          <Link className="min-h-11 border border-stone-300 px-5 py-3 text-sm" href={`/orders/${order.id}`}>Manage order</Link>
        </div>
        {order.fulfillmentStatus === "PENDING_PAYMENT" && <PaymentAction orderId={order.id} mode={environment.PAYMENT_DRIVER} />}
      </section>
    </main>
  );
}