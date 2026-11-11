import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { withPageOpenGraph } from "@/lib/seo/metadata";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

const path = "/wow/raids/sporefall/rotmire";
export const metadata: Metadata = withPageOpenGraph("en", {
  title: "Rotmire — Sporefall — WowArcana",
  description: "Rotmire, the boss of Sporefall: what to do before the pull, role tasks and abilities.",
  alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
});
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  permanentRedirect("/wow/raids/sporefall#boss=rotmire");
}
