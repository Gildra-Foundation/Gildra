import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { withPageOpenGraph } from "@/lib/seo/metadata";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

const path = "/ru/wow/raids/sporefall/rotmire";
export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Rotmire — Sporefall — WowArcana",
  description: "Гнилотоп, босс Споропада: что сделать перед пулом, задачи ролей и способности.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall/rotmire", ru: path, "x-default": "/wow/raids/sporefall/rotmire" } },
});
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  permanentRedirect("/ru/wow/raids/sporefall#boss=rotmire");
}
