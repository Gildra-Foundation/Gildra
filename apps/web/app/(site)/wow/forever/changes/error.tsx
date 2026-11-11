"use client";
import { ClassesError } from '@/components/wow/forever/classes/ClassesError';
export default function Error({ reset }: { reset: () => void }) { return <ClassesError lang="en" reset={reset} />; }
