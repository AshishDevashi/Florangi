import "server-only";

import { z } from "zod";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { assertFulfillmentTransition, type FulfillmentState } from "@/server/domain/order-state";
import { systemClock, type Clock } from "@/server/domain/clock";
import { formatPaise } from "@/server/domain/money";
import { enqueueEmailJob } from "@/server/email/outbox";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { areAllOrderLinesReady, assertCanStartProduction, assertOrderLinesReadyForShipment } from "@/server/domain/fulfillment";
import { parseMeasurementRanges, validateMeasurements } from "@/server/domain/measurements";

const orderInclude = {
  lines: { orderBy: { createdAt: "asc" as const }, include: { measurementVersions: { orderBy: { version: "asc" as const } } } },
  shipment: true,
  timeline: { orderBy: { createdAt: "asc" as const } },
  notes: { orderBy: { createdAt: "desc" as const }, include: { author: { select: { name: true, email: true } } } },
  refunds: { orderBy: { requestedAt: "desc" as const } },
  paymentAttempts: { orderBy: { createdAt: "desc" as const } },
};

export async function listAdminOrders(filters: { status?: string; paymentMethod?: string } = {}) {
  await requireAdmin();
  const where: {
    fulfillmentStatus?: "PENDING_PAYMENT" | "PENDING_APPROVAL" | "APPROVED" | "IN_PRODUCTION" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERED" | "REJECTED" | "CANCELLED";
    paymentMethod?: "ONLINE" | "COD";
  } = {};
  if (filters.status && ["PENDING_PAYMENT", "PENDING_APPROVAL", "APPROVED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"].includes(filters.status)) {
    where.fulfillmentStatus = filters.status as NonNullable<typeof where.fulfillmentStatus>;
  }
  if (filters.paymentMethod === "ONLINE" || filters.paymentMethod === "COD") where.paymentMethod = filters.paymentMethod;
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      lines: { select: { id: true, productName: true, productType: true, quantity: true, size: true, isReady: true } },
      shipment: true,
    },
  });
  const now = systemClock.now().getTime();
  return orders.map((order) => ({
    ...order,
    awaitingApprovalHours: order.fulfillmentStatus === "PENDING_APPROVAL"
      ? Math.floor((now - order.createdAt.getTime()) / (60 * 60 * 1000))
      : 0,
  }));
}

export async function getAdminOrder(orderId: string) {
  await requireAdmin();
  const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) return null;
  const emailJobs = await db.emailJob.findMany({
    where: { eventKey: { contains: orderId } },
    orderBy: { createdAt: "desc" },
  });
  return { ...order, emailJobs };
}

async function lockAdminOrder(transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0], orderId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await transaction.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new RangeError("Order not found.");
  return order;
}

async function writeOrderTransition(
  transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  input: { orderId: string; admin: { id: string; name: string | null; email: string }; from: FulfillmentState; to: FulfillmentState; action: string; note: string },
) {
  const updated = await transaction.order.update({ where: { id: input.orderId }, data: { fulfillmentStatus: input.to } });
  await transaction.orderTimelineEvent.create({
    data: {
      orderId: input.orderId,
      actorUserId: input.admin.id,
      actorName: input.admin.name ?? input.admin.email,
      action: input.action,
      fromState: input.from,
      toState: input.to,
      note: input.note,
    },
  });
  await writeAuditEntry(transaction, {
    actorUserId: input.admin.id,
    actorType: "USER",
    action: input.action,
    entity: "Order",
    entityId: input.orderId,
    before: auditJson({ fulfillmentStatus: input.from }),
    after: auditJson({ fulfillmentStatus: input.to, note: input.note }),
  });
  return updated;
}

