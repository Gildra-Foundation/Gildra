"use client";

import { createContext, useContext } from "react";
import type { Session } from "next-auth";

const AuthSessionContext = createContext<Session | null>(null);

export function AuthProvider({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}
