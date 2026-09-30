import NextAuth from "next-auth";
import BattleNet from "next-auth/providers/battlenet";

const issuers = {
  eu: "https://eu.battle.net/oauth",
  us: "https://us.battle.net/oauth",
  kr: "https://kr.battle.net/oauth",
  tw: "https://tw.battle.net/oauth",
  cn: "https://www.battlenet.com.cn/oauth",
} as const;
const configuredRegion = (process.env.BATTLENET_REGION ?? "eu").toLowerCase();
const issuer = issuers[configuredRegion as keyof typeof issuers] ?? issuers.eu;
export const isBattleNetAuthConfigured = Boolean(
  process.env.AUTH_SECRET && process.env.BATTLENET_CLIENT_ID && process.env.BATTLENET_CLIENT_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    BattleNet({
      clientId: process.env.BATTLENET_CLIENT_ID,
      clientSecret: process.env.BATTLENET_CLIENT_SECRET,
      issuer,
      authorization: { params: { scope: "openid wow.profile" } },
      // Battle.net rejects authorization requests without an explicit state
      // parameter. Auth.js validates the matching encrypted state cookie on
      // callback, while PKCE protects the authorization code itself.
      checks: ["pkce", "state", "nonce"],
    }),
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === "battlenet") {
        token.battleNetAccessToken = account.access_token;
        token.battleNetExpiresAt = typeof account.expires_at === "number" ? account.expires_at : undefined;
      }
      if (typeof token.battleNetExpiresAt === "number" && Date.now() >= token.battleNetExpiresAt * 1000) {
        token.battleNetAccessToken = undefined;
        token.battleNetError = "AccessTokenExpired";
      }
      return token;
    },
    session({ session, token }) {
      // This value is consumed only by server components. No client component
      // in Gildra requests or serializes the Auth.js session.
      session.battleNetAccessToken = typeof token.battleNetAccessToken === "string" ? token.battleNetAccessToken : undefined;
      session.battleNetError = token.battleNetError === "AccessTokenExpired" ? token.battleNetError : undefined;
      return session;
    },
  },
  trustHost: true,
});
