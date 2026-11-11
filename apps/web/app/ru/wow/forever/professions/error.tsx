"use client";
import { GuidesError } from '@/components/wow/forever/professions/GuidesError';
export default function ErrorPage({reset}:{reset:()=>void}) {return <GuidesError lang="ru" reset={reset}/>;}
