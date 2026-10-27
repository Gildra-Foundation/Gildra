import { LibraryRecordRoute, libraryRecordMetadata, type LibraryRecordParams, type LibraryRecordSearch } from "@/components/library/LibraryRecordRoute";

type Props = { params: LibraryRecordParams; searchParams?: LibraryRecordSearch };

export const generateMetadata = ({ params, searchParams }: Props) => libraryRecordMetadata("ru", params, searchParams);
export default function Page({ params, searchParams }: Props) {
  return <LibraryRecordRoute lang="ru" params={params} searchParams={searchParams} />;
}
