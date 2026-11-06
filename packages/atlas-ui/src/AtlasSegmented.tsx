"use client";

import { SegmentedControl, type SegmentedControlProps } from "./valyro-ui/navigation/SegmentedControl";

/** One choice out of a few (filters, modes) on Valyro's SegmentedControl: a radio group with a sliding thumb. */
export function AtlasSegmented({ className, ...props }: SegmentedControlProps) {
  return <SegmentedControl {...props} className={className} />;
}
