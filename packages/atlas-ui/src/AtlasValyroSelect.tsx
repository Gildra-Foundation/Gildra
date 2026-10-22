"use client";

import clsx from "clsx";
import { Select, type SelectProps } from "./valyro-ui/forms/Select";
import bridge from "./valyroAtlasBridge.module.css";

/** Controlled Valyro selector for app preferences; native AtlasSelect stays for GET forms. */
export function AtlasValyroSelect({ className, ...props }: SelectProps) {
  return <Select {...props} className={clsx(bridge.scope, className)} />;
}
