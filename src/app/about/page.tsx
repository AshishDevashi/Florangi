import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreImage } from "@/components/storefront/store-image";
import { buttonStyles } from "@/components/ui/button";
import { listHomepageProducts, listVisibleCategories } from "@/server/services/catalog";
import styles from "@/components/storefront/home.module.css";

export const metadata = { title: "About us | Florangi", description: "Meet Sadikshya Gautam, the designer and owner behind Florangi." };
export const instant = false;

const designerImage = "https://res.cloudinary.com/gcwuldiv/image/upload/v1/brand/about/79f70a1a-05c4-481b-9fb8-77cd8a1f2c4d?_a=BAMAROGo0";

export default async function AboutPage() {
  await connection();
  const [categories, products] = await Promise.all([listVisibleCategories(), listHomepageProducts()]);

  return (
    <div className={styles.home}>
      <StoreHeader homepage={false} categories={categories} products={products.map(({ id, name, slug, images, category }) => ({ id, name, slug, images: images.slice(0, 1), category }))} />
      <main id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The story of Florangi</p>
            <h1 className="mt-5 font-serif text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">A little more you. A little more beautiful.</h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-muted sm:text-base">Florangi is a celebration of femininity in all its forms—soft and strong, graceful and bold, and always entirely your own.</p>
            <p className="mt-4 max-w-lg text-sm leading-7 text-muted sm:text-base">From a special occasion to a moment that simply feels like yours, we believe the right dress should feel as personal as the woman wearing it.</p>
            <Link className={buttonStyles({ variant: "primary", className: "mt-7 min-h-12 rounded-none px-6" })} href="/collections">Explore the collection <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <figure className="min-w-0">
            <StoreImage
              src={designerImage}
              alt="Sadikshya Gautam seated with flowers. Text reads: She is confident. She is bold. She is here to make her mark."
              width={797}
              height={768}
              loading="eager"
              sizes="(max-width: 1023px) 100vw, 50vw"
              className="h-auto w-full bg-surface-muted"
            />
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-serif text-2xl">Sadikshya Gautam</span>
              <span className="text-xs uppercase tracking-[0.12em] text-muted">Designer &amp; owner</span>
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="difference-heading" className="bg-surface px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The Florangi difference</p>
              <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl" id="difference-heading">Made for the way you want to feel.</h2>
            </div>
            <div className="mt-10 grid gap-8 sm:mt-12 md:grid-cols-3 md:gap-10">
              <div className="border-t border-border-strong pt-5">
                <p className="text-xs tracking-[0.14em] text-accent">01</p>
                <h3 className="mt-3 font-serif text-3xl">Femininity, your way</h3>
                <p className="mt-3 text-sm leading-7 text-muted">Romantic, expressive, understated or bold—there is no single way to be feminine. Your dress should reflect yours.</p>
              </div>
              <div className="border-t border-border-strong pt-5">
                <p className="text-xs tracking-[0.14em] text-accent">02</p>
                <h3 className="mt-3 font-serif text-3xl">A personal fit</h3>
                <p className="mt-3 text-sm leading-7 text-muted">Explore designer dresses and made-to-measure options, with room to find a fit that feels right for you.</p>
              </div>
              <div className="border-t border-border-strong pt-5">
                <p className="text-xs tracking-[0.14em] text-accent">03</p>
                <h3 className="mt-3 font-serif text-3xl">For your moments</h3>
                <p className="mt-3 text-sm leading-7 text-muted">For celebrations big and small, our occasionwear is chosen with the moments you want to remember in mind.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Meet the designer</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">The woman behind Florangi.</h2>
          </div>
          <div className="max-w-xl">
            <p className="text-base leading-8 text-foreground">Sadikshya Gautam is the designer and owner of Florangi. Her point of view brings together feminine expression and the belief that what you wear can feel deeply personal.</p>
            <p className="mt-4 text-sm leading-7 text-muted">Florangi is here for the moments when you want to feel like yourself—confident, beautiful and ready to make your mark.</p>
            <Link className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline" href="/contact">Get in touch <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <StoreFooter homepage={false} />
    </div>
  );
}
