import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import styles from "./characterUpgrades.module.css";

/** Holds the Upgrades tab's place while its code loads, so the tab does not jump open. */
export function CharacterUpgradesSkeleton({ plaqueClassName }: { plaqueClassName?: string }) {
  return <MaterialPlaque kit={CHARACTERS_KIT} className={plaqueClassName} aria-hidden="true">
    <div className={styles.skeleton}>
      <i className={styles.skeletonTitle} />
      {[0, 1, 2, 3, 4, 5].map((index) => <span key={index}><i /><b /></span>)}
    </div>
  </MaterialPlaque>;
}
