"use client";
import { GameDataError } from "@/components/platform/games/GameDataError";
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <GameDataError game="League of Legends" lang="en" reset={reset} />; }
