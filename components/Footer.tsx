import Image from "next/image";
import { p, t, type Lang } from "@/lib/i18n";

export function Footer({ lang = "en" }: { lang?: Lang }) {
  const tt = t(lang);
  return (
    <footer className="foot">
      <div className="foot-in">
        <div className="foot-brand">
          <div className="logo">
            <Image
              className="logo-mark"
              src="/brand/helmet.png"
              alt=""
              width={30}
              height={30}
            />
            <span className="logo-text">GILDRA</span>
          </div>
          <p>
            {tt(
              "Gaming intelligence for Azeroth — live tier lists, meta statistics and guides.",
            )}
          </p>
        </div>
        <div className="foot-cols">
          <div className="fcol">
            <h5>{tt("Content")}</h5>
            <a href={p(lang, "/tier-lists")}>{tt("Tier Lists")}</a>
            <a href={p(lang, "/#meta")}>Mythic+</a>
            <a href={p(lang, "/#raid")}>{tt("Raid")}</a>
            <a href={p(lang, "/tier-lists#builds")}>{tt("Builds")}</a>
            <a href={p(lang, "/#guides")}>{tt("Guides")}</a>
          </div>
          <div className="fcol">
            <h5>{tt("Community")}</h5>
            <span className="dead-link" title={tt("Coming soon")}>Discord</span>
            <span className="dead-link" title={tt("Coming soon")}>{tt("Support Us")}</span>
            <span className="dead-link" title={tt("Coming soon")}>{tt("Contact")}</span>
          </div>
          <div className="fcol foot-prem" id="premium">
            <h5>{tt("Premium")}</h5>
            <p>{tt("Remove ads and support Gildra development.")}</p>
            <button className="btn-gold">{tt("Go Premium")}</button>
          </div>
        </div>
      </div>
      <div className="foot-legal">
        {tt(
          "World of Warcraft® and all related artwork are trademarks or registered trademarks of Blizzard Entertainment, Inc. Gildra is an unofficial fan-made concept and is not affiliated with or endorsed by Blizzard Entertainment.",
        )}{" "}
        <a href={p(lang, "/privacy")}>{tt("Privacy Policy")}</a>
      </div>
    </footer>
  );
}
