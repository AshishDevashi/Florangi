# Florangi visual identity

The approved palette is **Romantic Luxury — Soft, Earthy & Feminine**. It applies to the storefront, admin, checkout and transactional emails.

| Color | Hex | Use |
| --- | --- | --- |
| Warm Ivory | `#F5EEE5` | Page background and text on primary actions |
| Dusty Rose | `#B77C80` | Decorative accents, selection and tinted feedback backgrounds |
| Deep Plum | `#694653` | Primary actions, links, focus outlines and destructive action text |
| Soft Sage | `#A6A58B` | Success borders and tinted success backgrounds |
| Espresso Brown | `#342B2B` | Main text and primary hover states |

## Implementation

`src/app/globals.css` defines the five base colors and semantic tokens. Tailwind's `@theme inline` exposes utilities such as `bg-surface`, `text-accent`, `border-border`, `text-muted` and `bg-success-bg`. Use these semantic utilities for UI roles rather than raw hex values or Tailwind's stock color families. Subtle surface, border and feedback variations are derived with `color-mix`; they do not introduce a separate palette.

Use Espresso or Plum for readable text on light surfaces. Rose and Sage are decorative colors, not small text colors on Ivory. Primary buttons pair Plum with Ivory. Feedback must retain explanatory text and existing alert/status semantics; color alone does not communicate the result. Visible keyboard focus uses Plum.

External integrations cannot consume the app stylesheet. Keep the inline email colors in `src/server/email/provider.ts` and Razorpay's theme color in `src/components/checkout/payment-client.ts` synchronized with the base palette. Email colors use literal hex values for email-client compatibility.

## Storefront homepage

The homepage prioritizes photography: an edge-to-edge collection campaign, all visible collection thumbnails, an eight-product dress edit, large occasion campaigns, a shoppable product spotlight and a bridal feature. Titles and shopping actions replace long editorial copy. `src/components/storefront/home.module.css` scopes these styles to the homepage; Romantic Luxury tokens and bundled fonts remain authoritative. Homepage components live under `src/components/storefront/` and leave admin and checkout layouts independent. The research and merchandising rationale are in [storefront-homepage.md](storefront-homepage.md).

The homepage service returns up to 48 active products in visible categories, with two photos per product. Search covers that edit, filters show eight dresses initially, and “Discover more” reveals four more. Product links open the existing size-selection flow. Public catalog data and availability remain server-derived. `StoreImage` requests responsive Cloudinary transformations directly; above-the-fold hero images load eagerly. On mobile, the hero cycles through the second image of each collection that has one, with swipe, tappable indicators and pause controls. If none have a second image, it shows the featured hero image. Reduced-motion users see a static image and can choose slides manually. Product grids have two columns. A sticky header keeps search, bag and navigation available; the mobile menu lists categories directly. Dialogs retain native focus management and motion respects reduced-motion preferences. Source fixture labels are shortened for presentation.

The Tailwind Turbopack loader applies only to `globals.css`; CSS Modules use native Next compilation to retain their scoped class exports.

The storefront navigation links to Home, Collection, In the spotlight, About us and Appointment. Above it, a non-interactive announcement bar cycles through the effective free-delivery threshold, online order tracking and WhatsApp support. A zero threshold means free delivery on all orders; a missing or invalid threshold is logged and omitted. Reduced-motion preferences show all announcements without animation. Document scrolling is smooth unless reduced motion is requested. The shared footer features a typographic Made for India and Crafted in Mumbai signature above centered copyright and legal links.

## Collections

The homepage features the first three visible collections in the same centered overlay cards used by the collections index, with a link to view all collections. Both grids show three cards per row on desktop and one on mobile. The collections index shows visible categories with active dresses. Individual collection pages show the collection name without a category-image banner, retain direct access to visible empty categories and list all active dresses from that collection. The first four product images load eagerly on collection pages. Shared storefront product cards show available and sold-out sizes as distinct bordered labels using current stock and price data. Desktop and mobile navigation link to the index.

## Storefront product pages

