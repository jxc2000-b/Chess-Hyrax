// NOTE: supabaseClient is still the browser-only client (reads import.meta.env
// and exports a ready-made instance), so this package is currently consumable
// by apps/web alone. Splitting it into a config-taking factory — so apps/api
// can supply its own service-role credentials — is still outstanding.
export { supabase, isSupabaseConfigured } from "./supabaseClient.ts";
