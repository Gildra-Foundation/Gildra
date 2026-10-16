// Generated from app/(site)/games/[game]/page.tsx by npm run routes:mirror — edit the English page.
import { notFound } from "next/navigation";
import { GameComingSoon } from "@/components/platform/navigation/GameComingSoon";
import { gameComingSoonMetadata } from "@/components/platform/navigation/gameComingSoonMetadata";
import { gameDestinations, upcomingGame } from "@/lib/games/destinations";

export const dynamicParams = false;
export const generateStaticParams = () => gameDestinations.filter(game => game.soon).map(game => ({ game: game.id }));

type Props = { params: Promise<{ game: string }> };

export async function generateMetadata({ params }: Props) {
  const game = upcomingGame((await params).game);
  if (!game) notFound();
  return gameComingSoonMetadata(game, "ru");
}

export default async function Page({ params }: Props) {
  const game = upcomingGame((await params).game);
  if (!game) notFound();
  return <GameComingSoon game={game} lang="ru" />;
}
