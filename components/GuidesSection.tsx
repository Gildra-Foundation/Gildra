import { featuredGuide, guidesList } from "@/data/site";

/* Иллюстрации статей — собственная графика (не игровые иконки). */

function ArtFeatured() {
  return (
    <svg
      className="art"
      viewBox="0 0 560 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="560" height="280" fill="#170f07" />
      <circle cx="300" cy="120" r="200" fill="#4a2a10" opacity=".42" />
      <circle cx="300" cy="105" r="95" fill="#e0a050" opacity=".08" />
      <g fill="#ffd9a0" opacity=".5">
        <circle cx="120" cy="60" r="1.4" />
        <circle cx="450" cy="90" r="1.2" />
        <circle cx="500" cy="40" r="1.5" />
        <circle cx="80" cy="150" r="1.2" />
        <circle cx="410" cy="180" r="1.1" />
      </g>
      <g stroke="#e0a050" strokeWidth="2" fill="none" opacity=".85">
        <path d="M210 236 V130 a90 90 0 0 1 180 0 V236" />
        <path d="M246 236 V142 a54 54 0 0 1 108 0 V236" />
        <path d="M279 236 V160 a21 21 0 0 1 42 0 V236" />
      </g>
      <circle cx="300" cy="58" r="5.5" fill="#ffcf8a" />
    </svg>
  );
}

const THUMBS: Record<string, React.ReactNode> = {
  dk: (
    <svg viewBox="0 0 220 92" preserveAspectRatio="xMidYMid slice">
      <rect width="220" height="92" fill="#101a2e" />
      <circle cx="110" cy="46" r="60" fill="#1d3a66" opacity=".5" />
      <g stroke="#7db6e8" strokeWidth="2.2" fill="none" opacity=".85">
        <path d="M110 18 v56 M88 30 l44 32 M132 30 l-44 32 M84 46 h52" />
      </g>
    </svg>
  ),
  talents: (
    <svg viewBox="0 0 220 92" preserveAspectRatio="xMidYMid slice">
      <rect width="220" height="92" fill="#171204" />
      <circle cx="110" cy="46" r="56" fill="#4a3c12" opacity=".55" />
      <g stroke="#e6c667" strokeWidth="2" fill="none" opacity=".85">
        <path d="M110 12 l13 22 -13 44 -13 -44 z" />
        <path d="M82 58 l28 -10 28 10" />
      </g>
    </svg>
  ),
  arcane: (
    <svg viewBox="0 0 220 92" preserveAspectRatio="xMidYMid slice">
      <rect width="220" height="92" fill="#160b22" />
      <circle cx="110" cy="46" r="58" fill="#3a1a5e" opacity=".55" />
      <g stroke="#c085ec" strokeWidth="2" fill="none" opacity=".85">
        <circle cx="110" cy="46" r="26" />
        <circle cx="110" cy="46" r="16" />
        <path d="M110 12 v10 M110 70 v10 M84 46 h-10 M146 46 h-10" />
      </g>
      <circle cx="110" cy="46" r="5" fill="#e0c1f8" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 220 92" preserveAspectRatio="xMidYMid slice">
      <rect width="220" height="92" fill="#0d1b12" />
      <circle cx="110" cy="46" r="56" fill="#1d4527" opacity=".55" />
      <g stroke="#8fd49c" strokeWidth="2" fill="none" opacity=".85">
        <path d="M88 70 c0 -12 5 -17 10 -22 -7 -10 -5 -22 2 -29 0 10 4 13 10 16 6 -3 10 -6 10 -16 7 7 9 19 2 29 5 5 10 10 10 22" />
        <path d="M82 70 h56" />
      </g>
    </svg>
  ),
};

export function GuidesSection() {
  return (
    <>
      <div className="guides-head" id="guides">
        <span className="t">
          <svg className="i" style={{ width: 15, height: 15 }}>
            <use href="#ic-book" />
          </svg>{" "}
          LATEST GUIDES
        </span>
        <span className="dia">◆</span>
        <span className="rule" />
        <a className="view" href="#">
          View All Guides →
        </a>
      </div>
      <div className="news">
        <article className="nfeat">
          <ArtFeatured />
          <div className="nfeat-body">
            <span className="ncat">{featuredGuide.cat}</span>
            <div className="t">{featuredGuide.title}</div>
            <div className="nmeta">{featuredGuide.meta}</div>
          </div>
        </article>
        <div className="nlist">
          {guidesList.map((g) => (
            <div className="nrow" key={g.title}>
              <div className="nthumb">{THUMBS[g.art]}</div>
              <div>
                <div className="cap gold">{g.cat}</div>
                <div className="t">{g.title}</div>
                <div className="nmeta">{g.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
