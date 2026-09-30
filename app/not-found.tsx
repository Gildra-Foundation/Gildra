import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";

export const metadata: Metadata = {
  title: "404 — Gildra",
};

export default function NotFound() {
  return (
    <PageShell layout="bare">
      <NotFoundContent />
    </PageShell>
  );
}
