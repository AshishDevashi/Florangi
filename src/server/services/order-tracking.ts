import "server-only";

import { db } from "@/server/db";

export async function getOrderTracking(input: string) {
  const orderNumber = input.trim().toUpperCase();
  if (!/^FLR-\d{4}-\d{6}$/.test(orderNumber)) return null;
  return db.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      createdAt: true,
      fulfillmentStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      subtotalPaise: true,
      shippingFeePaise: true,
      codSurchargePaise: true,
      totalPaise: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: { productName: true, productType: true, size: true, quantity: true, unitPricePaise: true },
      },
      shipment: { select: { courierName: true, shippedAt: true, deliveredAt: true } },
    },
  });
}