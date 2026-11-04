import { describe, expect, it } from "vitest";
import { renderEmailPayload } from "@/server/email/provider";

describe("transactional email rendering", () => {
  it("escapes user-provided text and measurement content", () => {
    const rendered = renderEmailPayload({
      subject: "Order <script>alert(1)</script>",
      text: "Reason: <img src=x onerror=alert(1)>",
      measurements: [{ fitNotes: "<script>private</script>" }],
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("does not render unsafe action URLs", () => {
    const rendered = renderEmailPayload({ subject: "Verify", text: "Continue", url: "javascript:alert(1)" });
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("<a href=");
  });
});