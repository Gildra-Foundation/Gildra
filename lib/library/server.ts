import "server-only";
import { getCatalogProducts, getLibraryDatasets } from "@/lib/api/client";

export async function getLibraryLandingData(locale: "en_US" | "ru_RU", product: string) {
  const [datasets, products] = await Promise.all([getLibraryDatasets(locale, product), getCatalogProducts()]);
  return { datasets, products };
}
