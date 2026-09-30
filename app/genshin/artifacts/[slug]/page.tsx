import { renderGenshinEntityPage } from "@/lib/games/genshin/detail-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return renderGenshinEntityPage("artifact-sets", "en", (await params).slug); }
