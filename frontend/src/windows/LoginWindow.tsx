// Login / sign-up surfaced as a centered modal over the session shell, blurring
// the background chessboard via the shared BlurSpotlight (mirrors ImportGamesWindow).
// Sanitizes and validates input client-side (auth.ts guards run again before
// every network call), surfaces a single error line, and reports success up via
// onAuthenticated.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../app.css";
import { TextButton } from "../components";
import { BlurSpotlight, type SpotlightRect } from "../tutorial/BlurSpotlight";
import { useAuth } from "../auth/AuthContext";
import {
  isPlatform,
  sanitizeEmail,
  sanitizePlatformUsername,
  validateEmail,
  validatePassword,
  validatePlatformUsername,
  type Platform,
} from "../api/auth";

type LoginWindowProps = {
  open: boolean;
  onClose: () => void;
  onAuthenticated?: () => void;
};

type Mode = "signin" | "signup";

function LoginWindow({ open, onClose, onAuthenticated }: LoginWindowProps) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [platformUsername, setPlatformUsername] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  // Centered-modal + blur spotlight, mirroring the import games popup.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [hole, setHole] = useState<SpotlightRect | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  // Client-side guard before hitting the network. Returns the first problem.
  function preflight(): string | null {
    const emailError = validateEmail(sanitizeEmail(email));
    if (emailError) return emailError;
    if (!isSignup) {
      return password ? null : "Password is required.";
    }
    return (
      validatePassword(password) ||
      (isPlatform(platform) ? null : "Choose chess.com or lichess.") ||
      validatePlatformUsername(sanitizePlatformUsername(platformUsername))
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const problem = preflight();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { data, error: signUpError } = await signUp({
          email,
          password,
          platform,
          platformUsername,
        });
        if (signUpError) {
          setError(signUpError);
          return;
        }
        if (data) {
          onAuthenticated?.();
          return;
        }
        // No session yet → email confirmation is on. Send them to sign-in.
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        setPassword("");
        return;
      }

      const { data, error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError);
        return;
      }
      if (data) {
        onAuthenticated?.();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const measure = useCallback(() => {
    const element = dialogRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setHole({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, []);

  // Measure the dialog once mounted (before paint, so the blur frames it without
  // a flash) and keep it aligned on resize.
  useLayoutEffect(() => {
    if (!open) {
      setHole(null);
      return;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // The dialog grows/shrinks as the mode toggles or messages appear; re-measure
  // so the blur clip-out tracks it.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    measure();
  }, [open, measure, isSignup, error, notice, busy, platform]);

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <BlurSpotlight hole={hole} padding={0} blurPx={5} dim={0.45} zIndex={1000} />
      <div className="tutorial-modal" role="dialog" aria-modal="true" aria-label={isSignup ? "Create Account" : "Sign In"}>
        <div className="tutorial-modal__dialog" ref={dialogRef}>
          <div className="tutorial-modal__titlebar">
            <span className="tutorial-modal__title">{isSignup ? "Create Account" : "Sign In"}</span>
            <button type="button" className="tutorial-modal__close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="tutorial-modal__body">
            <div className="login-modes" role="tablist" aria-label="Auth mode">
              <button
                type="button"
                role="tab"
                aria-selected={!isSignup}
                className={`login-mode${!isSignup ? " login-mode--active" : ""}`}
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignup}
                className={`login-mode${isSignup ? " login-mode--active" : ""}`}
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </div>

            <form id="login-window-form" className="login-card__body" onSubmit={handleSubmit} noValidate>
              <label className="login-field no-global-border">
                <span className="login-field__label no-global-border">Email</span>
                <input
                  type="email"
                  className="login-field__input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>

              <label className="login-field no-global-border">
                <span className="login-field__label no-global-border">Password</span>
                <input
                  type="password"
                  className="login-field__input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? "8+ chars, mixed case, a number" : "your password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  spellCheck={false}
                  disabled={busy}
                />
              </label>

              {/* Always rendered so the sign-in and sign-up cards stay the same
                  height. In sign-in mode the two extra fields are kept in the
                  layout but visually hidden (reserved white space), so the blur
                  spotlight frames a stable box even if the re-measure misfires. */}
              <div
                className={`login-extra-fields no-global-border${isSignup ? "" : " login-extra-fields--reserved"}`}
                aria-hidden={!isSignup}
              >
                <label className="login-field no-global-border">
                  <span className="login-field__label no-global-border">Platform</span>
                  <select
                    className="login-field__input login-field__select"
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value as Platform)}
                    disabled={busy || !isSignup}
                    tabIndex={isSignup ? undefined : -1}
                  >
                    <option value="chesscom">chess.com</option>
                    <option value="lichess">lichess</option>
                  </select>
                </label>

                <label className="login-field no-global-border">
                  <span className="login-field__label no-global-border">
                    {platform === "lichess" ? "lichess username" : "chess.com username"}
                  </span>
                  <input
                    type="text"
                    className="login-field__input"
                    value={platformUsername}
                    onChange={(event) => setPlatformUsername(event.target.value)}
                    placeholder="your handle"
                    autoComplete="username"
                    spellCheck={false}
                    disabled={busy || !isSignup}
                    tabIndex={isSignup ? undefined : -1}
                  />
                </label>
              </div>

              {error ? (
                <p className="login-error no-global-border" role="alert">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p className="login-notice no-global-border" role="status">
                  {notice}
                </p>
              ) : null}
            </form>
          </div>

          <div className="tutorial-modal__footer">
            <button type="submit" form="login-window-form" className="text-button" disabled={busy}>
              {busy ? "…" : isSignup ? "Create" : "Enter"}
            </button>
            {!isSignup ? (
              <a className="login-link" href="#">
                forgot password?
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

export default LoginWindow;
