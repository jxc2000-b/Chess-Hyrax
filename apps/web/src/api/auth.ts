// Authentication: input sanitization + validation guards in front of Supabase
// email/password auth. Every entry point returns AuthResult so the UI can show
// a single error string without try/catch ceremony.

import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@hyrax/shared";
import { DEFAULT_USER_PREFERENCES } from "../userPreferencesContext";

export type Platform = "chesscom" | "lichess";

export type AuthResult<T> = { data: T | null; error: string | null };

export type SignUpInput = {
  email: string;
  password: string;
  platform: Platform;
  platformUsername: string;
};

/* ----------------------------- sanitization ------------------------------ */

export function sanitizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function sanitizePlatformUsername(raw: string): string {
  return raw.trim();
}

export function isPlatform(value: string): value is Platform {
  return value === "chesscom" || value === "lichess";
}

/* ------------------------------ validation ------------------------------- */

// Deliberately simple: reject the obviously-wrong, let Supabase be the source
// of truth for the rest. Never trust the input — these run before every call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{2,30}$/;

export function validateEmail(email: string): string | null {
  if (!email) return "Email is required.";
  if (email.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 72) return "Password must be 72 characters or fewer."; // bcrypt ceiling
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use upper- and lower-case letters and a number.";
  }
  return null;
}

export function validatePlatformUsername(username: string): string | null {
  if (!username) return "Chess username is required.";
  if (!USERNAME_RE.test(username)) return "2–30 letters, numbers, _ or -.";
  return null;
}

/* -------------------------------- actions -------------------------------- */

const NOT_CONFIGURED =
  "Sign-in is not configured yet. Set the Supabase env vars (see schema/README.md).";

export async function signIn(emailRaw: string, password: string): Promise<AuthResult<Session>> {
  if (!isSupabaseConfigured) return { data: null, error: NOT_CONFIGURED };

  const email = sanitizeEmail(emailRaw);
  const emailError = validateEmail(email);
  if (emailError) return { data: null, error: emailError };
  if (!password) return { data: null, error: "Password is required." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { data: null, error: humanizeAuthError(error.message) };
  return { data: data.session, error: null };
}

export async function signUp(input: SignUpInput): Promise<AuthResult<Session>> {
  if (!isSupabaseConfigured) return { data: null, error: NOT_CONFIGURED };

  const email = sanitizeEmail(input.email);
  const platformUsername = sanitizePlatformUsername(input.platformUsername);

  const error =
    validateEmail(email) ||
    validatePassword(input.password) ||
    (isPlatform(input.platform) ? null : "Choose chess.com or lichess.") ||
    validatePlatformUsername(platformUsername);
  if (error) return { data: null, error };

  // platform / platform_username / preferences ride along as user metadata; the
  // 0002 DB trigger copies them into the public.users profile row on signup.
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        platform: input.platform,
        platform_username: platformUsername,
        preferences: DEFAULT_USER_PREFERENCES,
      },
    },
  });
  if (signUpError) return { data: null, error: humanizeAuthError(signUpError.message) };
  return { data: data.session, error: null };
}

export async function signOut(): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error: error ? error.message : null };
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to auth changes; returns an unsubscribe function.
export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// Map Supabase's raw messages to friendlier copy without leaking specifics.
function humanizeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Invalid email or password.";
  if (m.includes("already registered") || m.includes("already exists")) {
    return "That email is already registered. Try signing in.";
  }
  if (m.includes("email not confirmed")) return "Confirm your email, then sign in.";
  if (m.includes("rate limit")) return "Too many attempts. Wait a moment and retry.";
  return message;
}
