import { NotFoundPage, notFoundMetadata } from "@/components/layout/NotFoundPage";

export const metadata = notFoundMetadata;

export default function NotFound() {
  return <NotFoundPage locale="en" />;
}
