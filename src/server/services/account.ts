import "server-only";

import { z } from "zod";
import { requireCustomer } from "@/server/auth/guards";
import { db } from "@/server/db";
import { deliveryAddressSchema } from "@/server/services/orders";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^(?:\+91[-\s]?)?[6-9]\d{9}$/),
});

const addressInputSchema = deliveryAddressSchema.extend({ isDefault: z.boolean().optional() });

export async function updateCustomerProfile(input: unknown) {
  const customer = await requireCustomer();
  const parsed = profileSchema.parse(input);
  return db.user.update({
    where: { id: customer.id },
    data: { name: parsed.name, phone: parsed.phone.replace(/[\s-]/g, "") },
    select: { id: true, name: true, phone: true, email: true },
  });
}

export async function listCustomerAddresses() {
  const customer = await requireCustomer();
  return db.address.findMany({ where: { userId: customer.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
}

export async function createCustomerAddress(input: unknown) {
  const customer = await requireCustomer();
  const parsed = addressInputSchema.parse(input);
  return db.$transaction(async (transaction) => {
    const existingCount = await transaction.address.count({ where: { userId: customer.id } });
    const isDefault = parsed.isDefault ?? existingCount === 0;
    if (isDefault) await transaction.address.updateMany({ where: { userId: customer.id }, data: { isDefault: false } });
    return transaction.address.create({
      data: {
        userId: customer.id,
        fullName: parsed.fullName,
        phone: parsed.phone.replace(/[\s-]/g, ""),
        line1: parsed.line1,
        line2: parsed.line2 || null,
        landmark: parsed.landmark || null,
        city: parsed.city,
        state: parsed.state,
        pinCode: parsed.pinCode,
        isDefault,
      },
    });
  });
}

export async function updateCustomerAddress(id: string, input: unknown) {
  const customer = await requireCustomer();
  const parsed = addressInputSchema.partial().parse(input);
  if (Object.keys(parsed).length === 0) throw new RangeError("At least one address field is required.");
  return db.$transaction(async (transaction) => {
    const existing = await transaction.address.findFirst({ where: { id, userId: customer.id } });
    if (!existing) return null;
    if (parsed.isDefault) await transaction.address.updateMany({ where: { userId: customer.id }, data: { isDefault: false } });
    const { isDefault, phone, line2, landmark, ...fields } = parsed;
    return transaction.address.update({
      where: { id },
      data: {
        ...fields,
        ...(phone === undefined ? {} : { phone: phone.replace(/[\s-]/g, "") }),
        ...(line2 === undefined ? {} : { line2: line2 || null }),
        ...(landmark === undefined ? {} : { landmark: landmark || null }),
        ...(isDefault === undefined ? {} : { isDefault }),
      },
    });
  });
}

export async function deleteCustomerAddress(id: string) {
  const customer = await requireCustomer();
  return db.$transaction(async (transaction) => {
    const existing = await transaction.address.findFirst({ where: { id, userId: customer.id } });
    if (!existing) return false;
    await transaction.address.delete({ where: { id } });
    if (existing.isDefault) {
      const nextAddress = await transaction.address.findFirst({ where: { userId: customer.id }, orderBy: { createdAt: "desc" } });
      if (nextAddress) await transaction.address.update({ where: { id: nextAddress.id }, data: { isDefault: true } });
    }
    return true;
  });
}