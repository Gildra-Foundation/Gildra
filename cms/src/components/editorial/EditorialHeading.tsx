import type { ReactNode } from "react";

/** A quiet Gildra masthead, shared by the desk and its editorial workbench. */
export function EditorialHeading({ eyebrow, title, description, actions }: {
  eyebrow: string; title: string; description: string; actions?: ReactNode;
}) {
  return <header className="gd-editorial-heading">
    <span className="gd-editorial-heading__seal" aria-hidden="true"><span>G</span></span>
    <div className="gd-editorial-heading__text">
      <p className="gd-editorial-eyebrow">{eyebrow}</p>
      <h1>{title}</h1><p className="gd-editorial-heading__description">{description}</p>
    </div>
    {actions ? <div className="gd-editorial-heading__actions">{actions}</div> : null}
  </header>;
}
