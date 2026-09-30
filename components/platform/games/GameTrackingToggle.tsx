"use client";

import { useState } from "react";
import { Check, Radio } from "lucide-react";

export function GameTrackingToggle({ followedLabel, followLabel }: { followedLabel: string; followLabel: string }) {
  const [tracked, setTracked] = useState(true);
  return (
    <button type="button" role="switch" aria-checked={tracked} onClick={() => setTracked((value) => !value)}>
      {tracked ? <Check /> : <Radio />}
      <b>{tracked ? followedLabel : followLabel}</b>
    </button>
  );
}
