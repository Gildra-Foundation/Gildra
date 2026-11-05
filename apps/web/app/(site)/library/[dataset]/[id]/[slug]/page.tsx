import { LibraryRecordRoute, libraryRecordMetadata, type LibraryRecordParams, type LibraryRecordSearch } from "@/components/library/LibraryRecordRoute";

type Props = { params: LibraryRecordParams; searchParams?: LibraryRecordSearch };

export const generateMetadata = ({ params, searchParams }: Props) => libraryRecordMetadata("en", params, searchParams);
export default function Page({ params, searchParams }: Props) {
  return <LibraryRecordRoute lang="en" params={params} searchParams={searchParams} />;
}
