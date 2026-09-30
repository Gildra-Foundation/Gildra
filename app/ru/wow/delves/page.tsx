import type { Metadata } from "next";
import { DelveCatalogPage } from "@/components/wow/delves/DelveCatalogPage";

export const metadata: Metadata = { title: "Вылазки Midnight — Gildra", robots: { index: false, follow: true } };
export default function Page() { return <DelveCatalogPage locale="ru" />; }
