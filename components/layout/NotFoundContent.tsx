"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NotFoundContent() {
  const ru = usePathname().startsWith("/ru");
  const prefix = ru ? "/ru" : "";

  return <main className="nf">
    <Image className="nf-helm" src="/brand/helmet.png" alt="" width={132} height={132} priority />
    <div className="nf-code">404</div>
    <p className="nf-kicker">{ru ? "ПУТЬ ЗАТЕРЯН В ТУМАНЕ" : "THE PATH IS LOST IN THE MISTS"}</p>
    <h1 className="nf-title">{ru ? "Эта страница пала в бою" : "This page fell in battle"}</h1>
    <p className="nf-sub">{ru
      ? "Похоже, маршрут был перенесён или больше не существует. Вернитесь в командный центр — там все актуальные пути Азерота."
      : "This route was moved or no longer exists. Return to the command center for every active path through Azeroth."}</p>
    <div className="nf-actions">
      <Link className="btn btn-primary" href={prefix || "/"}>{ru ? "В командный центр" : "Back to command center"}</Link>
      <Link className="btn-line" href={`${prefix}/wow/mythic-plus`}>{ru ? "Открыть Mythic+ →" : "Open Mythic+ →"}</Link>
    </div>
  </main>;
}
