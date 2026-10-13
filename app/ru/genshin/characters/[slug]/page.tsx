// Generated from app/(site)/genshin/characters/[slug]/page.tsx by npm run routes:mirror — edit the English page.
// Hidden for the WoW-only MVP: renderGenshinEntityPage() answers 404 (see lib/mvp.ts).
import { renderGenshinEntityPage } from "@/lib/games/genshin/detail-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return renderGenshinEntityPage("characters", "ru", (await params).slug); }
