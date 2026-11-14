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
