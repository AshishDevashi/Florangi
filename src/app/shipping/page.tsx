import Link from "next/link";
import { PolicyPage } from "@/components/policies/policy-page";

export const metadata = { title: "Shipping & delivery | Florangi" };

export default function ShippingPage() {
  return (
    <PolicyPage title="Shipping & delivery" draft>
      <section>
        <h2>Shipping charges</h2>
        <p>Your bag and checkout show the shipping charge and order total. Charges are calculated from the store’s current shipping settings and are checked again when you place your order.</p>
      </section>
      <section>
        <h2>Preparing your order</h2>
        <p>Orders are reviewed before preparation. Dispatch estimates may be shown with a dress or order update; these are estimates, not delivery dates.</p>
      </section>
      <section>
        <h2>Track your order</h2>
        <p>Use your order number on the <Link href="/track-order">tracking page</Link> to see the order status and available shipping progress.</p>
      </section>
      <section>
        <h2>Delivery details under review</h2>
        <p>Delivery coverage, final shipping charges, working-day calculations, holidays and exceptions must be confirmed by the owner before launch.</p>
      </section>
    </PolicyPage>
  );
}