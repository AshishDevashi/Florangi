import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
process.env.CRON_SECRET = "test-cron-secret";
process.env.EMAIL_DRIVER = "dev";
process.env.EMAIL_DAILY_QUOTA = "100";

const { db } = await import("../src/server/db.ts");
const { GET } = await import("../src/app/api/cron/tick/route.ts");
const { createCodConfirmationToken, parseCodConfirmationToken } = await import("../src/server/domain/cod-confirmation.ts");
const { encryptPayload } = await import("../src/server/email/outbox.ts");
const { refreshCodConfirmationPayload } = await import("../src/server/services/cod-confirmation.ts");

function replace(target, name, implementation) {
  const original = target[name];
  target[name] = implementation;
  return () => { target[name] = original; };
}

test("cron rejects missing and invalid credentials without querying the database", async () => {
  const query = mock.fn(() => { throw new Error("unexpected database access"); });
  const restore = replace(db, "$queryRaw", query);
  try {
    for (const authorization of ["", "Bearer wrong", "Bearer test-cron-secreu"]) {
      const response = await GET(new Request("http://localhost/api/cron/tick", { headers: { authorization } }));
      assert.equal(response.status, 403);
    }
    assert.equal(query.mock.callCount(), 0);
  } finally {
    restore();
  }
});

test("cron processes a full 100-job batch without expiring orders", async () => {
  const payload = encryptPayload({ subject: "Order update", text: "Update" });
  const jobs = Array.from({ length: 100 }, (_, index) => ({
    id: `job-${index}`, template: "order-update", payload, attemptCount: 1, recipient: "test@example.test",
  }));
  const sent = [];
  const mocks = [
    replace(db, "$queryRaw", async () => []),
    replace(db.emailJob, "updateMany", async () => ({ count: 1 })),
    replace(db.emailJob, "findMany", async (input) => {
      assert.equal(input.take, 100);
      return jobs;
    }),
    replace(db.emailJob, "count", async () => 0),
    replace(db.emailJob, "findUnique", async ({ where }) => jobs.find((job) => job.id === where.id)),
    replace(db.emailJob, "update", async ({ where, data }) => {
      if (data.status === "SENT") sent.push(where.id);
      return {};
    }),
    replace(db, "$transaction", async (callback) => callback(db)),
    replace(db.order, "update", () => { throw new Error("unexpected order expiry"); }),
    replace(console, "info", () => {}),
  ];
  try {
    const response = await GET(new Request("http://localhost/api/cron/tick", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { emailJobsProcessed: 100 });
    assert.equal(sent.length, 100);
  } finally {
    for (const restore of mocks) restore();
  }
});

test("queued confirmation links are refreshed before they expire", async () => {
  const now = new Date("2026-01-03T00:00:00.000Z");
  const orderId = "order-1";
  const original = createCodConfirmationToken(orderId, new Date("2026-01-02T00:00:00.000Z"), process.env.SESSION_SECRET);
  const payload = { orderId, url: `https://example.test/orders/${orderId}/confirm-cod#token=${original}&access=guest-token` };
  const created = [];
  const transaction = { orderConfirmationToken: { create: async ({ data }) => created.push(data) } };

  const refreshed = await refreshCodConfirmationPayload(transaction, payload, now);
  const fragment = new URLSearchParams(new URL(refreshed.url).hash.slice(1));
  const token = parseCodConfirmationToken(fragment.get("token"), process.env.SESSION_SECRET, now);
  assert.equal(fragment.get("access"), "guest-token");
  assert.equal(token.orderId, orderId);
  assert.equal(token.expiresAt.toISOString(), "2026-01-05T00:00:00.000Z");
  assert.equal(created[0].tokenHash, token.tokenHash);

  assert.equal(await refreshCodConfirmationPayload(transaction, refreshed, now), refreshed);
  assert.equal(created.length, 1);
  await assert.rejects(refreshCodConfirmationPayload(transaction, { ...payload, orderId: "other-order" }, now));
});
