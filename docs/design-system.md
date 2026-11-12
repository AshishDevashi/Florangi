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
