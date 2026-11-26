# Image-led storefront homepage

## Owner direction

The owner requested a complete redesign of the first editorial homepage: substantially larger collection and product images, less empty space and copy, more visible collections, and a layout designed for mobile browsing. The approved colors and Cormorant Garamond / Manrope typography remain unchanged.

## Research and references

Reviewed on 14 November 2026:

- [Baymard: homepage product breadth](https://baymard.com/research-articles/inferring-product-catalog-from-homepage). Product and category imagery helps visitors understand the range. This is especially important when mobile navigation is collapsed. A carousel should not be the only way to discover the catalog.
- [Baymard: apparel and accessories UX](https://baymard.com/research/apparel-and-accessories). Clothing on human models helps shoppers evaluate length and fit; style and occasion are useful browsing paths.
- [Baymard: homepage design examples](https://baymard.com/homepage-and-category-usability/benchmark/page-types/homepage). Support category navigation, search and curated discovery paths together.
- [Babyboo](https://www.babyboofashion.com/), [House of CB](https://app.houseofcb.com/) and [EM Clothing](https://emclothingau.com/). These references informed campaign-sized photography, compact shopping navigation and repeated transitions from collection images to product merchandising. Florangi uses its own catalog photography and identity.

These findings guide the implementation; no measured conversion or engagement uplift is claimed without analytics and testing.

## Implemented browsing flow

1. Compact sticky navigation and a full-width campaign. A single model photograph fills the mobile hero; desktop uses two photographs. Only a collection name and shopping action overlay the images.
2. All six current collection image links immediately below the hero. Desktop shows the full row; narrower screens support native horizontal scrolling and scroll snapping. The mobile menu also lists the same category destinations directly.
3. Eight dresses displayed immediately with names, prices and size availability. Collection filters and load more are retained. Desktop uses four columns; mobile uses two.
4. Two large occasion campaigns link to their actual collections, followed by four shoppable spotlight products using alternate photographs.
5. A bridal collection campaign and a compact care/footer area. The previous large prose section and decorative text ribbons are removed.

No auto-advancing hero, invented sales claims, fake testimonials, inactive wishlist controls or unconnected newsletter form are introduced. Images are delivered responsively from Cloudinary; the main hero is preloaded and the desktop companion loads eagerly. Lower-page photos are lazy-loaded except a collection thumbnail reusing the hero image, which also loads eagerly to prevent Next.js from misidentifying the hero as lazy. Catalog visibility and stock still come from existing server services.
