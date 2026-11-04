import "server-only";

import { z } from "zod";
import { requireAdmin, requireCustomer, ResourceNotFoundError } from "@/server/auth/guards";
import { db } from "@/server/db";
import { systemClock, type Clock } from "@/server/domain/clock";
import { getStorageProvider } from "@/server/storage";
import type { StoredFile } from "@/server/storage/local";
import { enqueueEmailJob } from "@/server/email/outbox";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { isReplacementWindowOpen } from "@/server/domain/replacement-window";
import { readOrderContact } from "@/server/domain/order-contact";

const requestSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    desiredSize: z.enum(["XS", "S", "M"]).optional(),
    fitCorrection: z.string().trim().max(1000).optional(),
  })).min(1).max(10),
});
const exceptionRequestSchema = requestSchema.extend({ customerId: z.string().min(1) });

function replacementWindowHours(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Order replacement policy snapshot is missing.");
  }
  const value = (snapshot as Record<string, unknown>).replacementWindowHours;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Order replacement policy snapshot is invalid.");
  }
  return value;
}

function validatePhotos(photos: Array<{ buffer: Buffer; mimeType: string; size: number }>) {
  if (photos.length > 3) throw new RangeError("A replacement request can include up to three photos.");
  for (const photo of photos) {
    if (photo.size <= 0 || photo.size > 5 * 1024 * 1024) throw new RangeError("Each replacement photo must be 5 MB or smaller.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.mimeType)) throw new TypeError("Replacement photos must be JPEG, PNG or WebP.");
  }
}

export async function createCustomerReplacementRequest(input: unknown, photos: Array<{ buffer: Buffer; mimeType: string; size: number }>, clock: Clock = systemClock) {
  const customer = await requireCustomer();
  return createReplacementRequestForCustomer(customer, input, photos, clock);
}

export async function createReplacementRequestForCustomer(
  customer: { id: string; email: string; name: string | null },
  input: unknown,
  photos: Array<{ buffer: Buffer; mimeType: string; size: number }>,
  clock: Clock = systemClock,
) {
  const parsed = requestSchema.parse(input);
  if (new Set(parsed.lines.map((line) => line.orderLineId)).size !== parsed.lines.length) {
    throw new RangeError("Each order line can appear only once in a replacement request.");
  }
  validatePhotos(photos);

  const storedPhotos: StoredFile[] = [];
  try {
    for (const photo of photos) {
      storedPhotos.push(await getStorageProvider().put({
        buffer: photo.buffer,
        mimeType: photo.mimeType,
        originalName: "replacement-photo",
        visibility: "private",
        folder: "replacement-photos",
      }));
    }

    return await db.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${parsed.orderId} FOR UPDATE`;
      const order = await transaction.order.findFirst({
        where: { id: parsed.orderId, customerId: customer.id },
        include: { lines: true, shipment: true },
      });
      if (!order) throw new ResourceNotFoundError("Order not found.");
      if (order.fulfillmentStatus !== "DELIVERED" || !order.shipment?.deliveredAt) {
        throw new RangeError("Replacement requests are available only for delivered orders.");
      }
      if (!isReplacementWindowOpen(order.shipment.deliveredAt, clock.now(), replacementWindowHours(order.settingsSnapshot))) {
        throw new RangeError("The replacement request window has closed.");
      }

      const lineIds = parsed.lines.map((line) => line.orderLineId);
      const orderLines = order.lines.filter((line) => lineIds.includes(line.id));
      if (orderLines.length !== lineIds.length) throw new RangeError("Choose replacement lines from this order only.");
      for (const requestLine of parsed.lines) {
        const orderLine = orderLines.find((line) => line.id === requestLine.orderLineId)!;
        if (orderLine.productType === "DESIGNER_DRESS") {
          if (!requestLine.desiredSize || requestLine.desiredSize === orderLine.size || requestLine.fitCorrection) {
            throw new RangeError("Designer dress requests require a different exchange size.");
          }
        } else if (!requestLine.fitCorrection || requestLine.desiredSize) {
          throw new RangeError("Custom dress requests require fit adjustment details.");
        }
      }

      const openRequest = await transaction.replacementRequest.findFirst({
        where: {
          orderId: order.id,
          status: { in: ["OPEN", "ACCEPTED"] },
          lines: { some: { orderLineId: { in: lineIds } } },
        },
      });
      if (openRequest) throw new RangeError("An open replacement request already exists for a selected item.");
      const priorRequest = await transaction.replacementRequest.findFirst({
        where: { orderId: order.id, lines: { some: { orderLineId: { in: lineIds } } } },
        include: { lines: true },
      });
      if (priorRequest) throw new RangeError("A selected item already has a replacement decision. Contact Florangi for an exception.");

      const request = await transaction.replacementRequest.create({
        data: {
          orderId: order.id,
          customerId: customer.id,
          reason: parsed.reason,
          notes: parsed.notes,
          lines: { create: parsed.lines },
          photos: {
            create: storedPhotos.map((photo) => ({
              provider: photo.provider,
              key: photo.key,
              mimeType: photo.mimeType,
              sizeBytes: photo.size,
            })),
          },
        },
        include: { lines: true, photos: true },
      });
      return request;
    });
  } catch (error) {
    await Promise.all(storedPhotos.map((photo) => getStorageProvider(photo.provider).delete(photo).catch(() => undefined)));
    throw error;
  }
}

export async function createAdminReplacementException(input: unknown) {
  const admin = await requireAdmin();
  const parsed = exceptionRequestSchema.parse(input);
  if (new Set(parsed.lines.map((line) => line.orderLineId)).size !== parsed.lines.length) {
    throw new RangeError("Each order line can appear only once in a replacement request.");
  }
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${parsed.orderId} FOR UPDATE`;
    const order = await transaction.order.findFirst({
      where: { id: parsed.orderId, customerId: parsed.customerId, fulfillmentStatus: "DELIVERED" },
      include: { lines: true },
    });
    if (!order) throw new RangeError("Choose a delivered order belonging to this customer.");
    const lineIds = parsed.lines.map((line) => line.orderLineId);
    const orderLines = order.lines.filter((line) => lineIds.includes(line.id));
    if (orderLines.length !== lineIds.length) throw new RangeError("Choose replacement lines from this delivered order.");
    for (const requestedLine of parsed.lines) {
      const line = orderLines.find((item) => item.id === requestedLine.orderLineId)!;
      if (line.productType === "DESIGNER_DRESS") {
        if (!requestedLine.desiredSize || requestedLine.desiredSize === line.size || requestedLine.fitCorrection) {
          throw new RangeError("Designer dress exceptions require a different exchange size.");
        }
      } else if (!requestedLine.fitCorrection || requestedLine.desiredSize) {
        throw new RangeError("Custom dress exceptions require fit adjustment details.");
      }
    }
    const openRequest = await transaction.replacementRequest.findFirst({
      where: { orderId: order.id, status: { in: ["OPEN", "ACCEPTED"] }, lines: { some: { orderLineId: { in: lineIds } } } },
    });
    if (openRequest) throw new RangeError("An open replacement request already exists for a selected item.");

    const request = await transaction.replacementRequest.create({
      data: {
        orderId: order.id,
        customerId: parsed.customerId,
        reason: parsed.reason,
        notes: parsed.notes,
        exception: true,
        lines: { create: parsed.lines },
      },
      include: {
        lines: { include: { orderLine: { select: { productName: true, productType: true, size: true } } } },
        customer: { select: { id: true, name: true, email: true } },
        photos: true,
        order: { select: { id: true, orderNumber: true, fulfillmentStatus: true, contactSnapshot: true, shipment: true } },
      },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: order.id,
        actorUserId: admin.id,
        actorName: admin.name ?? admin.email,
        action: "REPLACEMENT_EXCEPTION_CREATED",
        fromState: "DELIVERED",
        toState: "DELIVERED",
        note: `Admin exception: ${parsed.reason}`,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "REPLACEMENT_EXCEPTION_CREATED",
      entity: "ReplacementRequest",
      entityId: request.id,
      after: auditJson({ orderId: order.id, customerId: parsed.customerId, reason: parsed.reason, exception: true }),
    });
    await enqueueEmailJob(transaction, {
      eventKey: `replacement-update:${request.id}:OPEN`,
      template: "replacement-update",
      recipient: readOrderContact(request.order.contactSnapshot, { name: request.customer.name, email: request.customer.email, phone: null }).email,
      payload: { subject: `Replacement request opened for ${order.orderNumber}`, text: `Florangi opened a replacement request on your behalf. ${parsed.reason}` },
    });
    return request;
  });
}

