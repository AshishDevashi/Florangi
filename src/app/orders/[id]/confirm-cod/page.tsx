import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestOrder } from "@/server/services/orders";
import { CodConfirmationForm } from "@/components/orders/cod-confirmation-form";
import { GuestOrderAccessGate } from "@/components/orders/guest-order-access-gate";

export const instant = false;

export default async function ConfirmCodOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getGuestOrder(id);
  if (!order) return <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8"><GuestOrderAccessGate orderId={id} /></main>;
  if (order.paymentMethod !== "COD" || !order.lines.some((line) => line.productType === "CUSTOM_DRESS")) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-6 sm:px-8">
      <header className="border-b border-stone-200 pb-5"><Link className="font-serif text-2xl font-semibold" href="/">Florangi</Link></header>
      <section className="flex flex-1 flex-col justify-center py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Custom order confirmation</p>
        <h1 className="mt-3 font-serif text-4xl">Confirm order {order.orderNumber}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">This deliberate confirmation tells Florangi that you intend to accept the made-to-measure Cash on Delivery order. Opening this page alone does not confirm it, and confirmation does not replace owner approval.</p>
        {order.confirmedAt ? <p className="mt-6 text-sm text-emerald-800" role="status">Your custom order is already confirmed.</p> : <CodConfirmationForm orderId={order.id} />}
      </section>
    </main>
  );
}