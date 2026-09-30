import type { ReactNode } from "react";
import { SavedResultsBehavior } from "./SavedResultsBehavior";

type Props = {
  children: ReactNode;
  className: string;
  labelledBy: string;
};

export function SavedResults({ children, className, labelledBy }: Props) {
  return (
    <section className={className} aria-labelledby={labelledBy} data-saved-results>
      <SavedResultsBehavior />
      {children}
    </section>
  );
}