async function releaseReservations(
  transaction: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  order: { id: string; orderNumber: string; lines: Array<{ variantId: string | null; quantity: number }> },
  adminId: string,
  note: string,
) {
  const lines = order.lines
    .filter((line): line is typeof line & { variantId: string } => line.variantId !== null)
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
  for (const line of lines) {
    await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.variantId} FOR UPDATE`;
    const released = await transaction.productVariant.updateMany({
      where: { id: line.variantId, reserved: { gte: line.quantity } },
      data: { reserved: { decrement: line.quantity } },
    });
    if (released.count !== 1) throw new Error("Stock reservation mismatch while closing order.");
    await transaction.stockMovement.create({
      data: {
        variantId: line.variantId,
        orderId: order.id,
        actorUserId: adminId,
        type: "RELEASE",
        quantity: -line.quantity,
        note: `${note} ${order.orderNumber}`,
      },
    });
  }
}

export async function approveOrder(orderId: string, noteInput?: unknown) {
  const admin = await requireAdmin();
  const note = z.string().trim().max(1000).optional().parse(noteInput) ?? "Order approved.";
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    if (order.fulfillmentStatus !== "PENDING_APPROVAL" || !["PAID", "COD_PENDING"].includes(order.paymentStatus)) {
      throw new RangeError("Only paid or confirmed COD orders awaiting approval can be approved.");
    }
    assertFulfillmentTransition(order.fulfillmentStatus, "APPROVED", "ADMIN");
    const approved = await writeOrderTransition(transaction, { orderId, admin, from: order.fulfillmentStatus, to: "APPROVED", action: "ORDER_APPROVED", note });
    const hasCustom = order.lines.some((line) => line.productType === "CUSTOM_DRESS");
    await enqueueEmailJob(transaction, {
      eventKey: `order-approved:${order.id}`,
      template: "order-approved",
      recipient: order.email,
      payload: {
        subject: `Order ${order.orderNumber} approved`,
        text: `${note}\nExpected dispatch: ${hasCustom ? "7–10 days" : "24–48 hours"} after approval.`,
      },
    });
    return approved;
  });
}

export async function rejectOrder(orderId: string, input: unknown) {
  const admin = await requireAdmin();
  const { reason } = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(input);
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    assertFulfillmentTransition(order.fulfillmentStatus, "REJECTED", "ADMIN");
    await releaseReservations(transaction, order, admin.id, "Reservation released after rejection of");
    const paymentStatus = order.paymentStatus === "PAID" ? "REFUND_REQUIRED" : order.paymentStatus;
    const updated = await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "REJECTED", paymentStatus },
    });
    await transaction.orderTimelineEvent.create({
      data: { orderId, actorUserId: admin.id, actorName: admin.name ?? admin.email, action: "ORDER_REJECTED", fromState: order.fulfillmentStatus, toState: "REJECTED", note: reason },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "ORDER_REJECTED",
      entity: "Order",
      entityId: orderId,
      before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
      after: auditJson({ fulfillmentStatus: updated.fulfillmentStatus, paymentStatus: updated.paymentStatus, reason }),
    });
    await enqueueEmailJob(transaction, {
      eventKey: `order-rejected:${order.id}`,
      template: "order-rejected",
      recipient: order.email,
      payload: { subject: `Order ${order.orderNumber} update`, text: `${reason}${paymentStatus === "REFUND_REQUIRED" ? " Your payment refund is in progress." : ""}` },
    });
    return updated;
  });
}

export async function cancelOrderAsAdmin(orderId: string, input: unknown) {
  const admin = await requireAdmin();
  const parsed = z.object({ reason: z.string().trim().min(1).max(1000), productionCostWarningAccepted: z.boolean().optional() }).parse(input);
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    assertFulfillmentTransition(order.fulfillmentStatus, "CANCELLED", "ADMIN");
    const hasCustom = order.lines.some((line) => line.productType === "CUSTOM_DRESS");
    if (hasCustom && order.fulfillmentStatus === "IN_PRODUCTION" && parsed.productionCostWarningAccepted !== true) {
      throw new RangeError("Confirm that production costs cannot be recovered before cancelling this order.");
    }
    await releaseReservations(transaction, order, admin.id, "Reservation released after cancellation of");
    const paymentStatus = order.paymentStatus === "PAID" ? "REFUND_REQUIRED" : order.paymentStatus;
    const updated = await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "CANCELLED", paymentStatus },
    });
    await transaction.orderTimelineEvent.create({
      data: { orderId, actorUserId: admin.id, actorName: admin.name ?? admin.email, action: "ORDER_CANCELLED", fromState: order.fulfillmentStatus, toState: "CANCELLED", note: parsed.reason },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "ORDER_CANCELLED",
      entity: "Order",
      entityId: orderId,
      before: auditJson({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
      after: auditJson({ fulfillmentStatus: updated.fulfillmentStatus, paymentStatus: updated.paymentStatus, reason: parsed.reason }),
    });
    await enqueueEmailJob(transaction, {
      eventKey: `order-cancelled:${order.id}`,
      template: "order-cancelled",
      recipient: order.email,
      payload: {
        subject: `Order ${order.orderNumber} cancelled`,
        text: `${parsed.reason}${paymentStatus === "REFUND_REQUIRED" ? " Your payment refund is in progress." : ""}`,
      },
    });
    return updated;
  });
}

export async function startProduction(orderId: string, input: unknown = {}, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const parsed = z.object({ customerConfirmed: z.boolean().optional(), confirmationNote: z.string().trim().max(1000).optional() }).parse(input);
  const now = clock.now();
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    assertFulfillmentTransition(order.fulfillmentStatus, "IN_PRODUCTION", "ADMIN");
    const containsCustomDress = order.lines.some((line) => line.productType === "CUSTOM_DRESS");
    const confirmationRecorded = Boolean(order.confirmedAt) || (order.paymentMethod === "COD" && parsed.customerConfirmed === true && Boolean(parsed.confirmationNote));
    assertCanStartProduction({
      fulfillmentStatus: order.fulfillmentStatus,
      containsCustomDress,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      now,
      customerConfirmed: confirmationRecorded,
    });
    let confirmedAt = order.confirmedAt;
    let confirmationMethod = order.confirmationMethod;
    let confirmationNote = order.confirmationNote;
    if (order.paymentMethod === "COD" && !confirmedAt) {
      if (parsed.customerConfirmed !== true || !parsed.confirmationNote) {
        throw new RangeError("Record the customer's COD confirmation and a note before starting production.");
      }
      confirmedAt = now;
      confirmationMethod = "ADMIN_PHONE";
      confirmationNote = parsed.confirmationNote;
      await transaction.order.update({ where: { id: order.id }, data: { confirmedAt, confirmationMethod, confirmationNote } });
    }
    for (const line of order.lines.filter((item) => item.productType === "CUSTOM_DRESS")) {
      const latestMeasurement = await transaction.measurementVersion.findFirst({
        where: { orderLineId: line.id },
        orderBy: { version: "desc" },
      });
      if (!latestMeasurement) throw new RangeError("Custom order line is missing its measurement version.");
      await transaction.measurementVersion.update({ where: { id: latestMeasurement.id }, data: { usedForProductionAt: now } });
    }
    const updated = await writeOrderTransition(transaction, {
      orderId,
      admin,
      from: order.fulfillmentStatus,
      to: "IN_PRODUCTION",
      action: "PRODUCTION_STARTED",
      note: confirmationNote ?? "Production started after the customer check period.",
    });
    return updated;
  });
}

export async function correctOrderMeasurements(orderId: string, lineId: string, input: unknown, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  return correctOrderMeasurementsForAdmin(admin, orderId, lineId, input, clock);
}

export async function correctOrderMeasurementsForAdmin(
  admin: { id: string; email: string; name: string | null },
  orderId: string,
  lineId: string,
  input: unknown,
  clock: Clock = systemClock,
) {
  const parsed = z.object({
    values: z.unknown(),
    reason: z.string().trim().min(1).max(1000),
  }).parse(input);
  const now = clock.now();
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    if (["IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED"].includes(order.fulfillmentStatus)) {
      throw new RangeError("Measurements can only be corrected before production starts.");
    }
    const line = order.lines.find((item) => item.id === lineId);
    if (!line || line.productType !== "CUSTOM_DRESS") throw new RangeError("Choose a custom-dress order line.");
    const rangeSetting = await transaction.setting.findFirst({
      where: { key: "measurement_ranges", effectiveAt: { lte: now } },
      orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
    });
    const ranges = parseMeasurementRanges(rangeSetting?.value);
    const values = validateMeasurements(parsed.values, ranges);
    const latest = await transaction.measurementVersion.findFirst({
      where: { orderLineId: line.id },
      orderBy: { version: "desc" },
    });
    const measurement = await transaction.measurementVersion.create({
      data: {
        orderLineId: line.id,
        version: (latest?.version ?? 0) + 1,
        values: auditJson(values),
        authorType: "ADMIN",
        authorUserId: admin.id,
        correctionReason: parsed.reason,
      },
    });
    await transaction.orderTimelineEvent.create({
      data: {
        orderId,
        actorUserId: admin.id,
        actorName: admin.name ?? admin.email,
        action: "MEASUREMENTS_CORRECTED",
        fromState: order.fulfillmentStatus,
        toState: order.fulfillmentStatus,
        note: parsed.reason,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "MEASUREMENT_VERSION_ADDED",
      entity: "OrderLine",
      entityId: line.id,
      before: latest ? auditJson({ version: latest.version, values: latest.values }) : undefined,
      after: auditJson({ version: measurement.version, values: measurement.values, reason: parsed.reason }),
    });
    return measurement;
  });
}

export async function completeOrderLineQC(orderId: string, lineId: string, input: unknown, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const parsed = z.object({ measuredWithinTolerance: z.literal(true), qcCardIncluded: z.literal(true), note: z.string().trim().min(1).max(1000) }).parse(input);
  const now = clock.now();
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    if (order.fulfillmentStatus !== "IN_PRODUCTION") throw new RangeError("QC is available only while an order is in production.");
    const line = order.lines.find((item) => item.id === lineId);
    if (!line || line.productType !== "CUSTOM_DRESS") throw new RangeError("Select a custom-dress order line for QC.");
    const updatedLine = await transaction.orderLine.update({
      where: { id: lineId },
      data: { qcCompletedAt: now, qcCompletedBy: admin.id, qcNotes: parsed.note, isReady: true },
    });
    await transaction.orderTimelineEvent.create({
      data: { orderId, actorUserId: admin.id, actorName: admin.name ?? admin.email, action: "CUSTOM_LINE_QC_COMPLETED", fromState: order.fulfillmentStatus, toState: order.fulfillmentStatus, note: `${line.productName}: ±0.5 inch check passed; QC card included. ${parsed.note}` },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "CUSTOM_LINE_QC_COMPLETED",
      entity: "OrderLine",
      entityId: lineId,
      after: auditJson({ qcCompletedAt: now, qcCompletedBy: admin.id, qcNotes: parsed.note, isReady: true }),
    });
    const allLines = await transaction.orderLine.findMany({ where: { orderId }, select: { isReady: true } });
    if (areAllOrderLinesReady(allLines)) {
      assertFulfillmentTransition(order.fulfillmentStatus, "READY_TO_SHIP", "ADMIN");
      await writeOrderTransition(transaction, { orderId, admin, from: order.fulfillmentStatus, to: "READY_TO_SHIP", action: "ORDER_READY_TO_SHIP", note: "All order lines are ready and QC is complete." });
    }
    return updatedLine;
  });
}

export async function markOrderLineReady(orderId: string, lineId: string) {
  const admin = await requireAdmin();
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    if (order.fulfillmentStatus !== "APPROVED" && order.fulfillmentStatus !== "IN_PRODUCTION") {
      throw new RangeError("Order lines can be marked ready only after approval and before shipment.");
    }
    const line = order.lines.find((item) => item.id === lineId);
    if (!line) throw new RangeError("Order line not found.");
    if (line.productType === "CUSTOM_DRESS" && !line.qcCompletedAt) throw new RangeError("Complete custom-line QC before marking it ready.");
    const updatedLine = await transaction.orderLine.update({ where: { id: lineId }, data: { isReady: true } });
    await transaction.orderTimelineEvent.create({
      data: { orderId, actorUserId: admin.id, actorName: admin.name ?? admin.email, action: "ORDER_LINE_READY", fromState: order.fulfillmentStatus, toState: order.fulfillmentStatus, note: `${line.productName} is ready.` },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "ORDER_LINE_READY",
      entity: "OrderLine",
      entityId: lineId,
      after: auditJson({ isReady: true }),
    });
    const allLines = await transaction.orderLine.findMany({ where: { orderId }, select: { isReady: true } });
    if (areAllOrderLinesReady(allLines)) {
      assertFulfillmentTransition(order.fulfillmentStatus, "READY_TO_SHIP", "ADMIN");
      await writeOrderTransition(transaction, { orderId, admin, from: order.fulfillmentStatus, to: "READY_TO_SHIP", action: "ORDER_READY_TO_SHIP", note: "All order lines are packed and ready." });
    }
    return updatedLine;
  });
}

export async function shipOrder(orderId: string, input: unknown, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const parsed = z.object({
    courierName: z.string().trim().min(1).max(120),
    awbNumber: z.string().trim().min(1).max(120),
    trackingUrl: z.string().url().optional().or(z.literal("")),
  }).parse(input);
  if (parsed.trackingUrl) {
    const protocol = new URL(parsed.trackingUrl).protocol;
    if (protocol !== "https:") throw new RangeError("Tracking URL must use HTTPS.");
  }
  const now = clock.now();
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    assertFulfillmentTransition(order.fulfillmentStatus, "SHIPPED", "ADMIN");
    assertOrderLinesReadyForShipment(order.lines);
    const variants = order.lines
      .filter((line): line is typeof line & { variantId: string } => line.variantId !== null)
      .sort((left, right) => left.variantId.localeCompare(right.variantId));
    for (const line of variants) {
      await transaction.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${line.variantId} FOR UPDATE`;
      const shipped = await transaction.productVariant.updateMany({
        where: { id: line.variantId, reserved: { gte: line.quantity }, onHand: { gte: line.quantity } },
        data: { reserved: { decrement: line.quantity }, onHand: { decrement: line.quantity } },
      });
      if (shipped.count !== 1) throw new Error("Stock reservation mismatch while shipping order.");
      await transaction.stockMovement.create({
        data: { variantId: line.variantId, orderId, actorUserId: admin.id, type: "SHIPMENT", quantity: -line.quantity, note: `Shipped for ${order.orderNumber}` },
      });
    }
    await transaction.shipment.create({
      data: {
        orderId,
        courierName: parsed.courierName,
        awbNumber: parsed.awbNumber,
        trackingUrl: parsed.trackingUrl || null,
        shippedAt: now,
      },
    });
    const updated = await writeOrderTransition(transaction, {
      orderId,
      admin,
      from: order.fulfillmentStatus,
      to: "SHIPPED",
      action: "ORDER_SHIPPED",
      note: `${parsed.courierName} · AWB ${parsed.awbNumber}`,
    });
    await enqueueEmailJob(transaction, {
      eventKey: `order-shipped:${order.id}`,
      template: "order-shipped",
      recipient: order.email,
      payload: {
        subject: `Order ${order.orderNumber} shipped`,
        text: `${parsed.courierName} · AWB ${parsed.awbNumber}${parsed.trackingUrl ? `\n${parsed.trackingUrl}` : ""}`,
      },
    });
    return updated;
  });
}

