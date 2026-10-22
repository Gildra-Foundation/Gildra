/**
 * Origin-dependent security settings shared by `payload.config.ts` and the
 * staff auth cookie. The CMS origin comes from PAYLOAD_PUBLIC_URL, the same
 * value that is Payload's `serverURL`.
 */
const DEFAULT_ORIGIN = "http://localhost:3001";

/** Public origin of the CMS, without a trailing slash or path. */
export function cmsOrigin(): string {
  try {
    return new URL(process.env.PAYLOAD_PUBLIC_URL ?? DEFAULT_ORIGIN).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

/** Payload `csrf` allow-list: cookie-authenticated requests are accepted only from the CMS origin. */
export const csrfOrigins = (): string[] => [cmsOrigin()];

/**
 * Staff session cookie. `Secure` follows the public origin (https in production,
 * http on a local stand where a Secure cookie would never be sent back).
 */
export const staffCookies = () => ({
  secure: cmsOrigin().startsWith("https://"),
  sameSite: "Lax" as const,
});
