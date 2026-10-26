import Image from "next/image";
import manifest from "../../../public/assets/wow/raids/voidspire-page/manifest.json";
import { VoidEye } from "./VoidEye";
import styles from "./voidspirePageBackdrop.module.css";

/** One continuous environment painting, separate from the raid's playable maps. */
export function VoidspirePageBackdrop() {
  const scene = manifest.entries.sceneExtended;
  const [eyeX, eyeY] = scene.geometry.eye.normalized;
  return <div className={styles.backdrop} data-voidspire-page-art aria-hidden="true">
    <div className={styles.viewport}>
      <div className={styles.painting} data-voidspire-page-painting>
        <Image src={scene.path} alt="" fill sizes="100vw" quality={90} priority draggable={false} className={styles.image} />
        <VoidEye imageSize={[scene.width, scene.height]} focus={[0.5, 0]} eye={[eyeX, eyeY]} eyeRadius={scene.geometry.originalEyeRadiusScaled} />
      </div>
      <div className={styles.veil} />
    </div>
  </div>;
}
