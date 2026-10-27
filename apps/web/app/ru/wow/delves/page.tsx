// Generated from app/(site)/wow/delves/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { DelveCatalogPage } from "@/components/wow/delves/DelveCatalogPage";
import { delveCatalogCopy } from "@/components/wow/delves/delveCatalogCopy";
import { sectionMetadata } from "@/lib/routes/metadata";

const base = sectionMetadata("delves", "ru"), description = delveCatalogCopy["ru"].metaDescription;
export const metadata: Metadata = { ...base, description, openGraph: { ...base.openGraph, description } };
export default function Page() { return <DelveCatalogPage locale="ru" />; }
