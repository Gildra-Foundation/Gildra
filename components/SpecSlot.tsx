import Image from "next/image";
import { specIcon } from "@/lib/gameAssets";

export function SpecSlot({
  name,
  cls,
  size,
  classSlug,
  specSlug,
}: {
  name: string;
  cls: string;
  size?: "sm" | "lg";
  classSlug?: string;
  specSlug?: string;
}) {
  const src = specIcon(name, classSlug, specSlug);
  return (
    <div className={["spec", size, cls].filter(Boolean).join(" ")} title={name}>
      <b>{src && <Image src={src} alt={name} width={56} height={56} />}</b>
    </div>
  );
}
