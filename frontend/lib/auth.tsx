"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { createClient } from "@supabase/supabase-js";
import type { Session, User, SupabaseClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AuthContextType {
  supabase:         SupabaseClient;
  session:          Session | null;
  user:             User | null;
  loading:          boolean;
  avatarUrl:        string | null;
  displayName:      string | null;
  signIn:           (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp:           (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  resetPassword:    (email: string) => Promise<{ error: Error | null }>;
  signOut:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getUserMeta(user: User | null) {
  if (!user) return { avatarUrl: null, displayName: null };
  const meta      = user.user_metadata || {};
  const avatarUrl = meta.avatar_url || meta.picture || null;
  const displayName =
    meta.full_name || meta.name ||
    (user.email ? user.email.split("@")[0] : null);
  return { avatarUrl, displayName };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,     setSession]     = useState<Session | null>(null);
  const [user,        setUser]        = useState<User | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  function applyUser(u: User | null) {
    setUser(u);
    const meta = getUserMeta(u);
    setAvatarUrl(meta.avatarUrl);
    setDisplayName(meta.displayName);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      applyUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        applyUser(session?.user ?? null);
      }
    );
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    return { error: error as Error | null };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        supabase, session, user, loading,
        avatarUrl, displayName,
        signIn, signUp, signInWithGoogle, resetPassword, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}