export async function markOrderDelivered(orderId: string, deliveredAtInput?: string, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const now = clock.now();
  const deliveredAt = deliveredAtInput ? new Date(deliveredAtInput) : now;
  if (!Number.isFinite(deliveredAt.getTime()) || deliveredAt > now) throw new RangeError("Delivery time must not be in the future.");
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    assertFulfillmentTransition(order.fulfillmentStatus, "DELIVERED", "ADMIN");
    const shipment = await transaction.shipment.findUnique({ where: { orderId } });
    if (!shipment) throw new RangeError("Shipment details are required before delivery can be recorded.");
    if (deliveredAt < shipment.shippedAt) throw new RangeError("Delivery time cannot be earlier than shipment time.");
    await transaction.shipment.update({ where: { orderId }, data: { deliveredAt } });
    const updated = await writeOrderTransition(transaction, {
      orderId,
      admin,
      from: order.fulfillmentStatus,
      to: "DELIVERED",
      action: "ORDER_DELIVERED",
      note: `Delivery recorded at ${deliveredAt.toISOString()}.`,
    });
    await enqueueEmailJob(transaction, {
      eventKey: `order-delivered:${order.id}`,
      template: "order-delivered",
      recipient: order.email,
      payload: {
        subject: `Order ${order.orderNumber} delivered`,
        text: "Your order has been marked delivered. Eligible replacement requests are available for four days from the recorded delivery time.",
      },
    });
    const replacementHours = readReplacementWindowHours(order.settingsSnapshot);
    return { order: updated, replacementWindowExpired: deliveredAt.getTime() + replacementHours * 60 * 60 * 1000 <= now.getTime() };
  });
}

