// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { DelveCatalogPage } from "@/components/wow/delves/DelveCatalogPage";
import { delveCatalogCopy } from "@/components/wow/delves/delveCatalogCopy";
import { sectionMetadata } from "@/lib/routes/metadata";

const base = sectionMetadata("delves", "en"), description = delveCatalogCopy["en"].metaDescription;
export const metadata: Metadata = { ...base, description, openGraph: { ...base.openGraph, description } };
export default function Page() { return <DelveCatalogPage locale="en" />; }
