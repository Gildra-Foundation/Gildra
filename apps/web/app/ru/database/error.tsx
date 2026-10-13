"use client";
import { DatabaseError } from "@/components/database/DatabaseError";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <DatabaseError error={error} reset={reset} lang="ru" />; }
