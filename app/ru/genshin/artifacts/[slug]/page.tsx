// Hidden for the WoW-only MVP: renderGenshinEntityPage() answers 404 (see lib/mvp.ts).
import { renderGenshinEntityPage } from "@/lib/games/genshin/detail-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return renderGenshinEntityPage("artifact-sets", "ru", (await params).slug); }
