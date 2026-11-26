import Link from "next/link";
import { PolicyPage } from "@/components/policies/policy-page";

export const metadata = { title: "Terms & conditions | Florangi" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms & conditions" draft>
      <section>
        <h2>Shopping with Florangi</h2>
        <p>Orders can be placed as a guest. Prices, availability and shipping are checked again at checkout, and orders are reviewed by the Florangi team before preparation.</p>
      </section>
      <section>
        <h2>Payment and custom dresses</h2>
        <p>Checkout offers online payment and Cash on Delivery. Made-to-measure dresses require measurements; please check them carefully before placing your order.</p>
      </section>
      <section>
        <h2>Shipping and replacements</h2>
        <p>See the <Link href="/shipping">shipping page</Link> for information about delivery and the <Link href="/replacement">replacements page</Link> for replacement requests. Both remain subject to owner approval.</p>
      </section>
      <section>
        <h2>Terms still under review</h2>
        <p>Cancellation, refunds, tax presentation, custom-garment acceptance and dispute terms require owner and legal review before launch.</p>
      </section>
    </PolicyPage>
  );
}