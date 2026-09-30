import type { RotationAbilityVisual } from "./rotationVisualTheme";

export function RotationAbilitySigil({ visual, className }: { visual: RotationAbilityVisual; className: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="20" />
      <circle cx="24" cy="24" r="15" />
      <path d={visual.glyph} />
    </svg>
  );
}
