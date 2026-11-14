import { ProfessionsHome, professionMetadata } from '@/components/wow/forever/professions/ProfessionPages';
export const metadata = professionMetadata('ru');
export default function Page() { return <ProfessionsHome lang="ru" />; }
