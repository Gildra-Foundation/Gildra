"use client";

import { useState } from "react";
import { AtlasSwitch } from "@gildra/atlas-ui/AtlasSwitch";

export function GameTrackingToggle({ followedLabel, followLabel }: { followedLabel: string; followLabel: string }) {
  const [tracked, setTracked] = useState(true);
  return <AtlasSwitch size="sm" checked={tracked} onCheckedChange={setTracked} label={tracked ? followedLabel : followLabel} />;
}
