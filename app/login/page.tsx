import type { Metadata } from "next";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { LoginPage } from "@/components/auth/LoginPage";
import { preloadCharacterBookEntry } from "@/lib/wow/preloadCharacterBookEntry";

// The page depends on the visitor's Battle.net session and on runtime secrets.
// Without this it is prerendered during the image build (no AUTH_SECRET, no
// cookies) and that logged-out, "not configured" HTML is served to everyone.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in with Battle.net — Gildra", robots: { index: false, follow: false } };
export default async function Page() { preloadCharacterBookEntry(); const session = isBattleNetAuthConfigured ? await auth() : null; return <LoginPage locale="en" configured={isBattleNetAuthConfigured} isConnected={Boolean(session?.battleNetAccessToken)} accountName={session?.user?.name ?? undefined} />; }
