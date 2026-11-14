import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemClock } from "@/server/domain/clock";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getSetting: vi.fn(), orderCount: vi.fn(), orderList: vi.fn(), replacementCount: vi.fn(), emailCount: vi.fn(), emailGroups: vi.fn(), stockQuery: vi.fn(),
}));
vi.mock("@/server/auth/guards", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/env", () => ({ getEnvironment: () => ({ EMAIL_DAILY_QUOTA: 300 }) }));
vi.mock("./settings", () => ({ getEffectiveSetting: mocks.getSetting }));
vi.mock("@/server/db", () => ({ db: {
  order: { count: mocks.orderCount, findMany: mocks.orderList }, replacementRequest: { count: mocks.replacementCount },
  emailJob: { count: mocks.emailCount, groupBy: mocks.emailGroups }, $queryRaw: mocks.stockQuery,
} }));

import { getAdminOverview } from "./admin-overview";

describe("admin overview snapshot", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.restoreAllMocks(); vi.resetAllMocks();
    vi.spyOn(systemClock, "now").mockReturnValue(new Date("2026-11-12T23:30:00Z"));
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
    mocks.getSetting.mockResolvedValue({ value: { availableUnits: 2 } });
    mocks.orderCount.mockResolvedValueOnce(12).mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    mocks.replacementCount.mockResolvedValue(2);
    mocks.orderList.mockResolvedValue([{ id: "order", orderNumber: "FLR-2026-000001", firstName: "Mira", lastName: "Kapoor", totalPaise: 250000, paymentMethod: "COD", createdAt: new Date("2026-11-11T20:00:00Z") }]);
    mocks.emailCount.mockResolvedValue(246);
    mocks.emailGroups.mockResolvedValue([{ status: "QUEUED", _count: { _all: 6 } }, { status: "PROCESSING", _count: { _all: 3 } }, { status: "FAILED", _count: { _all: 2 } }]);
    mocks.stockQuery.mockResolvedValueOnce([{ lowStock: 5, outOfStock: 2 }]).mockResolvedValueOnce([{ id: "size", productId: "product", productName: "Dress", size: "S", available: 0 }]);
  });

  it("requires admin access before reading any overview data", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Admin sign in is required."));
    await expect(getAdminOverview()).rejects.toThrow("Admin sign in");
    expect(mocks.orderCount).not.toHaveBeenCalled();
    expect(mocks.emailGroups).not.toHaveBeenCalled();
    expect(mocks.stockQuery).not.toHaveBeenCalled();
    expect(mocks.getSetting).not.toHaveBeenCalled();
  });

  it("keeps email states distinct and uses the worker's UTC quota window", async () => {
    const data = await getAdminOverview();
    expect(data.counts).toEqual({ awaitingApproval: 12, inProduction: 3, readyToShip: 4, openReplacements: 2 });
    expect(data.email).toMatchObject({ sentToday: 246, quota: 300, queued: 6, deferred: 0, processing: 3, failed: 2 });
    expect(data.email.resetsAt.toISOString()).toBe("2026-11-13T00:00:00.000Z");
    expect(mocks.emailCount).toHaveBeenCalledWith({ where: { status: "SENT", sentAt: { gte: new Date("2026-11-12T00:00:00Z"), lt: new Date("2026-11-13T00:00:00Z") } } });
    expect(data.approvalOrders[0].waitingHours).toBe(27);
    expect(data.stock).toMatchObject({ threshold: 2, lowStock: 5, outOfStock: 2 });
  });

  it("preserves a zero stock threshold and handles empty queues", async () => {
    mocks.getSetting.mockResolvedValue({ value: { availableUnits: 0 } });
    mocks.orderList.mockResolvedValue([]); mocks.emailGroups.mockResolvedValue([]);
    mocks.stockQuery.mockReset().mockResolvedValueOnce([{ lowStock: 0, outOfStock: 0 }]).mockResolvedValueOnce([]);
    const data = await getAdminOverview();
    expect(data.stock).toEqual({ threshold: 0, lowStock: 0, outOfStock: 0, sizes: [] });
    expect(data.approvalOrders).toEqual([]);
    expect(data.email).toMatchObject({ queued: 0, deferred: 0, processing: 0, failed: 0 });
  });
});
