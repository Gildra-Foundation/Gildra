import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { NotFoundActions, NotFoundLede, NotFoundTitle } from "@/components/layout/NotFoundCopy";

export const metadata: Metadata = {
  title: "404 — Gildra",
  robots: { index: false, follow: true },
};

/** 404 of every route, on the atlas kit. Language comes from the URL (see NotFoundCopy). */
export default function NotFound() {
  return (
    <AtlasFrame footer={false} scene="lost">
      <AtlasHero
        eyebrow="404"
        title={<NotFoundTitle />}
        lede={<NotFoundLede />}
        actions={<NotFoundActions />}
      />
    </AtlasFrame>
  );
}
