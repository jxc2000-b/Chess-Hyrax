import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export type UserPreferences = {
  consent: boolean;
  analytics: any[];
  preferences: any[];
  sessions: Date[];
  [key: string]: unknown;
};

type UserPreferencesContextValue = {
  userPreferences: UserPreferences;
  setUserPreferences: Dispatch<SetStateAction<UserPreferences>>;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  consent: false,
  analytics: [],
  preferences: [],
  sessions: [],
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

type UserPreferencesProviderProps = {
  value: UserPreferencesContextValue;
  children: ReactNode;
};

export function UserPreferencesProvider({
  value,
  children,
}: UserPreferencesProviderProps) {
  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const value = useContext(UserPreferencesContext);

  if (!value) {
    throw new Error('useUserPreferences must be used inside UserPreferencesProvider');
  }

  return value;
}
