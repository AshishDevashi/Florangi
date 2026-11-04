import "server-only";

import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";

export interface AuditEntry {
  actorUserId?: string;
  actorType: "USER" | "SYSTEM";
  action: string;
  entity: string;
  entityId: string;
  before?: PrismaTypes.InputJsonValue;
  after?: PrismaTypes.InputJsonValue;
}

export async function writeAuditEntry(
  transaction: PrismaTypes.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorType: entry.actorType,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ...(entry.before === undefined ? {} : { before: entry.before }),
      ...(entry.after === undefined ? {} : { after: entry.after }),
    },
  });
}

export function auditJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) throw new TypeError("Audit values cannot be undefined.");
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}