import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    battleNetAccessToken?: string;
    battleNetError?: "AccessTokenExpired";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    battleNetAccessToken?: string;
    battleNetExpiresAt?: number;
    battleNetError?: "AccessTokenExpired";
  }
}
