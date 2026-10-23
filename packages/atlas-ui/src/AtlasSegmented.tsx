"use client";

import clsx from "clsx";
import { SegmentedControl, type SegmentedControlProps } from "./valyro-ui/navigation/SegmentedControl";
import bridge from "./valyroAtlasBridge.module.css";

/** One choice out of a few (filters, modes) on Valyro's SegmentedControl: a radio group with a sliding thumb. */
export function AtlasSegmented({ className, ...props }: SegmentedControlProps) {
  return <SegmentedControl {...props} className={clsx(bridge.scope, className)} />;
}
