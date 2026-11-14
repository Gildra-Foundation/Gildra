import { ProfessionsHome, professionMetadata } from '@/components/wow/forever/professions/ProfessionPages';
export const metadata = professionMetadata('en');
export default function Page() { return <ProfessionsHome lang="en" />; }
