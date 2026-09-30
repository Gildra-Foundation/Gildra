import type { ReactNode } from "react";
import { RotationBackdropPreload } from "@/components/platform/rotation/RotationBackdropPreload";

export default function RotationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RotationBackdropPreload />
      {children}
    </>
  );
}
