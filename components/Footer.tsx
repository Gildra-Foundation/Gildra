import Image from "next/image";
import { p, t, type Lang } from "@/lib/i18n";
import { GAMES, gameHref, type GameSlug } from "@/lib/games/registry";

/** Site footer driven by the game registry: tagline, link columns, legal
 *  notice and optional data-source link come from `GAMES[game]`. */
export function Footer({ lang = "en", game = "wow" }: { lang?: Lang; game?: GameSlug }) {
  const tt = t(lang);
  const g = GAMES[game];
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
          <p>{tt(g.footer.tagline)}</p>
        </div>
        <div className="foot-cols">
          {g.footer.columns.map((col) => (
            <div className="fcol" key={col.title}>
              <h5>{tt(col.title)}</h5>
              {col.links.map((link) =>
                "path" in link ? (
                  <a key={link.label} href={gameHref(g, lang, link.path)}>
                    {tt(link.label)}
                  </a>
                ) : "external" in link ? (
                  <a key={link.label} href={link.external} rel="noopener">
                    {tt(link.label)}
                  </a>
                ) : (
                  <span key={link.label} className="dead-link" title={tt("Coming soon")}>
                    {tt(link.label)}
                  </span>
                ),
              )}
            </div>
          ))}
          <div className="fcol foot-prem" id="premium">
            <h5>{tt("Premium")}</h5>
            <p>{tt("Remove ads and support Gildra development.")}</p>
            <button className="btn-gold">{tt("Go Premium")}</button>
          </div>
        </div>
      </div>
      <div className="foot-legal">
        {tt(g.legal)}{" "}
        {g.footer.source && (
          <>
            <a href={g.footer.source.external} rel="noopener">
              {tt(g.footer.source.label)}
            </a>{" "}
          </>
        )}
        <a href={p(lang, "/privacy")}>{tt("Privacy Policy")}</a>
      </div>
    </footer>
  );
}
