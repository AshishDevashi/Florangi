import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import { Button, buttonStyles } from "@/components/ui/button";
import { listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import styles from "@/components/storefront/home.module.css";

export const metadata = { title: "Contact us | Florangi" };
export const instant = false;

const fieldClass = "mt-2 block min-h-12 w-full rounded-none border border-border-strong bg-background px-4 py-3 text-base text-foreground placeholder:text-muted sm:text-sm";

export default async function ContactPage() {
  await connection();
  const [categories, products] = await Promise.all([listVisibleCategories(), listHomepageProducts()]);
  return (
    <div className={styles.home}>
      <StoreHeader homepage={false} categories={categories} products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content" className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">
        <div className="pb-14 pt-12 sm:pb-20 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">We&apos;re here for you</p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.05] sm:text-6xl">Let&apos;s talk about it.</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-muted">Whether it&apos;s finding your fit, choosing a dress, or asking about an order, we&apos;d love to hear from you.</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)] lg:gap-8">
            <section aria-labelledby="message-title" className="border border-border bg-surface p-6 sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Get in touch</p>
              <h2 className="mt-2 font-serif text-3xl" id="message-title">Leave us a message</h2>
              <p className="mt-3 text-sm leading-6 text-muted" id="message-note">This form is a preview and does not send messages yet. Please use WhatsApp to contact us.</p>

              <div className="mt-7 grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-medium" htmlFor="contact-name">Name
                    <input autoComplete="name" className={fieldClass} id="contact-name" name="name" placeholder="Your name" type="text" />
                  </label>
                  <label className="text-sm font-medium" htmlFor="contact-email">Email address
                    <input autoComplete="email" className={fieldClass} id="contact-email" name="email" placeholder="you@example.com" type="email" />
                  </label>
                </div>
                <label className="text-sm font-medium" htmlFor="contact-phone">Phone number <span className="font-normal text-muted">(optional)</span>
                  <input autoComplete="tel" className={fieldClass} id="contact-phone" name="phone" placeholder="Your phone number" type="tel" />
                </label>
                <label className="text-sm font-medium" htmlFor="contact-message">Your message
                  <textarea className={`${fieldClass} min-h-36 resize-y`} id="contact-message" name="message" placeholder="Tell us how we can help" rows={5} />
                </label>
                <Button aria-describedby="message-note" className="w-full rounded-none sm:w-fit" disabled type="button" variant="primary">Send message</Button>
              </div>
            </section>

            <aside aria-labelledby="chat-title" className="flex flex-col justify-between bg-espresso p-6 text-ivory sm:p-9">
              <div>
                <div className="flex size-12 items-center justify-center border border-ivory/30"><MessageCircle size={22} strokeWidth={1.5} aria-hidden="true" /></div>
                <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-ivory/75">A more personal touch</p>
                <h2 className="mt-3 font-serif text-4xl leading-tight" id="chat-title">Let&apos;s chat on WhatsApp.</h2>
                <p className="mt-4 max-w-sm text-sm leading-7 text-ivory/80">Have a question? Start a conversation with us on WhatsApp.</p>
                <a className={buttonStyles({ variant: "primary", className: "mt-7 w-full rounded-none sm:w-auto" })} href="https://wa.me/919999888877" rel="noopener noreferrer" target="_blank">
                  <MessageCircle size={17} aria-hidden="true" /> Chat with us <ArrowUpRight size={16} aria-hidden="true" />
                </a>
                <p className="mt-3 text-xs leading-6 text-ivory/75">Opens WhatsApp in a new tab. Your form details are not sent.</p>
              </div>
              <div className="mt-10 border-t border-ivory/20 pt-6">
                <p className="font-serif text-2xl">Looking for an order?</p>
                <Link className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4" href="/track-order">Track your order <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}
