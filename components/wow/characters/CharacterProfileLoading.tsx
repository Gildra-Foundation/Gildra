import { BookRouteLoading } from "@/components/motion/BookRouteLoading";

/** The shared book waits for the actual character request to resolve. */
export function CharacterProfileLoading({ locale }: { locale: "en" | "ru" }) {
  return <BookRouteLoading locale={locale} />;
}
