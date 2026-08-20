import Link from "next/link";

/** Зарезервированное рекламное место. Фиксированная минимальная высота —
 *  подключение реальной сети не сдвинет вёрстку (без CLS). Пока сеть не
 *  подключена, слот честно маркирован как Advertisement и ведёт на Premium. */
export function AdSlot({
  variant = "billboard",
}: {
  variant?: "billboard" | "rect";
}) {
  return (
    <aside className={`adslot ad-${variant}`} aria-label="Advertisement">
      <span className="ad-cap">Ad</span>
      <span className="ad-ph">Advertisement</span>
      <Link className="ad-remove" href="/#premium">
        Remove ads →
      </Link>
    </aside>
  );
}
