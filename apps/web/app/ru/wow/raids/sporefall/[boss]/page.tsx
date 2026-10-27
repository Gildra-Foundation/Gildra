import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

const path = "/ru/wow/raids/sporefall/rotmire";
export const metadata: Metadata = {
  title: "Rotmire — Sporefall — Gildra",
  description: "Гнилотоп, босс Споропада: что сделать перед пуллом, задачи ролей и способности.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall/rotmire", ru: path, "x-default": "/wow/raids/sporefall/rotmire" } },
  robots: { index: false, follow: true },
};
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  return <SporefallPage locale="ru" view="boss" />;
}
