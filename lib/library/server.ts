import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCatalogProducts, getLibraryDatasets } from "@/lib/api/client";

/**
 * Catalog reads are private in the current owner-approved deployment. Keep the
 * authorization decision at the page boundary so a missing session becomes a
 * login redirect instead of an opaque server-side 500 from the internal API.
 */
export async function catalogSessionPresent() {
  return Boolean((await cookies()).get("gildra_admin_session")?.value);
}

export async function requireCatalogSession(path: string) {
  if ((process.env.CATALOG_ACCESS_MODE ?? "private").toLowerCase() === "public") return;
  if (await catalogSessionPresent()) return;
  const next = path.startsWith("/") ? path : "/library";
  redirect(`/api-console?next=${encodeURIComponent(next)}`);
}

export async function getLibraryLandingData(locale: "en_US" | "ru_RU", product: string) {
  const [datasets, products] = await Promise.all([getLibraryDatasets(locale, product), getCatalogProducts()]);
  return { datasets, products };
}
