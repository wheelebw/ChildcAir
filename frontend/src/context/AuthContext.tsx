import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User
} from "firebase/auth";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";

type AuthContextValue = {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: Unsubscribe = () => undefined;
    let isMounted = true;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!isMounted) {
            return;
          }

          setCurrentUser(user);
          setLoading(false);
        });
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      loading,
      login: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      logout: async () => {
        await signOut(auth);
      }
    }),
    [currentUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
