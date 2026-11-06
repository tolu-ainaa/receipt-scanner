import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { extractReceipt, ScanError } from "./extract.ts";
import { normalizeExtraction, type ReceiptExtraction } from "./schema.ts";

const valid: ReceiptExtraction = {
  is_receipt: true,
  merchant: " Corner Cafe ",
  purchased_on: "2026-11-02",
  currency: "usd",
  subtotal: 10,
  tax: 0.8,
  tip: null,
  total: 10.804,
  category: "dining",
  payment_method: "Visa",
  items: [{ description: "Latte", quantity: 2, line_total: 10 }],
  warnings: [],
};

const image = { base64: "AAAA", mediaType: "image/jpeg" as const };

function clientReturning(text: string, stop_reason = "end_turn") {
  const create = vi.fn().mockResolvedValue({ stop_reason, content: [{ type: "text", text }] });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

function clientThrowing(error: Error) {
  const create = vi.fn().mockRejectedValue(error);
  return { beta: { messages: { create } } } as unknown as Anthropic;
}

const apiError = (Type: unknown, status: number) =>
  new (Type as new (...args: unknown[]) => Error)(status, { message: "x" }, "x", new Headers());

describe("normalizeExtraction", () => {
  it("cleans text, currency and rounding", () => {
    const result = normalizeExtraction(valid);
    expect(result.merchant).toBe("Corner Cafe");
    expect(result.currency).toBe("USD");
    expect(result.total).toBe(10.8);
  });

  it("drops an impossible date and tells the reviewer", () => {
    const result = normalizeExtraction({ ...valid, purchased_on: "2026-02-31" });
    expect(result.purchased_on).toBeNull();
    expect(result.warnings[0]).toContain("2026-02-31");
  });

  it("drops a currency the database would reject", () => {
    expect(normalizeExtraction({ ...valid, currency: "$" }).currency).toBeNull();
  });

  it("treats a blank merchant as missing", () => {
    expect(normalizeExtraction({ ...valid, merchant: "   " }).merchant).toBeNull();
  });
});

describe("extractReceipt", () => {
  it("sends the image first and returns normalised data", async () => {
    const { client, create } = clientReturning(JSON.stringify(valid));
    const result = await extractReceipt(client, image);

    expect(result.currency).toBe("USD");
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.messages[0].content[0].type).toBe("image");
    expect(request.output_config.format).toBeDefined();
  });

  it.each([
    ["", "refusal", "refused"],
    ['{"merchant": "Cut o', "max_tokens", "too_long"],
    ["", "end_turn", "bad_output"],
    ["not json", "end_turn", "bad_output"],
    ['{"merchant": "valid json, wrong shape"}', "end_turn", "bad_output"],
    [JSON.stringify({ ...valid, is_receipt: false }), "end_turn", "not_a_receipt"],
  ])("rejects %j with stop reason %s as %s", async (text, stopReason, code) => {
    const { client } = clientReturning(text, stopReason);
    await expect(extractReceipt(client, image)).rejects.toMatchObject({ code });
  });

  it.each([
    [Anthropic.RateLimitError, 429, "busy"],
    [Anthropic.AuthenticationError, 401, "misconfigured"],
    [Anthropic.BadRequestError, 400, "unreadable_image"],
    [Anthropic.InternalServerError, 500, "upstream"],
  ])("maps API errors without leaking their text", async (Type, status, code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = await extractReceipt(clientThrowing(apiError(Type, status)), image).catch((e) => e);
    expect(failure).toBeInstanceOf(ScanError);
    expect(failure.code).toBe(code);
  });
});
