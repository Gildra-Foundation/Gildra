import React from "react";

/** Mark of the network admin: a faceted gem, amber (Gildra) over teal (Riftden). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 2 29 13 16 30 3 13Z" fill="#d9a441" />
      <path d="M16 2 29 13H3Z" fill="#f0c56a" />
      <path d="M16 30 29 13 16 17Z" fill="#2fa7c4" />
      <path d="M16 30 3 13 16 17Z" fill="#b9822c" />
    </svg>
  );
}

/** Navigation icon (top left of every admin screen). */
export function BrandIcon() {
  return <Mark size={26} />;
}

/** Login screen logo. */
export function BrandLogo() {
  return (
    <span className="gd-logo">
      <Mark size={44} />
      <span>
        <strong>Gildra Network</strong>
        <small>gildra.net · riftden.com</small>
      </span>
    </span>
  );
}
