"use client";

import { Select, type SelectProps } from "./valyro-ui/forms/Select";

/** Controlled Valyro selector for app preferences; native AtlasSelect stays for GET forms. */
export function AtlasValyroSelect({ className, ...props }: SelectProps) {
  return <Select {...props} className={className} />;
}
