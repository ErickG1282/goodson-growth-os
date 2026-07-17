import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing Supabase URL. Add NEXT_PUBLIC_SUPABASE_URL to .env.local.",
  );
}

if (!supabaseKey) {
  throw new Error(
    "Missing Supabase key. Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
