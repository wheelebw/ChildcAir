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
import { ApiError, bootstrapMe, type AppContext } from "../services/api";

type AuthContextValue = {
  currentUser: User | null;
  appContext: AppContext | null;
  loading: boolean;
  appContextLoading: boolean;
  appContextError: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appContext, setAppContext] = useState<AppContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [appContextLoading, setAppContextLoading] = useState(false);
  const [appContextError, setAppContextError] = useState("");

  useEffect(() => {
    let unsubscribe: Unsubscribe = () => undefined;
    let isMounted = true;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) {
            return;
          }

          setCurrentUser(user);
          setLoading(false);

          if (!user) {
            setAppContext(null);
            setAppContextError("");
            setAppContextLoading(false);
            return;
          }

          setAppContextLoading(true);
          setAppContextError("");

          try {
            const token = await user.getIdToken();
            const context = await bootstrapMe(token);

            if (isMounted) {
              setAppContext(context);
            }
          } catch (error) {
            if (isMounted) {
              setAppContext(null);
              setAppContextError(
                error instanceof ApiError
                  ? error.message
                  : "Unable to load your ChildcAir context."
              );
            }
          } finally {
            if (isMounted) {
              setAppContextLoading(false);
            }
          }
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
      appContext,
      loading,
      appContextLoading,
      appContextError,
      login: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      logout: async () => {
        setAppContext(null);
        setAppContextError("");
        await signOut(auth);
      }
    }),
    [appContext, appContextError, appContextLoading, currentUser, loading]
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
