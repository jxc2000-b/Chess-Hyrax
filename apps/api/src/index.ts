// Entry point. Verifies the Supabase connection on startup; replace the
// smoke test with real routes/handlers as this backend grows.

import "dotenv/config";
import { getSupabase, isSupabaseConfigured } from "./supabaseClient.js";

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Supabase is not configured. Copy .env.example to .env and fill in the values.");
    process.exitCode = 1;
    return;
  }

  const supabase = getSupabase();

  // Cheap connectivity check: hits the auth endpoint without needing any
  // tables to exist yet. Swap for a real table query once the schema lands,
  // e.g. supabase.from("games").select("id").limit(1).
  const { error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Supabase connection check failed: ${error.message}`);
  }

  console.log(`Connected to Supabase at ${process.env.SUPABASE_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
