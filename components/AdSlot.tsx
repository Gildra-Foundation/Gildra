import Image from "next/image";
import Link from "next/link";

/** Зарезервированное рекламное место. Фиксированная минимальная высота —
 *  подключение реальной сети не сдвинет вёрстку (без CLS). Пока сеть не
 *  подключена, слот занят house-ad: честной саморекламой Gildra Premium. */
export function AdSlot({
  variant = "billboard",
}: {
  variant?: "billboard" | "rect";
}) {
  return (
    <aside className={`adslot ad-${variant}`} aria-label="Advertisement">
      <span className="ad-cap">Ad</span>
      <Link className="ad-house" href="/#premium">
        <Image
          className="ah-helm"
          src="/brand/helmet.png"
          alt=""
          width={variant === "rect" ? 64 : 46}
          height={variant === "rect" ? 64 : 46}
        />
        <span className="ah-tx">
          <b>
            Gildra <em>Premium</em>
          </b>
          <span>Ad-free experience · support development</span>
        </span>
        <span className="btn-gold ah-cta">Go Premium</span>
      </Link>
    </aside>
  );
}
