# Florangi Storefront and Admin Business Requirements 

Version 3.0 completed working specification. Original business rules are retained with clarifications and additional requirements. MUST is mandatory; SHOULD is the default. Proposed business choices are listed in section 14 and are not owner approval. Use those values in development only; unresolved launch decisions block production release. 

## **1. Scope and MVP Boundaries** 

The MVP is a mobile-first online store for Florangi (women's designer and custom dresses, India) where the owner approves and ships every order by hand and customers pay through Razorpay or Cash on Delivery. 

|**Area**|**In MVP**|**Stays manual (admin does it)**|**Deferred**|
|---|---|---|---|
|Catalog|Browse, product page, size/variant<br>selection|Adding and editing products, prices,<br>stock|Search, filters, reviews, wishlist|
|Cart|Add, edit quantity, remove, price<br>summary|None|Saved carts, coupons|
|Checkout|Address, payment choice, Razorpay,<br>COD|Verifying COD orders|Guest checkout, saved cards|
|Orders|Place order, order history, order<br>detail, tracking info|Approve or reject, production<br>updates, shipping, marking<br>delivered|Automated courier integration|
|Custom<br>dresses|Measurement form, measurement<br>snapshot per order|Reviewing measurements, tailoring,<br>QC|Size-chart assistant|
|Payments|Razorpay online payment, COD|Refunds (initiated by admin)|Partial payments, wallets|
|Replacements|Request form in order history|Reviewing and resolving each<br>request|Automated pickup scheduling|
|Messaging|Transactional emails|None|SMS and WhatsApp|



- **SCP-1** : No courier API integration in the MVP. The admin enters courier name, AWB and tracking link when shipping. 

- SCP-2: Only the admin advances fulfillment. Automatic payment confirmation, unpaid-order expiry, replacementwindow expiry and transactional notifications are permitted system actions. 

- **SCP-3** : Features in the Deferred column MUST NOT be built in the MVP. 

## **2. Shared Business Rules** 

These rules apply to both the storefront and the admin panel. The server is the single source of truth for every price and fee; the browser only displays them. 

### **2.1 Product types** 

||**Designer Dress (DD)**|**Custom Dress (CD)**|
|---|---|---|
|Stock|Pre-stitched, tracked per size|None, made to order|



Florangi Requirements  •  Version 3.0  •  1 

||**Designer Dress (DD)**|**Custom Dress (CD)**|
|---|---|---|
|Sizes|XS, S, M|Customer measurements (no size)|
|Dispatch target|24–48 hours after approval|7–10 days after approval|
|Resolution in replacement|Size exchange|Free fit adjustment|
|window|||
|Restock if rejected at delivery|Yes|No|



### **2.2 Pricing** 

- **PRC-1** : DD line price = <mark>base_price + size_premium</mark> (premium is 0 if not set for that size). 

- **PRC-2** : CD line price = <mark>base_price + customization_fee</mark> , where the fee is set by the admin per product between ₹500 and ₹1,500. 

- **PRC-3** : <mark>cart_subtotal</mark> = sum of line price × quantity. It excludes shipping and COD surcharge. 

- **PRC-4** : <mark>fnal_payable = cart_subtotal + shipping_fee + cod_surcharge</mark> i . 

- **PRC-5** : <mark>shipping_fee</mark> is a single flat value stored in admin settings (see open question Q1). 

- **PRC-6** : Each order line stores the price at the time of purchase. Later catalog price changes MUST NOT alter existing orders. 

### **2.3 COD surcharge** 

if payment_method == "COD": cod_surcharge = 300 if cart_subtotal < 5000 else 0 else: 

cod_surcharge = 0 

- **PAY-1** : Prepaid (UPI, card, net banking via Razorpay) has no surcharge. 

- **PAY-2** : COD with subtotal under ₹5,000 adds ₹300; at ₹5,000 or more it is free. 

### **2.4 Custom dress measurements** 

- **MEA-1** : A CD MUST NOT be added to the cart until all required measurements are valid. 

- **MEA-2** : Required fields (all in inches unless stated): bust, underbust, waist, hips, dress length (shoulder to hem), customer height (feet and inches). Optional: fit notes (free text). 

- **MEA-3** : Measurements are saved on the order line as a snapshot at checkout and cannot be changed by the customer afterwards. Corrections go through the admin (see ORD-9). 

- **MEA-4** : Validation ranges (min and max per field) are set in admin settings; see Q8. 

### **2.5 Replacement policy** 

- **RPL-1** : The window is 4 days (96 hours) starting from the delivered time the admin records. 

- **RPL-2** : While the window is open, the customer can submit a request from order history: size exchange for DD, fit adjustment for CD. 

- **RPL-3** : After the window closes, the request button is hidden or disabled automatically. 

## **3 Order Lifecycle and Inventory** 

LIF-1: Fulfillment status and payment status are separate fields. Refund activity never overwrites fulfillment status. Every transition validates the current state on the server within a transaction. 

LIF-2: Online path is PENDING_PAYMENT → PENDING_APPROVAL → APPROVED → READY_TO_SHIP → SHIPPED → DELIVERED. Any order containing a CD requires IN_PRODUCTION between APPROVED and READY_TO_SHIP. Florangi Requirements  •  Version 3.0  •  2 

LIF-3: COD starts at PENDING_APPROVAL. Rejection is allowed only there. Admin cancellation is allowed before SHIPPED; the customer may cancel only PENDING_PAYMENT. REJECTED, CANCELLED and DELIVERED are terminal fulfillment states. 

LIF-4: A replacement request has its own lifecycle and does not move a delivered order backward. Failed delivery or return to origin is recorded as an exception on SHIPPED; resolution remains manual. Do not mark delivered to close an exception. 

LIF-5: Reserve DD stock in one atomic transaction with local order creation. Concurrent checkouts cannot reserve more than available. A failed transaction leaves neither a partial order nor a partial reservation. 

LIF-6: Expiry and payment reconciliation lock the same order. If capture wins, do not expire it. If expiry wins, retain CANCELLED, record captured funds as REFUND_REQUIRED and alert the admin. Never silently re-reserve stock. 

LIF-7: The 30-minute payment deadline runs from order creation and does not reset on retry. All timestamps are stored in UTC and displayed in Asia/Kolkata with an explicit time zone. 

LIF-8: The 12-hour freeze runs from order placement. Measurement corrections remain allowed until production actually starts. Inform customers that the initial check period is 12 hours without promising corrections after production starts. 

## **4. Part A Storefront Customer Side** 

The storefront lets visitors browse dresses and build a cart. Verified sign-in is required to check out and follow orders. It is designed for phones first. 

### **4.1 Pages** 

|**Page**|**Route (suggested)**|**Purpose**|**Login needed**|
|---|---|---|---|
|Home|/|Featured and new dresses, links to categories|No|
|Catalog|/collections/[slug]|Grid of active products in a category|No|
|Product detail|/products/[slug]|Images, price, description, size or measurement form,<br>add to cart|No|
|Cart|/cart|Review lines, change quantity, see price summary|No (stored in<br>browser until<br>login)|
|Checkout|/checkout|Address, payment method, place order|Yes|
|Order confirmation|/orders/[id]/<br>confirmation|Shows result after payment or COD placement|Yes|
|Order history|/account/orders|List of the customer's orders with status|Yes|
|Order detail|/account/orders/[id]|Items, measurements, payment, timeline, tracking,<br>replacement request|Yes|
|Account|/account|Name, phone, saved addresses|Yes|



### **4.2 Catalog and product page** 

- CAT-1: Show only active products in visible categories. Draft, hidden and archived products MUST NOT be publicly discoverable, including by direct product URL. 

- **CAT-2** : A product card shows the main image, name, price ("from" price for DD if sizes differ), and a "Custom" or "Ready to ship" badge. 

- **CAT-3** : DD product page shows size buttons XS, S, M with the size-specific price. A size with stock 0 is shown as sold out and cannot be selected. 

Florangi Requirements  •  Version 3.0  •  3 

- **CAT-4** : CD product page shows the measurement form (MEA-2) instead of size buttons, plus the customization fee and the 7–10 day production note. 

- **CAT-5** : The product page states dispatch time and the 4-day replacement policy. 

### **4.3 Cart** 

- **CRT-1** : Each cart line holds product, variant (DD) or measurements (CD), and quantity. 

- **CRT-2** : A CD line always has quantity 1, because each carries its own measurements. To buy two, the customer adds two lines. 

- **CRT-3** : The cart summary shows subtotal, shipping, and total. The COD surcharge is shown at checkout only, once COD is selected. 

- **CRT-4** : On every cart load and at checkout, the server re-checks price, product status and DD stock. Changed prices or unavailable items are flagged and must be accepted or removed before checkout. 

- **CRT-5** : A guest cart lives in browser storage and is merged into the account cart on login. 

### **4.4 Checkout** 

- **CHK-1** : The customer must be logged in with a verified email (and a phone number for the courier). 

- **CHK-2** : Required address fields: full name, phone, address line 1, city, state, PIN code (6 digits). Delivery is India only. 

- **CHK-3** : Payment options: "Pay online" (Razorpay) and "Cash on Delivery". Selecting COD adds the surcharge per PAY-2 and updates the total instantly. 

- **CHK-4** : On submit, the server recalculates everything (PRC-1 to PRC-4), reserves DD stock, and creates the order. The client total is never trusted. 

- **CHK-5** : Online payment: order starts as <mark>PENDING_PAYMENT</mark> and the Razorpay Checkout opens (see section 6). On confirmed payment it becomes <mark>PENDING_APPROVAL</mark> . 

- **CHK-6** : COD: order starts directly as <mark>PENDING_APPROVAL</mark> with payment status <mark>COD_PENDING</mark> . 

- **CHK-7** : A COD order containing a CD MUST show a notice that the dress is made to measure and cannot be resold, so rejection at delivery is discouraged. 

- CHK-8: Mixed carts (DD and CD) ship as one package after the CD is ready (ORD-13). Split shipping is deferred. 

- **CHK-9** : Reserved DD stock for a <mark>PENDING_PAYMENT</mark> order is released automatically after 30 minutes without payment, and the order moves to <mark>CANCELLED</mark> . 

### **4.5 Order history** 

- **OHS-1** : A customer sees only their own orders, newest first, each with order number, date, total, payment mode and status badge. 

- **OHS-2** : Order detail shows items, saved measurements (CD), address, price breakdown, and a status timeline with the date of each step. 

- **OHS-3** : Once shipped, order detail shows courier name, AWB number and tracking link as entered by the admin. 

- • **OHS-4** : While the replacement window is open (RPL-1), a "Request exchange / fit adjustment" button opens a short form (reason, notes, optional photos). Submitting creates a replacement request for the admin. 

- **OHS-5** : A customer can cancel an order themselves only while it is <mark>PENDING_PAYMENT</mark> . After that, cancellation is a request to the owner by email (deferred as a feature). 

### **4.6 Account** 

- **ACC-1** : Sign-up and login by email plus password, or email one-time code (owner to choose, see Q9). 

- • **ACC-2** : Customers can save and edit delivery addresses and update their name and phone. 

Florangi Requirements  •  Version 3.0  •  4 

## **5. Part B Admin Panel Owner Side** 

The admin panel is a private area at <mark>/admin</mark> where the owner manages the catalog and moves every order through its lifecycle by hand. It must work well on a phone, since the owner may approve and ship orders on the go. 

### **5.1 Access** 

- **ADM-1** : Admin pages and admin APIs require login with an account flagged <mark>role = admin</mark> . Customers can never reach them. 

- **ADM-2** : MVP has one role (admin). Staff roles with limited rights are deferred. 

- **ADM-3** : Every create, update, delete and status change records who did it and when (audit log). 

### **5.2 Modules** 

|**Module**|**What the admin can do**|
|---|---|
|Dashboard|See counts of orders waiting for approval, in production, ready to ship, open replacement<br>requests, and low-stock sizes|
|Categories|Create, rename, reorder, hide categories (collections)|
|Products|Create, edit, hide or archive products; upload images; set type (DD or CD); set base price; set<br>customization fee (CD); set status|
|Inventory|Set stock per size for each DD (XS, S, M); see stock reserved by open orders|
|Orders|List and filter by status and payment mode; open an order; approve, reject, start production,<br>mark ready, ship, mark delivered, cancel; add internal notes|
|Replacement requests|See requests with reason and photos; accept or reject; mark resolved|
|Customers|View customer details and their orders (read only)|
|Settings|Edit shipping fee, COD surcharge and threshold, customization fee limits, measurement<br>validation ranges, replacement window hours|



### **5.3 Product and catalog management** 

- PRD-1: A product has name, unique slug, description, category, type (DD or CD), base price, status (draft, active, hidden, archived), and 1 to 8 images before activation. 

- **PRD-2** : A DD has up to three variants (XS, S, M), each with its own stock and optional size premium. 

- **PRD-3** : A CD has a customization fee within the limits in settings (₹500 to ₹1,500 by default) and no variants or stock. 

- **PRD-4** : Only <mark>active</mark> products appear on the storefront (CAT-1). Archiving keeps the product on past orders. 

- **PRD-5** : A product with orders cannot be hard-deleted; it can only be archived. 

- PRD-6: DD inventory has on_hand and reserved counts; available = on_hand − reserved. Order creation increases reserved atomically. Shipping decreases both on_hand and reserved. Rejection or cancellation releases reserved once. Stock edits cannot reduce on_hand below reserved. Physical returns are restocked only after admin inspection. 

### **5.4 Order management rules** 

- ORD-1: Only the admin advances fulfillment. Verified captured payment moves PENDING_PAYMENT to PENDING_APPROVAL; unpaid-order expiry moves PENDING_PAYMENT to CANCELLED. These exceptions do not approve or ship an order. 

Florangi Requirements  •  Version 3.0  •  5 

- **ORD-2** (Approve): Allowed from <mark>PENDING_APPROVAL</mark> when payment status is <mark>PAID</mark> or <mark>COD_PENDING</mark> . Result: <mark>APPROVED</mark> . 

- ORD-3 (Reject): Allowed only from PENDING_APPROVAL. Requires a written reason. Releases reserved stock exactly once and sets REJECTED. A captured payment is flagged REFUND_REQUIRED until its refund completes. 

- ORD-4 (Start production, CD only): Allowed from APPROVED only after 12 hours have passed since the order was placed (freeze window). For COD orders, the admin must also tick "customer confirmed" (by confirmed email-link form submission or phone call). The button stays disabled until both conditions hold. Result: IN_PRODUCTION. 

- **ORD-5** (QC, CD only): Before marking ready, the admin completes a checklist: finished garment measured against saved measurements within ±0.5 inches, QC card signed and included. 

- **ORD-6** (Mark ready): DD-only orders go <mark>APPROVED</mark> to <mark>READY_TO_SHIP</mark> after packing. CD orders go <mark>IN_PRODUCTION</mark> to <mark>READY_TO_SHIP</mark> after ORD-5. A mixed order becomes ready only when every line is ready. 

- **ORD-7** (Ship): Allowed from <mark>READY_TO_SHIP</mark> . Requires courier name and AWB number; tracking URL is optional. Result: <mark>SHIPPED</mark> , shipped time saved, customer emailed. 

- **ORD-8** (Delivered): Allowed from <mark>SHIPPED</mark> . The admin confirms delivery manually (from the courier site or customer message). Saves <mark>delivered_at</mark> , which starts the replacement window (RPL-1), and emails the customer. 

- **ORD-9** (Measurement correction): Before <mark>IN_PRODUCTION</mark> , the admin can add a corrected measurement version after the customer asks by email. The previous version stays stored. 

- ORD-10 (Cancel): Admin cancellation is allowed from PENDING_PAYMENT, PENDING_APPROVAL, APPROVED, IN_PRODUCTION or READY_TO_SHIP, with a reason. Release DD reservations once. Paid orders require a full refund; cancellation during production requires an explicit warning that CD costs cannot be recovered. 

- **ORD-11** : Every status change is written to the order timeline with admin name, time and note. Statuses cannot skip steps or move backward except through ORD-3 and ORD-10. 

- **ORD-12** : The orders list highlights orders waiting for approval for more than 24 hours. 

### **5.5 Replacement requests** 

- **REQ-1** : A request created by the customer (OHS-4) appears in the admin list with status <mark>open</mark> . 

- **REQ-2** : The admin can set <mark>accepted</mark> , <mark>rejected</mark> (with reason) or <mark>resolved</mark> . Pickup, alteration and re-dispatch are arranged outside the system by phone or email. 

- **REQ-3** : The customer sees the current request status on the order detail page. 

- **REQ-4** : A request submitted after the window closed is not possible from the storefront; the admin can still create one on a customer's behalf as an exception. 

## **6. Razorpay Integration** 

Online payments use Razorpay Standard Checkout. The server creates the Razorpay order and verifies every payment; the browser is never trusted to say a payment succeeded. 

### **6.1 Payment flow online orders** 

1. Customer submits checkout with "Pay online". The server creates the local order as <mark>PENDING_PAYMENT</mark> (CHK-4, CHK-5). 

2. The server calls the Razorpay Orders API with <mark>amount = fnal_payable × 100</mark> i (paise), <mark>currency = INR</mark> , and <mark>receipt = order number</mark> . It saves the returned <mark>razorpay_order_id</mark> on the order. 

3. The storefront opens Razorpay Checkout with the public key ID and the <mark>razorpay_order_id</mark> . 

4. On success, Checkout returns <mark>razorpay_payment_id</mark> , <mark>razorpay_order_id</mark> and <mark>razorpay_signature</mark> ; the browser posts them to the server. 

5. The server verifies the signature and reconciles captured payment, order ownership, currency and amount. Only a verified captured payment marks PAID and moves the order to PENDING_APPROVAL. 

Florangi Requirements  •  Version 3.0  •  6 

6. The customer lands on the confirmation page and receives the order confirmation email. 

### **6.2 Rules** 

- **PGW-1** : The key secret and webhook secret live only in server environment variables. Only the public key ID reaches the browser. 

- **PGW-2** : Signature check = HMAC SHA256 of <mark>razorpay_order_id|razorpay_payment_id</mark> using the key secret, compared with <mark>razorpay_signature</mark> . A mismatch MUST NOT mark the order paid. 

- PGW-3: Before accepting payment, the server verifies the payment belongs to the saved Razorpay order, is captured, and has the expected INR amount. A valid browser signature alone does not establish capture. Browser callbacks and webhooks use the same idempotent reconciliation routine. 

- PGW-4: Auto-capture is the proposed MVP configuration (Q6). Authorization alone MUST NOT mark an order PAID. Provider configuration must be verified before launch. 

- **PGW-5** : Test keys are used in development and staging, live keys only in production, selected by environment variable. 

### **6.3 Webhooks safety net** 

A webhook endpoint (for example <mark>/api/razorpay/webhook</mark> ) covers cases where the customer pays but closes the browser before step 4. 

|**Event**|**Action**|
|---|---|
|payment.capturedor|Reconcile captured payment, amount, currency and saved order ID. Advance only|
|order.paid|PENDING_PAYMENT; late capture on CANCELLED requires refund. Duplicate events have no<br>additional effect.|
|payment.failed|Record the failure on the payment attempt; keep the order<br>PENDING_PAYMENTso the|
||customer can retry|
|refund.processed|Mark the refund as<br>REFUNDEDon the order|



- **PGW-6** : Verify the webhook signature on the raw request body with the webhook secret before doing anything. Reject invalid requests with HTTP 400. 

- **PGW-7** : Webhook handling MUST be idempotent: processing the same event twice changes nothing the second time. Store the Razorpay event or payment ID and skip duplicates. 

- **PGW-8** : Return HTTP 200 quickly after processing so Razorpay does not retry unnecessarily. 

### **6.4 Failed or abandoned payments** 

- **PGW-9** : A failed payment leaves the order <mark>PENDING_PAYMENT</mark> ; the order page offers "Retry payment", which reuses the same Razorpay order. 

- **PGW-10** : Unpaid orders are auto-cancelled after 30 minutes and their stock is released (CHK-9). If a late payment arrives after cancellation, flag the order <mark>REFUND_REQUIRED</mark> for the admin. 

### **6.5 Refunds** 

- **REF-1** : Refunds happen for rejected or cancelled paid orders (ORD-3, ORD-10). The admin triggers a full refund from the order page, which calls the Razorpay Refunds API; the refund ID and time are saved. 

- **REF-2** : Until the refund is recorded, the order shows <mark>REFUND_REQUIRED</mark> in the admin list and the customer sees "Refund in progress". 

- REF-3: Fallback: the admin may initiate a refund in the Razorpay dashboard and record its refund ID. The server verifies provider status before marking REFUNDED; a checkbox alone is insufficient. 

- **REF-4** : COD orders have no refund flow in the MVP, since no money is collected before delivery. 

Florangi Requirements  •  Version 3.0  •  7 

### **6.6 Payment status values** 

|**Status**|**Meaning**|
|---|---|
|UNPAID|Online order created, payment not yet done|
|PAID|Razorpay payment verified|
|FAILED|Last payment attempt failed|
|COD_PENDING|COD order, cash to be collected at delivery|
|COD_COLLECTED|Admin marked cash received after delivery|
|REFUND_REQUIRED|Paid order rejected or cancelled, refund not done yet|
|REFUNDED|Refund completed|



## **7. Emails** 

The MVP sends transactional emails only through a configured provider such as Brevo or Resend. Actual account limits and sender verification are deployment settings, not assumed provider guarantees. 

|**ID**|**Email**|**Trigger**|**Sent to**|**Required content**|
|---|---|---|---|---|
|EML-1|Order received|Order placed (COD) or<br>payment verified (online)|Customer|Itemized receipt, payment mode, COD surcharge if any,<br>note that the order awaits approval|
|EML-2|Measurement<br>check|Order containing CD<br>reaches<br>PENDING_APPROVAL|Customer|Submitted measurements, 12-hour correction window,<br>reply-to address for corrections|
|EML-3|COD<br>confirmation|COD order containing CD<br>reaches<br>PENDING_APPROVAL|Customer|One-click "Confirm your custom order" link; reminder<br>resent after 24 hours if not clicked|
|EML-4|Order approved|Admin approves (ORD-2)|Customer|Approval note, expected dispatch window (24–48 hours<br>DD, 7–10 days CD)|
|EML-5|Order rejected<br>or cancelled|Admin rejects or cancels<br>(ORD-3, ORD-10)|Customer|Reason, refund information if paid|
|EML-6|Order shipped|Admin ships (ORD-7)|Customer|Courier name, AWB and tracking link if available;<br>estimated delivery date only if the admin supplied one|
|EML-7|Order delivered|Admin marks delivered<br>(ORD-8)|Customer|4-day replacement window notice and link to order<br>history|
|EML-8|Replacement<br>update|Admin accepts, rejects or<br>resolves a request|Customer|New status and next steps|
|EML-9|New order alert|Order reaches<br>PENDING_APPROVAL|Admin<br>(owner)|Order number, total, payment mode, link to admin<br>order page|
|EML-10|Account email|Sign-up verification or<br>password reset|Customer|Verification or reset link for password login; one-time<br>code if that option is chosen|



- **EML-11** : Every email is logged (order, template, time, success or failure). A failed send MUST NOT block the order flow; the admin sees failed sends on the order page. 

- EML-12: Queue emails under the configured provider quota, warn the admin at 80 percent, and defer excess messages until capacity is available. Provider and actual quota must be confirmed before launch. 

Florangi Requirements  •  Version 3.0  •  8 

- **EML-13** : A production-update email (cutting and stitching started) is optional for the MVP, since production is manual. 

## **8 Detailed Workflow Requirements** 

### **8.1 Catalog and cart behavior** 

CAT-6: A hidden category and its products are excluded from public listings and direct routes. Existing order snapshots remain accessible to their owners. Category slugs are unique; deleting a category with products is blocked until products are reassigned. 

CRT-6: Guest and account cart merge combines matching DD variants up to available stock and flags excess quantity for review. Preserve every CD line separately, including identical measurement sets. A merge never creates an order. 

CRT-7: DD quantities are positive whole numbers bounded by stock. A cart does not reserve inventory. Price-change acceptance stores the last displayed quote version; checkout revalidates it and requires review again if it changed. 

CRT-8: Guest measurement data must not appear in analytics, URLs or application logs. Clear the guest cart after successful merge and provide a clear-cart action. Persistent saved carts as a separate customer feature remain deferred. 

### **8.2 Checkout and order integrity** 

CHK-10: Create-order submissions require an idempotency key scoped to the customer and checkout payload. Repeated submissions return the same order; reusing a key with different content returns a conflict. 

CHK-11: Snapshot customer contact, address, item name, image reference, product type, size or measurements, prices and applicable policy settings. Editing the account or catalog must not rewrite past orders. 

CHK-12: Address line 2 and landmark are optional. Validate Indian PIN structure and phone format on the server; format validation alone does not prove delivery serviceability. Display only explicitly configured delivery restrictions. 

CHK-13: Show server-calculated subtotal, shipping, COD surcharge and final total before submission. If applicable settings or item prices change, require the customer to review the refreshed total. 

CHK-14: If provider order creation fails after local order creation, keep the local order unpaid and retry safely without duplicating it or its reservation. A closed payment dialog displays pending or failed status based on server reconciliation, never a false success. 

CHK-15: A confirmation page for an unpaid order shows payment pending and retry eligibility. Clear only purchased cart lines after confirmed online payment or successful COD placement. 

PAY-3: Currency is INR. Store and calculate money as integer paise; the rupee formulas in section 2 are business notation. Reject negative fees, invalid precision and client-supplied totals. 

### **8.3 Production delivery and replacements** 

ORD-13: Store per-line readiness for mixed orders. DD lines can be packed while CD lines are produced, but ship only when all lines are ready. Record QC completion, admin identity and timestamp for each CD line. 

ORD-14: COD confirmation is evidence, not approval. An authenticated customer confirms by a deliberate form submission after following a signed, expiring link; opening the link alone changes nothing. Admin phone confirmation requires a note and time. Stop reminders after confirmation, cancellation or rejection. 

ORD-15: Mark delivered requires delivered_at no later than the current time and no earlier than shipped_at. Backdated delivery uses the actual recorded delivery time for the 96-hour window and warns the admin if it has already expired. 

ORD-16: Mark COD_COLLECTED only by an explicit admin action on a delivered COD order, with collection amount and date. A delivery update alone does not establish receipt of cash. 

Florangi Requirements  •  Version 3.0  •  9 

REQ-5: Replacement eligibility is checked by the server at submission: delivered order, customer ownership, eligible line and now < delivered_at + window_hours. The exact closing instant is ineligible even if a stale button remains visible. 

REQ-6: The request identifies order lines, reason and desired DD size or CD fit correction. Reject duplicate open requests for the same line. A resolved request does not automatically permit another; repeated requests require a documented admin exception. 

REQ-7: Admin acceptance records agreed logistics and customer-facing next steps. DD exchange stock is reserved explicitly when a replacement size is allocated, with allocation and release audited. Do not automatically restock returned items. 

REQ-8: Free CD fit adjustment means no alteration fee. Return and re-dispatch shipping responsibility is a separate launch decision (Q4). The storefront must display the approved policy before enabling replacement requests. 

### **8.4 Refund reliability and notifications** 

REF-5: Refund submission is idempotent and limited to the verified captured payment amount. Keep REFUND_REQUIRED while pending; record provider refund ID, amount and outcome. Mark REFUNDED only after verified completion. Failed or ambiguous requests require reconciliation before retry. 

REF-6: Full refund includes the original collected order total. No partial refund, customer balance or COD reimbursement workflow is included. Any post-delivery financial exception remains manual and must be recorded as an internal note. 

PGW-11: Track payment attempts independently from order payment status. FAILED means no verified capture and a failed latest attempt; retry or delayed success can supersede it. A failure event never downgrades PAID or REFUNDED. 

PGW-12: Persist a verified webhook or durable queue job before acknowledging it. On temporary persistence failure return an error so the event can be retried. Reconcile pending and ambiguous transactions with provider state and alert the owner on mismatches. 

EML-14: Queue each event-template-recipient combination once. Use bounded retries with backoff and a visible failed state with an admin retry action. Replayed payment events must not resend confirmations. 

EML-15: Transactional templates include a verified sender, support reply-to address and authenticated account links. Never include secrets, payment credentials or internal admin notes. Measurement emails contain only the relevant customer’s measurements. 

EML-16: The 24-hour COD reminder is sent once only while confirmation is missing and the order remains eligible. Optional production emails do not block fulfillment. 

## **9 Data Requirements** 

The following records are required logical entities; implementation technology is deliberately unspecified. All mutable records need identifiers and created_at and updated_at timestamps. Relationships and uniqueness rules must be enforced in persistent storage. 

|**Record**|**Required content and constraints**|
|---|---|
|Customer and address|Verified email, name, phone, role and authentication metadata; addresses belong to one<br>customer. Normalize email consistently and prevent duplicate identities.|
|Category and product|Unique slugs, category visibility and sort order; product type, status, description, price and<br>ordered images. Existing order references survive archival.|
|Variant and inventory|DD product and unique size, premium, on_hand, reserved; nonnegative counts and reserved ≤<br>on_hand. Audited stock adjustments and reservation movements.|
|Cart and line|Customer or guest scope, product and DD variant or CD measurements, quantity, last accepted<br>quote. CD quantity equals one.|



Florangi Requirements  •  Version 3.0  •  10 

|**Record**|**Required content and constraints**|
|---|---|
|Order and order line|Unique order number, customer, fulfillment and payment states, totals, address snapshot,<br>settings snapshot and payment deadline. Immutable item and purchase-price snapshots.|
|Measurement version|Order-line ID, values and units, version, author, time and correction reason. Preserve original<br>and prior versions; record which version production used.|
|Payment and refund|Provider order, payment, event and refund IDs; amounts and currency, attempt state, verified<br>timestamps and reconciliation result. Unique event IDs prevent replay effects.|
|Timeline and audit|Actor or system identity, entity, action, prior and new state, timestamp and note. Separate<br>public timeline events from private admin notes.|
|Shipment and replacement|Courier, AWB, optional HTTPS tracking URL, shipping and delivery times; replacement lines,<br>reason, private photo references, state and decision history.|
|Settings and email job|Versioned settings with effective time; event and template keys, recipient, attempts, send<br>status and safe error detail. Never store provider credentials here.|



DAT-1: Orders and audit history are not hard-deleted through the admin UI. Data erasure and retention procedures require a documented owner-approved policy (Q10). 

DAT-2: Database migrations must preserve existing records, stable IDs and monetary precision. Take a backup before production migration and verify a rollback or forward-fix path. 

DAT-3: Store policy snapshots for the replacement window, COD surcharge and shipping charge on each order. Later settings changes apply only to new quotes and orders; correct an existing order only through an explicit audited exception. 

## **10 Security and Privacy Requirements** 

SEC-1: Enforce customer ownership and admin role on every server operation, including private images, order IDs, refunds and downloads. Hiding a UI element is not authorization. Customers receive an access denial for other customers’ resources without private data. 

SEC-2: Use HTTPS, secure session handling and framework-supported authentication protections. Protect state-changing browser requests from cross-site request forgery where applicable; rate-limit login, verification, checkout and replacement submissions. 

SEC-3: If password login is chosen, use a maintained password-hashing implementation and expiring single-use reset tokens. Never log passwords, codes or tokens. Revoke sessions on password reset and admin role removal. 

SEC-4: Validate all input on the server, escape rendered content and restrict uploaded file types and sizes. Proposed upload limits are in Q11. Verify actual file content; private replacement photos use access-controlled storage and expiring access. 

SEC-5: Validate tracking URLs as HTTPS links; reject script and other unsafe schemes. Do not fetch arbitrary tracking URLs server-side. Product slugs and search-free routes must not permit path traversal or injected markup. 

SEC-6: Keep payment credentials, database credentials and email keys outside source code and browser bundles. Redact sensitive fields from telemetry. Do not store card numbers, CVV or banking credentials. 

SEC-7: Measurements, phone numbers and addresses are personal data. Restrict access to the owning customer and authorized admin. Publish the approved privacy notice and collect only information needed for ordering and fulfillment. 

SEC-8: Provision the first admin through a controlled deployment procedure. Public signup always creates a customer; role fields from the browser are ignored. Require stronger protection for the admin account and document recovery before launch. 

Florangi Requirements  •  Version 3.0  •  11 

## **11 User Experience and Operational Requirements** 

NFR-1: Storefront and admin must be usable at 360 CSS pixels without horizontal page scrolling. Provide visible keyboard focus, labeled inputs, readable contrast, alternative image text and field-specific error messages. Target WCAG 2.2 AA; validate key journeys before launch. 

NFR-2: Each page and action supports loading, empty, validation-error, network-error and success states. Prevent double submissions and preserve entered measurements and address values after recoverable errors. 

NFR-3: Proposed performance target: on a representative midrange phone and mobile connection, main storefront pages show useful primary content within 3 seconds under the agreed MVP load. Define test conditions and expected concurrency in Q12 before treating this as a release threshold. 

OPS-1: Schedule unpaid-order expiry and email delivery at least every minute. Expiry eligibility is determined by server time even when a worker is delayed. Alert the admin on job failure and reservation mismatches. 

OPS-2: Record structured operational errors and correlation IDs without private payloads. Monitor payment reconciliation, failed refunds, email backlog and stuck orders. Provide a documented recovery procedure for each. 

OPS-3: Proposed recovery targets are daily encrypted backups, retention of 14 days, recovery point within 24 hours and restoration within 8 hours. Confirm these with the owner and hosting budget before launch; rehearse a restore. 

OPS-4: Separate development, staging and production credentials and data. Use synthetic customer information and payment test mode in staging. Deployment must include migrations, worker checks, secure secret configuration and a rollback procedure. 

OPS-5: All scheduled processing is safe to repeat. A worker restart must not duplicate stock release, payment acceptance, refunds or emails. The database remains the authoritative record. 

## **12 Acceptance Criteria and Test Scenarios** 

All mandatory scenarios must pass in staging. Use payment test mode, controlled clocks and concurrent requests. These are release checks, not claims that the application has already been built or tested. 

|**Test ID**|**Scenario and expected result**|
|---|---|
|AT-01|Draft, hidden and archived products and hidden-category products are absent from listings and<br>public direct routes; past order snapshots remain visible to their owners.|
|AT-02|DD base ₹2,000 with ₹200 size premium and quantity 2 gives subtotal ₹4,400. CD base ₹3,000<br>with ₹500 fee gives ₹3,500. Shipping is added once; paise arithmetic is exact.|
|AT-03|COD subtotal ₹4,999.99 adds ₹300; ₹5,000 adds zero. Online payment adds zero COD<br>surcharge. Browser-supplied totals cannot change the charged amount.|
|AT-04|Missing and out-of-range required measurements fail server validation. CD quantity 2 is<br>rejected; two separately configured CD lines succeed.|
|AT-05|Two simultaneous checkouts compete for one DD unit: exactly one reserves it. Repeated create<br>submissions with the same idempotency key do not duplicate orders or reservations.|
|AT-06|At the 30-minute deadline an unpaid order cancels and releases stock once. A paid order does<br>not expire. Late capture after cancellation leaves it cancelled and creates refund work.|
|AT-07|Invalid callback or webhook signature, wrong amount, wrong currency, mismatched provider<br>order or authorization without capture cannot mark PAID. Replayed captured events cause one<br>transition and one email set.|
|AT-08|Closing the payment browser before callback still allows verified webhook reconciliation. Failed<br>attempts remain retryable before expiry and cannot downgrade a captured payment.|



Florangi Requirements  •  Version 3.0  •  12 

|**Test ID**|**Scenario and expected result**|
|---|---|
|AT-09|Production is blocked before 12 hours, before approval and without COD confirmation.<br>Corrections version measurements and are blocked after production begins. Every CD line<br>needs QC.|
|AT-10|Mixed carts cannot ship before every line is ready. Shipping requires courier and AWB,<br>consumes reservations once and creates one customer notification.|
|AT-11|Replacement submission at 95 hours 59 minutes succeeds; at exactly 96 hours fails. Wrong<br>customer, undelivered order and duplicate open request are rejected.|
|AT-12|Rejected or cancelled paid orders require full refunds. Duplicate refund submissions do not<br>duplicate refunds; provider failure does not mark REFUNDED. Dashboard-entered refund IDs<br>are verified.|
|AT-13|Customers cannot read or mutate another customer’s orders, measurements, photos or<br>addresses, nor call admin APIs. Malicious uploads and unsafe tracking URLs are rejected.|
|AT-14|Catalog prices, settings and account address edits leave existing order snapshots unchanged.<br>Cancellation and expiry races release stock exactly once.|
|AT-15|Email-provider failure does not roll back order status. Failed jobs remain visible and retry<br>safely. Quota deferral does not lose messages; reminders stop after confirmation or<br>cancellation.|
|AT-16|Complete guest browse → login and merge → checkout → approval → shipment → delivery on<br>a phone and keyboard. Validate error recovery and no horizontal page scrolling.|
|AT-17|A staging backup restores orders, snapshots, reservations and audit history. Restarting workers<br>does not duplicate external actions; provider reconciliation recovers ambiguous payments.|



## **13 Delivery Sequence and Definition of Done** 

DEL-1: First implement identities, authorization, schema, catalog and versioned settings. Then cart, measurement validation and server pricing. Next implement atomic stock reservation and the order state machine before connecting payment capture. 

DEL-2: Add Razorpay in test mode, signed webhook reconciliation, expiry, refund handling and email jobs. Then implement production, QC, shipping, delivery and replacement flows. Complete responsive and access-control checks throughout. 

DEL-3: Provide source code, migrations, environment-variable reference without secrets, admin setup instructions, seed data for DD and CD examples, test results, backup and restore instructions, deployment steps and operational recovery notes. 

DEL-4: Release requires passing section 12 checks, owner acceptance of all launch decisions in section 14, verified sender and live payment configuration, published policies, support contact, production backup verification and working scheduled jobs. 

DEL-5: Do not implement deferred features as shortcuts or implied dependencies. Keep courier operations manual, emails transactional and payment totals authoritative on the server. Unspecified material behavior is raised as a decision rather than silently implemented. 

## **14 Owner Decisions and Proposed Defaults** 

The original draft referenced Q1, Q6, Q8 and Q9 without supplying a question register. This register completes that missing section. Values below are proposals for review, not established Florangi policy. Development may use clearly labeled test defaults; unresolved business decisions must not silently enter production. 

Florangi Requirements  •  Version 3.0  •  13 

|**ID**|**Decision required**|**Proposed working default and launch condition**|
|---|---|---|
|Q1|Flat shipping fee and delivery<br>coverage|Use ₹0 only in development. Owner must set the live shipping fee and any<br>excluded PIN codes or regions before checkout is enabled.|
|Q2|Tax display and invoices|Do not add an invented tax charge. Owner or accountant must confirm<br>registration, tax-inclusive pricing, invoice fields and applicable treatment before<br>launch.|
|Q3|Dispatch promise and working<br>days|Retain 24–48 hours for DD and 7–10 days for CD after approval. Owner must<br>choose calendar versus business days, holiday handling and exceptions; no<br>guaranteed arrival date is implied.|
|Q4|Replacement logistics and<br>eligibility|Retain DD size exchange, free CD fit adjustment and 96 hours from delivery.<br>Confirm shipping payer, garment condition, evidence, size unavailability and<br>exception wording before publication.|
|Q5|COD availability and customer<br>confirmation|Retain COD for DD and CD with the stated ₹300 and ₹5,000 rule. Confirm coverage<br>and any order cap; do not add one without approval. Unconfirmed CD orders<br>remain blocked from production.|
|Q6|Razorpay capture and refunds|Propose automatic capture and full refunds of original collected total. Verify live<br>account configuration and required events against current provider<br>documentation before release.|
|Q7|Cancellation and returned<br>shipments|Retain customer cancellation only while unpaid and admin cancellation before<br>shipping. Confirm production-cost acceptance and handling of failed delivery, RTO<br>and damaged DD restocking.|
|Q8|Measurement validation ranges|Owner or tailor must supply inclusive minimum and maximum for bust,<br>underbust, waist, hips, dress length and height, plus accepted precision. Do not<br>invent body-size limits. Store inches; accept height as feet plus inches with inches<br>from 0 to less than 12.|
|Q9|Authentication method|Propose email and password with verified email and reset links. Owner may<br>choose email codes instead; build one approved method, not both by default.|
|Q10|Privacy retention and public<br>policies|Owner approves retention for addresses, measurements, photos, orders and audit<br>logs, deletion requests, privacy notice, terms and support contact. Confirm legal<br>content independently before publication.|
|Q11|Upload limits and confirmation<br>links|Propose JPEG, PNG or WebP; up to 5 MB per file; 1–8 product images and up to 3<br>replacement photos. Propose 48-hour confirmation-link expiry and reissue while<br>eligible. Confirm storage budget and policy.|
|Q12|Hosting email and service targets|Select hosting and email provider, actual quota, owner alert address, expected<br>traffic and monitoring. Confirm section 11 performance and recovery targets<br>against budget.|
|Q13|Settings and inventory alerts|Retain defaults ₹300 COD surcharge, ₹5,000 threshold, ₹500–₹1,500<br>customization fee limits and 96-hour window. Propose low-stock alert at available<br>≤2 units. Confirm edit authority and validation.|
|Q14|Visual identity and catalog launch<br>data|Supply logo, palette, product photos, descriptions, categories, real stock, size<br>premiums and approved public policy text. Never seed fabricated merchandise or<br>reviews into production.|



Florangi Requirements  •  Version 3.0  •  14 

## **15 Glossary and Requirement Traceability** 

|**Term**|**Meaning**|
|---|---|
|DD|Designer Dress; pre-stitched item with size-based inventory.|
|CD|Custom Dress; made to submitted measurements, quantity one per configured line.|
|AWB|Courier shipment identifier entered manually by the admin.|
|QC|Garment quality check against the versioned measurements used for production.|
|Reservation|Inventory allocated to an open order but not yet physically shipped.|
|RTO|Return to origin following failed or refused delivery; handled manually in the MVP.|



Requirement families map directly to delivery areas: SCP defines scope; PRC and PAY define totals; MEA defines measurements; LIF and ORD define order transitions; CAT and PRD define catalog behavior; CRT and CHK define purchase flows; RPL and REQ define replacement policy; PGW and REF define payments; EML defines notifications; DAT, SEC, NFR and OPS define data and operational quality. AT scenarios verify these areas; DEL defines release evidence; Q identifies decisions requiring owner approval. 

Completion note: This version preserves the MVP intent and original requirement IDs, supplies the missing lifecycle section and completion sections, and resolves the original conflicts around automatic actions, hidden products, capture verification, stock accounting and refund completion. It is ready for owner decision review and implementation planning; it does not assert that unresolved policies are approved. 

Florangi Requirements  •  Version 3.0  •  15 

