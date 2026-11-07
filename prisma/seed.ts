import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const developmentSettings = [
  { key: "shipping_fee_paise", value: { amountPaise: 30000, label: "DEV DEFAULT" } },
  { key: "shipping_free_threshold_paise", value: { amountPaise: 500000, label: "DEV DEFAULT" } },
  { key: "customization_fee_limits_paise", value: { minPaise: 50000, maxPaise: 150000, label: "DEV DEFAULT" } },
  {
    key: "measurement_ranges",
    value: {
      label: "DEV DEFAULT - replace with owner-approved inclusive ranges before launch",
      unit: "inches",
      bust: { min: 20, max: 80 },
      underbust: { min: 18, max: 75 },
      waist: { min: 18, max: 80 },
      hips: { min: 20, max: 90 },
      dressLength: { min: 20, max: 80 },
      heightFeet: { min: 3, max: 8 },
      heightInches: { min: 0, max: 11.99 },
    },
  },
  { key: "replacement_window_hours", value: { hours: 96, label: "DEV DEFAULT" } },
  { key: "low_stock_threshold", value: { availableUnits: 2, label: "DEV DEFAULT" } },
];

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters before seeding.");
  }

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
  }

  if (process.env.NODE_ENV !== "production") {
    for (const setting of developmentSettings) {
      await prisma.setting.upsert({
        where: { key_version: { key: setting.key, version: 1 } },
        create: { ...setting, version: 1, isDevDefault: true },
        update: {},
      });
    }

    const category = await prisma.category.upsert({
      where: { slug: "demo-occasionwear" },
      create: { name: "DEMO Occasionwear", slug: "demo-occasionwear", visible: true, sortOrder: 0 },
      update: { name: "DEMO Occasionwear", visible: true },
    });
    const designerVariants = [
      { size: "XS" as const, sizePremiumPaise: 0, onHand: 3 },
      { size: "S" as const, sizePremiumPaise: 10000, onHand: 4 },
      { size: "M" as const, sizePremiumPaise: 20000, onHand: 2 },
    ];
    const designer = await prisma.product.upsert({
      where: { slug: "demo-ready-to-wear-dress" },
      create: {
        name: "DEMO - Ready-to-wear dress",
        slug: "demo-ready-to-wear-dress",
        description: "Development sample only. Replace with owner-approved product copy and photographs.",
        categoryId: category.id,
        type: "DESIGNER_DRESS",
        basePricePaise: 250000,
        status: "ACTIVE",
        variants: { create: designerVariants },
        images: {
          create: [{ provider: "static", key: "images/demo-dress.svg", mimeType: "image/svg+xml", sizeBytes: 1200, width: 600, height: 800, position: 0 }],
        },
      },
      update: {
        name: "DEMO - Ready-to-wear dress",
        description: "Development sample only. Replace with owner-approved product copy and photographs.",
        categoryId: category.id,
        type: "DESIGNER_DRESS",
        basePricePaise: 250000,
        status: "ACTIVE",
      },
    });
    for (const variant of designerVariants) {
      await prisma.productVariant.upsert({
        where: { productId_size: { productId: designer.id, size: variant.size } },
        create: { productId: designer.id, ...variant },
        update: { sizePremiumPaise: variant.sizePremiumPaise },
      });
    }

    const custom = await prisma.product.upsert({
      where: { slug: "demo-made-to-measure-dress" },
      create: {
        name: "DEMO - Made-to-measure dress",
        slug: "demo-made-to-measure-dress",
        description: "Development sample only. Replace with owner-approved product copy and photographs.",
        categoryId: category.id,
        type: "CUSTOM_DRESS",
        basePricePaise: 320000,
        customizationFeePaise: 50000,
        status: "ACTIVE",
        images: {
          create: [{ provider: "static", key: "images/demo-custom-dress.svg", mimeType: "image/svg+xml", sizeBytes: 1200, width: 600, height: 800, position: 0 }],
        },
      },
      update: {
        name: "DEMO - Made-to-measure dress",
        description: "Development sample only. Replace with owner-approved product copy and photographs.",
        categoryId: category.id,
        type: "CUSTOM_DRESS",
        basePricePaise: 320000,
        customizationFeePaise: 50000,
        status: "ACTIVE",
      },
    });
    for (const [product, key] of [[designer, "images/demo-dress.svg"], [custom, "images/demo-custom-dress.svg"]] as const) {
      await prisma.productImage.upsert({
        where: { productId_position: { productId: product.id, position: 0 } },
        create: { productId: product.id, provider: "static", key, mimeType: "image/svg+xml", sizeBytes: 1200, width: 600, height: 800, position: 0 },
        update: {},
      });
    }
  } else {
    console.info("Production seed skips all development settings and demo catalog products.");
  }

  console.info("Florangi seed complete", { admin: email, developmentDefaults: process.env.NODE_ENV !== "production" });
}

main()
  .catch((error: unknown) => {
    console.error("Florangi seed failed", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });