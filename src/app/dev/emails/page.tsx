import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/server/db";
import { decryptEmailPayload } from "@/server/email/outbox";
import { formatIndiaDateTime } from "@/server/domain/clock";

export const instant = false;

export default async function DevelopmentEmailsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();

  const messages = await db.emailJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-5 py-10">
      <header className="border-b border-border-strong pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-success">Florangi / Development</p>
        <h1 className="mt-2 text-3xl font-medium">Email outbox</h1>
      </header>
      {messages.length === 0 ? (
        <p className="py-10 text-muted">No development emails have been queued.</p>
      ) : (
        <ul className="divide-y divide-border">
          {messages.map((message) => {
            let payload: Record<string, unknown> | null = null;
            try {
              payload = decryptEmailPayload(message.payload);
            } catch {
              payload = null;
            }
            const url = typeof payload?.url === "string" ? payload.url : null;
            return (
              <li className="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" key={message.id}>
                <div>
                  <h2 className="font-medium">{String(payload?.subject ?? message.template)}</h2>
                  <p className="mt-1 text-sm text-muted">{message.recipient} · {message.status}</p>
                  <p className="mt-1 text-xs text-muted">{formatIndiaDateTime(message.createdAt)}</p>
                  {typeof payload?.text === "string" && <p className="mt-3 text-sm">{payload.text}</p>}
                </div>
                {url && (
                  <a className="self-center text-sm font-semibold text-success underline" href={url}>
                    Open email link
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}