Product pages reuse the storefront header, footer, Cloudinary image component and product cards. Their section links lead back to the homepage. `src/components/catalog/product.module.css` scopes the product layout. A desktop gallery presents the full image set beside a purchase panel; tall panels scroll naturally before pinning at the bottom of the viewport. On mobile, photographs use a swipeable track with thumbnails, position count and previous/next controls; the indicator updates when scrolling settles. Each photo opens the shared native dialog. Fine mouse pointers magnify the image at the cursor and reset on leaving; touch and pen pointers support anchored pinch zoom, constrained dragging and double-tap zoom/reset. The zoom is confined to the image and resets when changing photos or resizing the viewer. Keyboard users can toggle with Enter/Space, zoom with +/−, pan with arrows while zoomed, and reset with 0; at normal scale arrows retain gallery navigation. The separate zoom button has been removed. `photo-zoom-gestures.ts` owns the input-independent gesture math; `product-photo-zoom.tsx` captures pointers and paints transforms once per animation frame. Browser page zoom remains enabled outside the image surface.

Designer dresses require an explicit size selection. The selected size drives the displayed price and a fresh server quote checks availability before a guest cart line is saved. A changed price requires a second, explicit acceptance; switching sizes resets that review. After adding a size, shoppers stay on the page and can select another size. A selected size already in the bag shows its combined quantity and a link to the bag, including when that size is sold out. Requests are locked during saving. Sold-out responses disable the affected size unless it is already in the bag. The mobile purchase bar mirrors the selected size's bag action and directs shoppers to size selection before adding.

Custom dresses retain the required measurement workflow, optional fit notes, fee breakdown and quantity of one. Inputs use effective configured ranges and show server field errors without discarding entries. Invalid or missing measurement configuration disables ordering for that item. Fit help explains measuring and links to support; it does not invent size-chart measurements. Description, size/fit and delivery/replacement sections use native disclosures. Dispatch targets retain the existing post-approval estimates; the replacement window comes from effective settings, with the same 96-hour default used by order creation when no setting exists. Product preview markers are displayed separately from the dress description, and related dresses are drawn only from the active, visible public catalog.

## Contact page

The contact page provides an editable message form preview with sending disabled; its entries are not submitted or saved. The separate WhatsApp link opens the owner-provided public chat number without sending the form contents.

## About page

The About page introduces designer and owner Sadikshya Gautam, presents Florangi's feminine point of view and displays the owner-supplied portrait from Cloudinary without cropping the artwork. Both desktop and mobile navigation link to the page.

## Shopping bag

The bag presents server-quoted product images, size or measurement details, quantity controls and a responsive order summary. Unavailable lines remain removable; reducing an excessive quantity refreshes the quote, and changed prices must be accepted before checkout. Totals exclude blocked lines. The empty and error states provide a path back to shopping or retrying without changing checkout rules.

## Order tracking

The public tracking page uses the storefront navigation and footer, with an order-number lookup, contact link and responsive order summary. Its shipping progress only shows the recorded order and shipment dates; fulfillment and payment remain separate. Shipped orders link to the access-protected order page, where an available courier tracking URL can be opened.

## Checkout

Checkout pairs grouped contact, delivery and payment fields with an image-led order summary. The summary appears before the form on mobile and beside it on desktop. Payment changes refresh server totals; while totals are unavailable, checkout is disabled and a retry preserves entered details. Unavailable or changed bag items must still be resolved in the bag before checkout.

## Buttons

`src/components/ui/button.tsx` owns shared button typography, spacing, borders, focus, disabled states, sizes and color variants. It is adopted by the admin categories and products pages. Import `Button` for actions; it accepts native button props and defaults to `type="button"` to prevent accidental form submissions. Use `type="submit"` for form submission.

Variants: `primary`, `secondary` (default), `ghost`, `danger`, `link`, and `danger-link`. Sizes: `default`, `sm`, and `icon`. Icon-only buttons require an accessible name through `aria-label`. Keep per-page `className` values for layout rather than duplicating button styles. `buttonStyles()` shares the same appearance with navigation links and file-input labels while preserving native semantics.

## Dialogs

`src/components/ui/dialog.tsx` uses the native modal dialog for focus containment, inert background content and focus restoration. It provides a labeled header, Escape dismissal, a close control and background scroll locking. Pass `initialFocusRef` to choose the first focused field and `busy` to prevent dismissal during a request. Keep long forms scrollable with a visible footer. The products form retains unsaved inputs when dismissed and clears them after successful creation.

## Dropdowns

Use `src/components/ui/select.tsx` for dropdowns throughout the storefront and admin. Supply serializable `{ value, label, disabled? }` options, a controlled `value` with `onValueChange`, or `defaultValue` for an uncontrolled form field. Use `name` for form submission and `required` for validation. Give each control a label through `aria-label` or `aria-labelledby`, and use `className` for outer layout only.

