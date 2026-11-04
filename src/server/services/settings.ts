import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/auth/guards";
import { systemClock, type Clock } from "@/server/domain/clock";
import { auditJson, writeAuditEntry } from "@/server/services/audit";
import { parseMeasurementRanges } from "@/server/domain/measurements";

const settingKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);

function validateSettingValue(key: string, value: unknown): unknown {
  switch (key) {
    case "shipping_fee_paise":
    case "shipping_free_threshold_paise":
      return z.object({ amountPaise: z.number().int().nonnegative() }).parse(value);
    case "customization_fee_limits_paise": {
      const limits = z.object({ minPaise: z.number().int().nonnegative(), maxPaise: z.number().int().nonnegative() }).parse(value);
      if (limits.minPaise > limits.maxPaise) throw new RangeError("Customization fee minimum cannot exceed maximum.");
      return limits;
    }
    case "measurement_ranges":
      try {
        return parseMeasurementRanges(value);
      } catch (error) {
        throw new RangeError(error instanceof Error ? error.message : "Measurement ranges are invalid.");
      }
    case "replacement_window_hours":
      return z.object({ hours: z.number().int().positive() }).parse(value);
    case "low_stock_threshold":
      return z.object({ availableUnits: z.number().int().nonnegative() }).parse(value);
    default:
      throw new RangeError("Unsupported setting key.");
  }
}

export async function getEffectiveSetting(key: string, clock: Clock = systemClock) {
  const validKey = settingKeySchema.parse(key);
  return db.setting.findFirst({
    where: { key: validKey, effectiveAt: { lte: clock.now() } },
    orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
  });
}

export async function getEffectiveSettings(clock: Clock = systemClock) {
  const records = await db.setting.findMany({
    where: { effectiveAt: { lte: clock.now() } },
    orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
  });
  const effective = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    if (!effective.has(record.key)) effective.set(record.key, record);
  }
  return effective;
}

export async function listAdminEffectiveSettings(clock: Clock = systemClock) {
  await requireAdmin();
  const settings = await getEffectiveSettings(clock);
  return [...settings.values()];
}

export async function createSettingVersion(key: string, value: unknown, clock: Clock = systemClock) {
  const actor = await requireAdmin();
  const validKey = settingKeySchema.parse(key);
  const serializedValue = auditJson(validateSettingValue(validKey, value));
  const effectiveAt = clock.now();

  return db.$transaction(async (transaction) => {
    const previous = await transaction.setting.findFirst({
      where: { key: validKey, effectiveAt: { lte: effectiveAt } },
      orderBy: [{ effectiveAt: "desc" }, { version: "desc" }],
    });
    const latest = await transaction.setting.findFirst({
      where: { key: validKey },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const setting = await transaction.setting.create({
      data: {
        key: validKey,
        version: (latest?.version ?? 0) + 1,
        value: serializedValue,
        isDevDefault: false,
        effectiveAt,
        createdById: actor.id,
      },
    });
    await writeAuditEntry(transaction, {
      actorUserId: actor.id,
      actorType: "USER",
      action: "SETTING_VERSION_CREATED",
      entity: "Setting",
      entityId: setting.id,
      before: previous ? auditJson({ key: previous.key, version: previous.version, value: previous.value }) : undefined,
      after: auditJson({ key: setting.key, version: setting.version, value: setting.value }),
    });
    return setting;
  });
}