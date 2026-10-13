// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { EntityRoute, entityMetadata, type EntityRouteParams, type EntityRouteSearch } from "@/components/database/entityRoute";

type Props = { params: EntityRouteParams; searchParams?: EntityRouteSearch };

export const generateMetadata = ({ params }: Props) => entityMetadata(params, "en");
export default function Page({ params, searchParams }: Props) {
  return <EntityRoute params={params} searchParams={searchParams} lang="en" />;
}
