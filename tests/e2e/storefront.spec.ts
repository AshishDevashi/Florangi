import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import sharp from "sharp";

test("admin catalog supports category images, product restore and deletion", async ({ page }) => {
  const origin = "http://localhost:3000";
  const env = parseEnv(readFileSync(".env", "utf8"));
  const databaseUrl = process.env.DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Set DATABASE_URL before catalog validation");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["florangi", "florangi_test"].includes(url.pathname.slice(1))) throw new Error("Local catalog validation only");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const suffix = crypto.randomUUID();
  const categoryName = `Validation category ${suffix}`;
  const productName = `Validation product ${suffix}`;
  let categoryId = "";
  let productId = "";
  const login = await page.request.post("/api/admin/auth/login", { headers: { origin }, data: { email: process.env.ADMIN_EMAIL ?? env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD ?? env.ADMIN_PASSWORD } });
  expect(login.ok()).toBe(true);
  try {
    const categoryResponse = await page.request.post("/api/admin/categories", { headers: { origin }, data: { name: categoryName, slug: `validation-${suffix}` } });
    expect(categoryResponse.ok()).toBe(true);
    categoryId = (await categoryResponse.json()).id;
    const image = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#25805d" } }).png().toBuffer();
    await page.goto("/admin/categories");
    for (const position of [1, 2]) {
      await page.getByLabel(`${categoryName} image ${position}`, { exact: true }).setInputFiles({ name: `category-${position}.png`, mimeType: "image/png", buffer: image });
      await expect(page.getByRole("img", { name: `${categoryName} image ${position}`, exact: true })).toBeVisible();
    }
    expect(await db.categoryImage.count({ where: { categoryId } })).toBe(2);
    const rejected = await page.request.post(`/api/admin/categories/${categoryId}/images`, { headers: { origin }, multipart: { position: "2", file: { name: "third.png", mimeType: "image/png", buffer: image } } });
    expect(rejected.status()).toBe(400);
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`categories-${width}.png`), fullPage: true });
    }
    await page.goto(`/collections/validation-${suffix}`);
    await expect(page.getByRole("img", { name: categoryName, exact: true })).toHaveCount(2);
    expect(await page.locator("article img, section img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: `Remove ${categoryName} image 2`, exact: true }).click();
    await expect(page.getByRole("img", { name: `${categoryName} image 2`, exact: true })).toHaveCount(0);
    const productResponse = await page.request.post("/api/admin/products", { headers: { origin }, data: { name: productName, slug: `validation-product-${suffix}`, description: "Temporary browser fixture", categoryId, type: "DESIGNER_DRESS", basePricePaise: 100000, variants: [{ size: "S", onHand: 1 }] } });
    expect(productResponse.ok()).toBe(true);
    productId = (await productResponse.json()).id;
    const upload = await page.request.post(`/api/admin/products/${productId}/images`, { headers: { origin }, multipart: { file: { name: "product.png", mimeType: "image/png", buffer: image } } });
    expect(upload.ok()).toBe(true);
    await page.goto("/admin/products");
    const row = page.locator("li").filter({ has: page.getByRole("heading", { name: productName, exact: true }) });
    await row.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(row.getByText("ARCHIVED", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Activate", exact: true }).click();
    await expect(row.getByText("ACTIVE", { exact: true })).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`products-${width}.png`), fullPage: true });
    }
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: `Delete ${productName}`, exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.goto("/admin/settings");
    await expect(page.getByLabel("Shipping fee (₹)", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Free shipping threshold (₹)", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/COD surcharge|COD free-shipping/)).toHaveCount(0);
  } finally {
    if (productId) {
      await db.productImage.deleteMany({ where: { productId } });
      await db.productVariant.deleteMany({ where: { productId } });
      await db.product.deleteMany({ where: { id: productId } });
    }
    if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
    await db.auditLog.deleteMany({ where: { entityId: { in: [categoryId, productId].filter(Boolean) } } });
    await page.request.post("/api/auth/logout", { headers: { origin } });
    await db.$disconnect();
  }
});