export async function listAdminReplacementRequests() {
  await requireAdmin();
  const requests = await db.replacementRequest.findMany({
    include: {
      order: { select: { id: true, orderNumber: true, fulfillmentStatus: true, shipment: true } },
      customer: { select: { id: true, name: true, email: true } },
      lines: { include: { orderLine: { select: { productName: true, productType: true, size: true } }, allocatedVariant: true } },
      photos: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return Promise.all(requests.map(async (request) => ({
    ...request,
    photos: await Promise.all(request.photos.map(async (photo) => ({
      ...photo,
      signedUrl: await getStorageProvider(photo.provider).getSignedUrl({
        provider: photo.provider as StoredFile["provider"],
        key: photo.key,
        mimeType: photo.mimeType,
        size: photo.sizeBytes,
      }, 300),
    }))),
  })));
}

export async function updateReplacementRequest(id: string, input: unknown, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const parsed = z.object({
    status: z.enum(["ACCEPTED", "REJECTED", "RESOLVED"]),
    decisionReason: z.string().trim().max(1000).optional(),
    logisticsNote: z.string().trim().max(2000).optional(),
  }).parse(input);
  if (parsed.status === "REJECTED" && !parsed.decisionReason) throw new RangeError("A rejection reason is required.");
  if (parsed.status === "ACCEPTED" && !parsed.logisticsNote) throw new RangeError("Record agreed logistics and customer next steps before acceptance.");

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "ReplacementRequest" WHERE "id" = ${id} FOR UPDATE`;
    const request = await transaction.replacementRequest.findUnique({
      where: { id },
      include: { lines: { include: { orderLine: true } }, order: true, customer: { select: { name: true, email: true } } },
    });
    if (!request) return null;
    if (parsed.status === "ACCEPTED" && request.status !== "OPEN") throw new RangeError("Only open replacement requests can be accepted.");
    if (parsed.status === "REJECTED" && request.status !== "OPEN") throw new RangeError("Only open replacement requests can be rejected.");
    if (parsed.status === "RESOLVED" && request.status !== "ACCEPTED") throw new RangeError("Only accepted replacement requests can be resolved.");

    if (parsed.status === "ACCEPTED") {
      for (const line of request.lines) {
        if (line.orderLine.productType !== "DESIGNER_DRESS") continue;
        const desiredSize = line.desiredSize;
        if (!desiredSize) throw new RangeError("A designer exchange needs an agreed size before acceptance.");
        const variant = await transaction.productVariant.findUnique({
          where: { productId_size: { productId: line.orderLine.productId, size: desiredSize } },
        });
        if (!variant) throw new RangeError("The requested exchange size is not configured.");
        await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${variant.id} FOR UPDATE`;
        const currentVariant = await transaction.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
        if (currentVariant.onHand - currentVariant.reserved < 1) throw new RangeError(`Size ${desiredSize} is not available for exchange allocation.`);
        await transaction.productVariant.update({ where: { id: variant.id }, data: { reserved: { increment: 1 } } });
        await transaction.replacementRequestLine.update({
          where: { id: line.id },
          data: { allocatedVariantId: variant.id, allocatedAt: clock.now() },
        });
        await transaction.stockMovement.create({
          data: {
            variantId: variant.id,
            actorUserId: admin.id,
            type: "REPLACEMENT_ALLOCATION",
            quantity: 1,
            note: `Allocated for replacement request ${request.id}`,
          },
        });
      }
    }

    if (parsed.status === "RESOLVED") {
      for (const line of request.lines) {
        if (!line.allocatedVariantId) continue;
        await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.allocatedVariantId} FOR UPDATE`;
        const released = await transaction.productVariant.updateMany({
          where: { id: line.allocatedVariantId, reserved: { gte: 1 }, onHand: { gte: 1 } },
          data: { reserved: { decrement: 1 }, onHand: { decrement: 1 } },
        });
        if (released.count !== 1) throw new Error("Replacement allocation mismatch while resolving request.");
        await transaction.stockMovement.create({
          data: {
            variantId: line.allocatedVariantId,
            actorUserId: admin.id,
            type: "SHIPMENT",
            quantity: -1,
            note: `Replacement dispatched for request ${request.id}`,
          },
        });
      }
    }

    const updated = await transaction.replacementRequest.update({
      where: { id },
      data: {
        status: parsed.status,
        decisionReason: parsed.decisionReason,
        logisticsNote: parsed.logisticsNote,
        resolvedAt: parsed.status === "RESOLVED" ? clock.now() : undefined,
      },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: request.orderId,
        actorUserId: admin.id,
        actorName: admin.name ?? admin.email,
        action: `REPLACEMENT_${parsed.status}`,
        fromState: request.status,
        toState: parsed.status,
        note: parsed.decisionReason ?? parsed.logisticsNote ?? "Replacement request updated.",
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: `REPLACEMENT_${parsed.status}`,
      entity: "ReplacementRequest",
      entityId: request.id,
      before: auditJson({ status: request.status }),
      after: auditJson({ status: updated.status, decisionReason: updated.decisionReason, logisticsNote: updated.logisticsNote }),
    });
    await enqueueEmailJob(transaction, {
      eventKey: `replacement-update:${request.id}:${parsed.status}`,
      template: "replacement-update",
      recipient: readOrderContact(request.order.contactSnapshot, { name: request.customer.name, email: request.customer.email, phone: null }).email,
      payload: {
        subject: `Replacement request update for ${request.order.orderNumber}`,
        text: `${parsed.status}${parsed.decisionReason ? `\n${parsed.decisionReason}` : ""}${parsed.logisticsNote ? `\n${parsed.logisticsNote}` : ""}`,
      },
    });
    return updated;
  });
}

export async function releaseReplacementAllocation(requestId: string, lineId: string, noteInput: unknown) {
  const admin = await requireAdmin();
  return releaseReplacementAllocationForAdmin(admin, requestId, lineId, noteInput);
}

export async function releaseReplacementAllocationForAdmin(
  admin: { id: string; email: string; name: string | null },
  requestId: string,
  lineId: string,
  noteInput: unknown,
) {
  const note = z.string().trim().min(1).max(1000).parse(noteInput);
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "ReplacementRequest" WHERE "id" = ${requestId} FOR UPDATE`;
    const request = await transaction.replacementRequest.findUnique({
      where: { id: requestId },
      include: { order: true, lines: true },
    });
    if (!request) return null;
    if (request.status !== "ACCEPTED") throw new RangeError("Only accepted replacement requests can release an exchange allocation.");
    const line = request.lines.find((candidate) => candidate.id === lineId);
    if (!line || !line.allocatedVariantId) throw new RangeError("This replacement line has no active stock allocation.");

    await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.allocatedVariantId} FOR UPDATE`;
    const released = await transaction.productVariant.updateMany({
      where: { id: line.allocatedVariantId, reserved: { gte: 1 } },
      data: { reserved: { decrement: 1 } },
    });
    if (released.count !== 1) throw new Error("Replacement allocation reservation mismatch.");
    await transaction.stockMovement.create({
      data: {
        variantId: line.allocatedVariantId,
        actorUserId: admin.id,
        type: "REPLACEMENT_RELEASE",
        quantity: -1,
        note: `Released replacement allocation for ${request.id}: ${note}`,
      },
    });
    await transaction.replacementRequestLine.update({
      where: { id: line.id },
      data: { allocatedVariantId: null, allocatedAt: null },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId: request.orderId,
        actorUserId: admin.id,
        actorName: admin.name ?? admin.email,
        action: "REPLACEMENT_ALLOCATION_RELEASED",
        fromState: request.status,
        toState: request.status,
        note,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "REPLACEMENT_ALLOCATION_RELEASED",
      entity: "ReplacementRequestLine",
      entityId: line.id,
      before: auditJson({ allocatedVariantId: line.allocatedVariantId, allocatedAt: line.allocatedAt }),
      after: auditJson({ allocatedVariantId: null, note }),
    });
    return { requestId, lineId, released: true };
  });
}