The styled combobox uses a native top-layer popover so menus stay above dialog content without clipping. Menus adjust to the available viewport space. Arrow keys, Home/End, Enter/Space, Escape, Tab and type-to-select are supported. A visually hidden native select preserves form values, required validation and disabled-fieldset behavior; validation directs focus to the visible control. Uncontrolled fields support form reset.

## Product image order

`src/components/admin/product-images.tsx` supports mouse and touch dragging through the grip, with highlighted drop targets, edge scrolling and Escape cancellation. Each image also has a position dropdown for a direct, keyboard-accessible move. A completed move sends the full ordered ID list in one request to the existing image-order endpoint. The displayed order updates only after a successful response; the first image remains the cover.

## Inventory

Inventory groups size variants by product and uses compact totals for on-hand, reserved and available units. Totals cover all product statuses. Stock-level and product-status filters affect the displayed rows only. Low stock follows the configured threshold and includes out-of-stock sizes; healthy stock exceeds that threshold.

`inventory-adjustment-dialog.tsx` edits the absolute on-hand total and previews the difference and available units. Notes remain optional. Unchanged quantities cannot be submitted. Refreshing counts keeps the entered quantity and note, while updating the reservation minimum. Requests retain the existing server-side reservation validation, locking and audit workflow. The UI updates counts from the successful server response and preserves entries after recoverable errors.

## Orders

The orders list uses server-side GET filters and shows the latest 200 matching orders. Its compact counts describe that displayed result set. Fulfillment and payment use separate badges shared with the detail view. Approval-wait warnings use the service's existing 24-hour threshold. Cards link to individual orders without performing mutations.

Detail sections separate items, payment totals, contact/address, shipment, activity and private notes. Optional measurement corrections and destructive actions are expandable. Shared buttons and request locks prevent repeat actions during saving; server-side transitions, stock handling, confirmation requirements and provider verification remain authoritative. COD collection is entered in rupees and converted to integer paise using the existing money parser. Email retry feedback distinguishes queuing from delivery and refreshes with persisted job changes.

## Settings

Settings are grouped into shipping, customization fees, replacements, measurement ranges and inventory alerts. Each record has an independent `SettingEditor` with a local draft, semantic change tracking, save/reset controls and request feedback. Money remains a string while typing and is converted to integer paise only for validation and submission. Formatting-only edits do not create a new version, and reset restores the latest successful save.

Cards display the effective version/date and per-record development-default status. Saving one record updates only that record's metadata; other warnings and unsaved drafts remain intact. Missing records are labeled unconfigured, and missing measurement values stay empty. Existing server-side validation, versioning, audit and order-snapshot behavior remain unchanged. Saving a setting does not establish launch-policy approval.

## Overview

The overview is a server-rendered operational snapshot with a manual refresh control. It shows exact queue counts, up to five oldest approval requests, and up to five sizes with the lowest availability. Inventory aggregates and previews are computed in PostgreSQL and exclude archived products, matching the existing overview scope. Order links open the appropriate filtered queue or individual order without performing mutations.

Email counts distinguish queued, deferred, processing and failed jobs. The configured quota uses the email worker's UTC day, with its reset displayed in IST. The progress bar is capped at its maximum while actual sent counts remain visible if the quota is exceeded. Warnings indicate known failures or quota usage and do not imply that other delivery conditions are healthy. No historical trends or revenue metrics are inferred from snapshot counts.

## Typography

| Element | Font | Weight |
| --- | --- | --- |
| Logo / brand name | Cormorant Garamond | Medium (500) |
| Hero headline | Cormorant Garamond | Regular (400) |
| Section headings | Cormorant Garamond | Medium (500) |
| Product names | Manrope | Medium (500) |
| Body text | Manrope | Regular (400) |
| Navigation | Manrope | Medium (500) |
| Buttons | Manrope | Semibold (600) |

`src/app/layout.tsx` loads the Latin variable WOFF2 files from `src/app/fonts` using `next/font/local`, with swap display and adjusted fallback metrics. The files are bundled with the project and served locally; builds and visitors do not need Google Fonts access. The original SIL Open Font Licenses are stored alongside the fonts. Cormorant supports weights 400–500 and Manrope supports 400–600.

Use `font-serif` for Cormorant Garamond and `font-sans` for Manrope. Shared base styles cover headings, navigation and buttons. Product-name headings explicitly use `font-sans font-medium`; the homepage hero uses `font-normal`. Do not add heavier Cormorant weights or override button weights without updating this specification. Transactional emails retain their email-safe Arial fallback because web-font support varies across email clients.
