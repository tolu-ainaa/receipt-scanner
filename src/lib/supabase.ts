import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// The placeholders only keep module load from throwing; App shows a setup
// message instead of using the client when isConfigured is false.
export const supabase = createClient(url ?? "http://localhost", key ?? "unconfigured");
