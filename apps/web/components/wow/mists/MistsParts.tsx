import { Cross, Shield, Swords } from "lucide-react";
import type { MistsRole as Role } from "@/lib/wow/mists/types";
import styles from "./mists.module.css";

const roleIcons = { tank: Shield, healer: Cross, damage: Swords } as const;

export function MistsRole({ role, label }: { role: Role; label: string }) {
  const Icon = roleIcons[role];
  return <span className={styles.role} data-role={role}><Icon aria-hidden="true" />{label}</span>;
}
