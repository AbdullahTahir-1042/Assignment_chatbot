import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tokenStore } from "../../lib/http";
import type { AuthUser } from "./auth.types";

/**
 * Auth state only. Everything else that comes from the server lives in
 * TanStack Query, so this store never holds a second copy of it that could go
 * stale.
 *
 * localStorage persistence is a deliberate tradeoff, and the README says so:
 * the token survives a refresh, which matters for a demo, but it is readable
 * by any script on the page. That is acceptable here because the app never
 * renders server text as HTML, and the token itself carries no secrets the
 * user would not have to re-fetch anyway. In-memory storage would be the
 * stronger choice at the cost of a refresh logging you out.
 */
type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        tokenStore.set(token);
        set({ token, user });
      },
      setUser: (user) => set({ user }),
      clear: () => {
        // Both the zustand copy and the raw key, so a rehydration cannot
        // resurrect a token the user just signed out of.
        tokenStore.clear();
        set({ token: null, user: null });
      },
    }),
    {
      name: "assessment.auth",
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        // Keep the raw key the http wrapper reads in step with the store.
        if (state?.token) tokenStore.set(state.token);
      },
    },
  ),
);

/** A token is present. Not the same as being valid -- useCurrentUser proves that. */
export const selectIsAuthenticated = (s: AuthState): boolean => Boolean(s.token);
