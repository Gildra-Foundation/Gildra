"use client";
import { GameDataError } from "@/components/platform/games/GameDataError";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <GameDataError game="Genshin Impact" lang="en" reset={reset} />; }
