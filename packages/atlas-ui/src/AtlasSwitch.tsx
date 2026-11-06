"use client";

import { Switch, type SwitchProps } from "./valyro-ui/forms/Switch";

/** On/off setting on Valyro's Switch: a native checkbox with role="switch", label and description. */
export function AtlasSwitch({ className, ...props }: SwitchProps) {
  return <Switch {...props} className={className} />;
}