function readReplacementWindowHours(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 96;
  const direct = (snapshot as Record<string, unknown>).replacementWindowHours;
  if (typeof direct === "number" && Number.isSafeInteger(direct) && direct >= 0) return direct;
  return 96;
}

export async function markCodCollected(orderId: string, input: unknown, clock: Clock = systemClock) {
  const admin = await requireAdmin();
  const parsed = z.object({ amountPaise: z.number().int().positive(), collectedAt: z.string().datetime().optional() }).parse(input);
  const collectedAt = parsed.collectedAt ? new Date(parsed.collectedAt) : clock.now();
  if (collectedAt > clock.now()) throw new RangeError("Cash collection date cannot be in the future.");
  return db.$transaction(async (transaction) => {
    const order = await lockAdminOrder(transaction, orderId);
    if (order.fulfillmentStatus !== "DELIVERED" || order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING") {
      throw new RangeError("Only delivered COD orders awaiting collection can be marked COD collected.");
    }
    if (parsed.amountPaise !== order.totalPaise) throw new RangeError("Collection amount must match the order total.");
    const updated = await transaction.order.update({
      where: { id: orderId },
      data: { paymentStatus: "COD_COLLECTED", codCollectedAt: collectedAt, codCollectedAmountPaise: parsed.amountPaise },
    });
    await transaction.orderTimelineEvent.create({
      data: { orderId, actorUserId: admin.id, actorName: admin.name ?? admin.email, action: "COD_COLLECTED", fromState: "COD_PENDING", toState: "COD_COLLECTED", note: `${formatPaise(parsed.amountPaise)} collected.` },
    });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "COD_COLLECTED",
      entity: "Order",
      entityId: orderId,
      before: auditJson({ paymentStatus: order.paymentStatus }),
      after: auditJson({ paymentStatus: updated.paymentStatus, amountPaise: parsed.amountPaise, collectedAt }),
    });
    return updated;
  });
}

export async function addAdminOrderNote(orderId: string, input: unknown) {
  const admin = await requireAdmin();
  const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).parse(input);
  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) return null;
    const note = await transaction.orderNote.create({ data: { orderId, authorId: admin.id, body: parsed.body } });
    await writeAuditEntry(transaction, {
      actorUserId: admin.id,
      actorType: "USER",
      action: "ORDER_NOTE_ADDED",
      entity: "Order",
      entityId: orderId,
      after: auditJson({ noteId: note.id }),
    });
    return note;
  });
}