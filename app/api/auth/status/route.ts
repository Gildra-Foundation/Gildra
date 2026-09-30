import { auth, isBattleNetAuthConfigured } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = isBattleNetAuthConfigured ? await auth() : null;
  const connected = Boolean(session?.battleNetAccessToken);
  return Response.json(
    { connected, accountName: connected ? session?.user?.name ?? null : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
