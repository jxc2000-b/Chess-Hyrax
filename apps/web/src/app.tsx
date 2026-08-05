import { useState } from "react";
import "./app.css";
import { SESSION_DATA } from "./data/sessionData.js";
import { DEFAULT_GAMEMODE, type SessionData } from "./types.js";
import SessionShell from "./sessionShell.js";
import TestSessionPage from "./test-bed.js";
import ImportantPieceDemoPage from "./demos/importantPieceDemoPage.js";
import SquareControlDemoPage from "./demos/squareControlDemoPage.js";
import WeakPieceDemoPage from "./demos/weakPieceDemoPage.js";
import PickaxeAnimationDemoPage from "./demos/pickaxeAnimationDemoPage.js";
import RuleOfTheSquareDemoPage from "./demos/ruleofthesquaredemopage.js";
import KingSafetyZoneDemoPage from "./demos/kingSafetyZoneDemoPage.js";
import OppositionDemoPage from "./demos/oppositionDemoPage.js";
import HangingPiecesDemoPage from "./demos/hangingPiecesDemoPage.js";
import XRayPinDemoPage from "./demos/xrayPinDemoPage.js";
import { ConstantsPage, PrivacyPolicyPage, TermsOfService } from "./pages";
import { DEFAULT_USER_PREFERENCES, UserPreferencesProvider, type UserPreferences } from "./userPreferencesContext.js";
import { AuthProvider } from "./auth/AuthContext.js";
import { TutorialProvider } from "./tutorial/TutorialProvider.js";

export const SESSION_ENABLED = true;

function getInitialSessionData(): SessionData | null {
  if (!SESSION_ENABLED) {
    return null;
  }

  return {
    ...(structuredClone(SESSION_DATA) as SessionData),
    gamemode: DEFAULT_GAMEMODE,
  };
}

function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const isPrivacyPage = window.location.pathname === "/privacy";
  const isConstantsPage = window.location.pathname === "/constants";
  const isTermsPage = window.location.pathname === "/terms";

  return (
    <UserPreferencesProvider value={{ userPreferences, setUserPreferences }}>
      <AuthProvider>
        <TutorialProvider>
          {/* <TestSessionPage /> */}
          {/* <ImportantPieceDemoPage /> */}
          {/* <SquareControlDemoPage /> */}
          {/* <WeakPieceDemoPage /> */}
          {/* <RuleOfTheSquareDemoPage /> */}
          {/* <KingSafetyZoneDemoPage /> */}
          {/* <OppositionDemoPage /> */}
          {/* <HangingPiecesDemoPage /> */}
          {/* <XRayPinDemoPage /> */}
          {isConstantsPage ? (
            <ConstantsPage />
          ) : isTermsPage ? (
            <TermsOfService />
          ) : isPrivacyPage ? (
            <PrivacyPolicyPage />
          ) : (
            <SessionShell sessionData={sessionData} onSessionDataChange={setSessionData} />
          )}
        </TutorialProvider>
      </AuthProvider>
    </UserPreferencesProvider>
  );
}


export default App;
