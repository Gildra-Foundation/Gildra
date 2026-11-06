// Generated from app/(site)/wow/mythic-plus/routes/[run]/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunPage } from "@/components/wow/mythicCommunity/RunPage";
import { loadMythicPlusRun } from "@/lib/games/wow/mythicPlusRun";
import { runMetadata } from "@/lib/games/wow/mythicPlusRunMetadata";
import { parseRunId } from "@/lib/games/wow/mythicPlusRunTypes";

type Props = { params: Promise<{ run: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseRunId((await params).run);
  return id ? runMetadata(id, "ru") : {};
}
export default async function Page({ params }: Props) {
  const id = parseRunId((await params).run);
  if (!id) notFound();
  const load = await loadMythicPlusRun(id);
  if (load.state === "missing") notFound();
  return <RunPage locale="ru" load={load} />;
}
