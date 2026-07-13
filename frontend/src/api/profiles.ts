// Profile data-access: read the signed-in user's profile and call the update
// RPCs from schema/migrations/0004_functions.sql. RLS guarantees a user only
// ever touches their own row, so none of these take a user id.

import { supabase } from "./supabaseClient";
import type { UserPreferences } from "../userPreferencesContext";
import type { Platform } from "./auth";

export type UserProfile = {
  id: string;
  email: string | null;
  platform: Platform | null;
  platform_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  preferences: UserPreferences;
  onboarding_completed_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getMyProfile(): Promise<UserProfile | null> {
  // RLS scopes this to the caller's row; maybeSingle tolerates "no row yet".
  const { data, error } = await supabase.from("users").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserProfile | null) ?? null;
}

export async function updateUserPreferences(
  preferences: UserPreferences,
): Promise<UserProfile> {
  const { data, error } = await supabase.rpc("update_user_preferences", {
    new_preferences: preferences,
  });
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function setUserPlatform(
  platform: Platform,
  username: string,
): Promise<UserProfile> {
  const { data, error } = await supabase.rpc("set_user_platform", {
    p_platform: platform,
    p_username: username,
  });
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function touchLastSeen(): Promise<void> {
  const { error } = await supabase.rpc("touch_last_seen");
  if (error) throw new Error(error.message);
}
