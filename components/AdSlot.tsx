import Image from "next/image";
import Link from "next/link";
import { p, t, type Lang } from "@/lib/i18n";

/** Зарезервированное рекламное место. Фиксированная минимальная высота —
 *  подключение реальной сети не сдвинет вёрстку (без CLS). Пока сеть не
 *  подключена, слот занят house-ad: честной саморекламой Gildra Premium. */
export function AdSlot({
  variant = "billboard",
  lang = "en",
}: {
  variant?: "billboard" | "rect";
  lang?: Lang;
}) {
  const tt = t(lang);
  return (
    <aside
      className={`pslot ${variant === "rect" ? "pslot-tall" : "pslot-wide"}`}
      aria-label="Advertisement"
    >
      <span className="pslot-cap">Ad</span>
      <Link className="pslot-promo" href={p(lang, "/#premium")}>
        <Image
          className="pp-helm"
          src="/brand/helmet.png"
          alt=""
          width={variant === "rect" ? 64 : 46}
          height={variant === "rect" ? 64 : 46}
        />
        <span className="pp-tx">
          <b>
            Gildra <em>Premium</em>
          </b>
          <span>{tt("Ad-free experience · support development")}</span>
        </span>
        <span className="btn-gold pp-cta">{tt("Go Premium")}</span>
      </Link>
    </aside>
  );
}