test("admin settings renders configured or empty measurement ranges", async ({ page }) => {
  const origin = "http://localhost:3000";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const login = await page.request.post("/api/admin/auth/login", {
    headers: { origin },
    data: { email: process.env.ADMIN_EMAIL ?? "owner@example.test", password: process.env.ADMIN_PASSWORD ?? "change-this-development-password" },
  });
  expect(login.ok()).toBe(true);
  try {
    const settingsResponse = await page.request.get("/api/admin/settings");
    expect(settingsResponse.ok()).toBe(true);
    const settings = await settingsResponse.json() as Array<{ key: string; value: Record<string, { min?: number; max?: number }> }>;
    const ranges = settings.find((setting) => setting.key === "measurement_ranges")?.value ?? {};
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Measurement ranges", exact: true })).toBeVisible();
    for (const field of ["bust", "underbust", "waist", "hips", "dressLength", "heightFeet", "heightInches"]) {
      for (const edge of ["min", "max"]) {
        const input = page.locator(`#${field}-${edge}`);
        await expect(input).toHaveValue(String(ranges[field]?.[edge as "min" | "max"] ?? ""));
        await expect(input).toHaveAttribute("required", "");
      }
    }
    await page.locator("#bust-min").fill("30");
    await expect(page.locator("#bust-min")).toHaveValue("30");
    await page.locator("#bust-min").fill("");
    await expect(page.locator("#bust-min")).toHaveValue("");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`settings-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  } finally {
    await page.request.post("/api/auth/logout", { headers: { origin } });
  }
});

test("AT-16: guest checkout, public tracking, and private order isolation", async ({ page, playwright }) => {
  const email = `playwright-${crypto.randomUUID()}@example.test`;
  let orderId: string | null = null;
  let otherOrderId: string | null = null;
  let stockVariantId: string | null = null;
  let originalOnHand: number | null = null;
  const origin = "http://localhost:3000";
  const request = page.request;
  const adminRequest = await playwright.request.newContext({ baseURL: origin });
  const otherGuest = await playwright.request.newContext({ baseURL: origin });
  const publicContext = await page.context().browser()!.newContext();

  try {
    const adminLogin = await adminRequest.post("/api/admin/auth/login", {
      headers: { origin },
      data: { email: "owner@example.test", password: process.env.ADMIN_PASSWORD ?? "change-this-development-password" },
    });
    expect(adminLogin.ok()).toBe(true);
    const inventoryResponse = await adminRequest.get("/api/admin/inventory");
    const inventory = await inventoryResponse.json() as Array<{ id: string; size: string; onHand: number; reserved: number; product: { slug: string } }>;
    const size = inventory.find((item) => item.product.slug === "demo-ready-to-wear-dress" && item.size === "S");
    if (!size) throw new Error("Demo S variant was not seeded.");
    stockVariantId = size.id;
    originalOnHand = size.onHand;
    const provision = await adminRequest.patch("/api/admin/inventory", {
      headers: { origin },
      data: { variantId: size.id, onHand: Math.max(size.onHand, size.reserved + 5), note: "Playwright fixture setup" },
    });
    expect(provision.ok()).toBe(true);

    await page.goto("/collections/demo-occasionwear");
    await expect(page.getByRole("heading", { name: "DEMO Occasionwear" })).toBeVisible();
    await page.getByRole("link", { name: "View DEMO - Ready-to-wear dress" }).click();
    await expect(page.getByRole("heading", { name: "DEMO - Ready-to-wear dress" })).toBeVisible();
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: /Add to bag/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.getByRole("link", { name: "Continue to checkout" }).click();

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Full name").fill("Playwright Customer");
    await page.getByLabel("Phone number").fill("9876543210");
    await page.getByLabel("Address line 1").fill("1 Playwright Street");
    await page.getByLabel("City").fill("Mumbai");
    await page.getByLabel("State").fill("Maharashtra");
    await page.getByLabel("PIN code").fill("400001");
    await page.getByLabel("Cash on Delivery").check();
    const submittedCheckout = page.waitForRequest((checkout) => checkout.url().endsWith("/api/orders") && checkout.method() === "POST");
    await page.getByRole("button", { name: "Place Cash on Delivery order" }).click();
    const checkoutPayload = (await submittedCheckout).postDataJSON();
    await expect(page.getByRole("heading", { name: "Thank you for your order." })).toBeVisible();
    const manageUrl = await page.getByRole("link", { name: "Manage order" }).getAttribute("href");
    orderId = manageUrl?.split("/").at(-1) ?? null;
    await page.getByRole("link", { name: "View order" }).click();
    await expect(page).toHaveURL(/\/track-order\?orderNumber=/);
    const orderNumber = new URL(page.url()).searchParams.get("orderNumber")!;
    await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${origin}/track-order`);
    await publicPage.getByLabel("Order number").fill(orderNumber.toLowerCase());
    await publicPage.getByRole("button", { name: "Track order", exact: true }).click();
    await expect(publicPage.getByRole("heading", { name: orderNumber })).toBeVisible();
    await expect(publicPage.getByRole("status")).toHaveText("PENDING APPROVAL");
    await expect(publicPage.getByText("DEMO - Ready-to-wear dress", { exact: true })).toBeVisible();
    await expect(publicPage.getByText(email, { exact: true })).toHaveCount(0);
    await expect(publicPage.getByText("9876543210", { exact: true })).toHaveCount(0);
    await expect(publicPage.getByText("1 Playwright Street", { exact: true })).toHaveCount(0);
    await expect(publicPage.getByRole("heading", { name: "Delivery address" })).toHaveCount(0);
    await expect(publicPage.getByRole("button", { name: /Cancel|Pay|Replace/ })).toHaveCount(0);
    for (const width of [360, 1440]) {
      await publicPage.setViewportSize({ width, height: 900 });
      expect(await publicPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await publicPage.screenshot({ path: test.info().outputPath(`tracking-${width}.png`), fullPage: true });
    }
    await publicPage.getByLabel("Order number").fill("FLR-0000-000000");
    await publicPage.getByRole("button", { name: "Track order", exact: true }).click();
    await expect(publicPage.getByRole("alert")).toHaveText("No order found. Check your order number.");
    await publicPage.goto(`${origin}/account/orders`);
    await expect(publicPage).toHaveURL(/\/track-order$/);
    const ownOrder = await request.get(`/api/orders/${orderId}`);
    expect(ownOrder.ok()).toBe(true);
    expect((await ownOrder.json()).contactSnapshot.email).toBe(email);
    expect((await otherGuest.get(`/api/orders/${orderId}`)).status()).toBe(401);
    const otherCheckout = await otherGuest.post("/api/orders", {
      headers: { origin },
      data: { ...checkoutPayload, idempotencyKey: crypto.randomUUID(), customerEmail: email },
    });
    expect(otherCheckout.ok()).toBe(true);
    otherOrderId = (await otherCheckout.json()).order.id;
    expect((await otherGuest.get(`/api/orders/${orderId}`)).status()).toBe(404);
    expect((await request.get(`/api/orders/${otherOrderId}`)).status()).toBe(404);
    expect((await request.post("/api/admin/auth/login", {
      headers: { origin }, data: { email, password: "not-an-admin-password" },
    })).status()).toBe(401);
    expect((await request.post("/api/auth/register", { headers: { origin }, data: {} })).status()).toBe(410);
    await page.goto(`${origin}${manageUrl}`);
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(page.getByRole("heading", { name: orderNumber })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delivery address" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
  } finally {
    for (const cleanupId of [orderId, otherOrderId].filter(Boolean)) {
      await adminRequest.post(`/api/admin/orders/${cleanupId}/actions`, {
        headers: { origin },
        data: { action: "cancel", reason: "Playwright test cleanup" },
      });
    }
    if (stockVariantId && originalOnHand !== null) {
      const currentInventory = await adminRequest.get("/api/admin/inventory");
      const variants = await currentInventory.json() as Array<{ id: string; reserved: number }>;
      const current = variants.find((variant) => variant.id === stockVariantId);
      if (current && originalOnHand >= current.reserved) {
        await adminRequest.patch("/api/admin/inventory", {
          headers: { origin },
          data: { variantId: stockVariantId, onHand: originalOnHand, note: "Playwright fixture cleanup" },
        });
      }
    }
    await adminRequest.dispose();
    await otherGuest.dispose();
    await publicContext.close();
  }
});