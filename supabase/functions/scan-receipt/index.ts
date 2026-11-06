import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { DEFAULT_MODEL, extractReceipt, type ImageType, ScanError } from "./extract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const failure = (error: ScanError) =>
  json({ error: { code: error.code, message: error.message } }, error.status);

const IMAGE_TYPES: Record<string, ImageType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Claude's per-image limit is 5 MB of base64, which is about 3.75 MB of raw bytes.
const MAX_IMAGE_BYTES = 3_750_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: { code: "method", message: "Use POST." } }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new ScanError(401, "unauthorized", "Please sign in again.");

    // Acts as the caller, so storage RLS and the quota both apply to them.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) throw new ScanError(401, "unauthorized", "Please sign in again.");

    const body = await req.json().catch(() => null);
    const path: unknown = body?.path;
    if (typeof path !== "string" || !path.startsWith(`${auth.user.id}/`) || path.includes("..")) {
      throw new ScanError(400, "bad_path", "That image isn't yours to scan.");
    }

    const mediaType = IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
    if (!mediaType) throw new ScanError(400, "bad_type", "Use a JPEG, PNG or WebP image.");

    const { data: file, error: downloadError } = await supabase.storage.from("receipts").download(path);
    if (downloadError || !file) throw new ScanError(404, "not_found", "That image couldn't be found.");
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ScanError(413, "too_large", "That image is too large. Try a smaller photo.");
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set");
      throw new ScanError(500, "misconfigured", "The scanner isn't set up correctly.");
    }

    // Taken last so a bad request doesn't use up the person's allowance.
    const { data: remaining, error: quotaError } = await supabase.rpc("consume_scan");
    if (quotaError) {
      if (quotaError.message.includes("scan_limit_reached")) {
        throw new ScanError(429, "limit_reached", "You've used today's scans. You can still enter receipts by hand.");
      }
      throw quotaError;
    }

    // 60s x 2 attempts stays inside the Edge Function request limit.
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const extraction = await extractReceipt(
      client,
      { base64, mediaType },
      Deno.env.get("CLAUDE_MODEL") ?? DEFAULT_MODEL,
    );

    return json({ extraction, remaining });
  } catch (error) {
    if (error instanceof ScanError) return failure(error);
    console.error("Unexpected scan failure:", error);
    return failure(new ScanError(500, "unexpected", "Something went wrong. Try again."));
  }
});
