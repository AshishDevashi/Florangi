import Link from "next/link";
import { PolicyPage } from "@/components/policies/policy-page";

export const metadata = { title: "Privacy policy | Florangi" };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy policy" draft>
      <section>
        <h2>Information provided with an order</h2>
        <p>Guest checkout collects your name, email address, phone number and delivery address. Orders may also include dress measurements and, if you request a replacement, details and photos you provide.</p>
      </section>
      <section>
        <h2>How information is used</h2>
        <p>These details are used to process and fulfil orders, communicate order updates, and handle requests related to your purchase. Payment, delivery, email and image-storage providers may process information needed for their services.</p>
      </section>
      <section>
        <h2>Your browser and order access</h2>
        <p>Your bag is stored in your browser. A secure order-specific link can give your browser access to private order actions. Anyone with an order number can use <Link href="/track-order">order tracking</Link> to see limited order and shipping information, so please keep it private.</p>
      </section>
      <section>
        <h2>Retention and your requests</h2>
        <p>Retention periods, deletion requests, sharing details and a verified privacy contact are still to be confirmed. These details require owner and legal review before launch.</p>
      </section>
    </PolicyPage>
  );
}