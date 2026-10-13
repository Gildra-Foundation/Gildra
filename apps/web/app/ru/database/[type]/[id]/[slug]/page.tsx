// Generated from app/(site)/database/[type]/[id]/[slug]/page.tsx by npm run routes:mirror — edit the English page.
import { EntityRoute, entityMetadata, type EntityRouteParams, type EntityRouteSearch } from "@/components/database/entityRoute";

type Props = { params: EntityRouteParams; searchParams?: EntityRouteSearch };

export const generateMetadata = ({ params }: Props) => entityMetadata(params, "ru");
export default function Page({ params, searchParams }: Props) {
  return <EntityRoute params={params} searchParams={searchParams} lang="ru" />;
}
