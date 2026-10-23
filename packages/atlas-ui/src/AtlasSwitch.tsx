"use client";

import clsx from "clsx";
import { Switch, type SwitchProps } from "./valyro-ui/forms/Switch";
import bridge from "./valyroAtlasBridge.module.css";

/** On/off setting on Valyro's Switch: a native checkbox with role="switch", label and description. */
export function AtlasSwitch({ className, ...props }: SwitchProps) {
  return <Switch {...props} className={clsx(bridge.scope, className)} />;
}
