import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// True only when both env vars are present. Auth + persistence calls check this
// and fail gracefully (rather than firing requests at a placeholder endpoint).
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Copy frontend/.env.example to frontend/.env.local and fill them in " +
      "(see schema/README.md). Auth and persistence stay disabled until then.",
  );
}

// Placeholder fall-backs keep createClient from throwing at import time when env
// is missing; nothing reaches them because real calls are gated on
// isSupabaseConfigured.
export const supabase = createClient(
  supabaseUrl || "http://localhost:54321",
  supabaseAnonKey || "anon-placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
