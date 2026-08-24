/** SVG-спрайт UI-иконок (свои, stroke 1.5). Игровые сущности — только настоящие ассеты. */
export function Icons() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="ic-search" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.6" />
        <path d="M10.6 10.6 14 14" />
      </symbol>
      <symbol id="ic-sword" viewBox="0 0 16 16">
        <path d="M13.5 2.5 6.8 9.2" />
        <path d="m5 8 3 3-1.6 1.6-3-3z" />
        <path d="M3.2 12.8 2 14" />
        <path d="M13.5 2.5c-1.6 0-3.2.5-4.4 1.4" />
      </symbol>
      <symbol id="ic-shield" viewBox="0 0 16 16">
        <path d="M8 1.8 13 3.6v4.2c0 3-2 5.1-5 6.4-3-1.3-5-3.4-5-6.4V3.6z" />
      </symbol>
      <symbol id="ic-share" viewBox="0 0 16 16">
        <path d="M8 9.5V2.5" />
        <path d="M5.5 4.5 8 2l2.5 2.5" />
        <path d="M3 8v5.5h10V8" />
      </symbol>
      <symbol id="ic-star" viewBox="0 0 16 16">
        <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
      </symbol>
      <symbol id="ic-book" viewBox="0 0 16 16">
        <path d="M8 3.6C7 2.8 5.6 2.5 3.9 2.5H2.5v10h1.4c1.7 0 3.1.3 4.1 1.1 1-.8 2.4-1.1 4.1-1.1h1.4v-10h-1.4C10.4 2.5 9 2.8 8 3.6z" />
        <path d="M8 3.6v10" />
      </symbol>
      <symbol id="ic-info" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7.4v3.2" />
        <path d="M8 5.2v.1" />
      </symbol>
      <symbol id="ic-database" viewBox="0 0 16 16">
        <ellipse cx="8" cy="3.4" rx="5.2" ry="2" />
        <path d="M2.8 3.4v4.5c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2V3.4" />
        <path d="M2.8 7.9v4.5c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2V7.9" />
      </symbol>
      <symbol id="ic-bag" viewBox="0 0 16 16">
        <path d="M3.2 5.5h9.6l-.7 8H3.9z" />
        <path d="M5.8 5.5V4a2.2 2.2 0 0 1 4.4 0v1.5" />
      </symbol>
      <symbol id="ic-spark" viewBox="0 0 16 16">
        <path d="m8 1.6 1.2 4.1L13.4 7 9.2 8.3 8 12.4 6.8 8.3 2.6 7l4.2-1.3z" />
        <path d="m12.5 11 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
      </symbol>
      <symbol id="ic-scroll" viewBox="0 0 16 16">
        <path d="M4.5 2.2h7v9.7a2 2 0 0 1-2 2h-6" />
        <path d="M4.5 2.2a2 2 0 0 0 0 4h5" />
        <path d="M3.5 9.8a2 2 0 1 0 0 4h6" />
      </symbol>
      <symbol id="ic-skull" viewBox="0 0 16 16">
        <path d="M3.2 7a4.8 4.8 0 1 1 9.6 0c0 2-1 3.2-2.2 4v2.5H5.4V11C4.2 10.2 3.2 9 3.2 7z" />
        <circle cx="6.2" cy="7" r=".8" />
        <circle cx="9.8" cy="7" r=".8" />
        <path d="M8 8.7v1" />
      </symbol>
      <symbol id="ic-map" viewBox="0 0 16 16">
        <path d="m2.3 3.8 3.8-1.6 3.8 1.6 3.8-1.6v10l-3.8 1.6-3.8-1.6-3.8 1.6z" />
        <path d="M6.1 2.2v10M9.9 3.8v10" />
      </symbol>
      <symbol id="ic-hammer" viewBox="0 0 16 16">
        <path d="m9.3 2.2 4.5 4.5-2.2 2.2-4.5-4.5z" />
        <path d="m8.1 6.6-5.7 5.7 1.3 1.3 5.7-5.7" />
      </symbol>
      <symbol id="ic-gem" viewBox="0 0 16 16">
        <path d="m4.2 2.5-2.4 4L8 13.8l6.2-7.3-2.4-4z" />
        <path d="M1.8 6.5h12.4M4.2 2.5l1.5 4L8 13.8l2.3-7.3 1.5-4" />
      </symbol>
      <symbol id="ic-chev" viewBox="0 0 16 16">
        <path d="m4 6.5 4 4 4-4" />
      </symbol>
      <symbol id="gm-wow" viewBox="0 0 16 16">
        <path d="M3 3l10 10" />
        <path d="M13 3 3 13" />
        <path d="M2 6V2h4" />
        <path d="M14 10v4h-4" />
      </symbol>
      <symbol id="gm-d4" viewBox="0 0 16 16">
        <path d="M8 2c2 3 4 4.3 4 7a4 4 0 0 1-8 0c0-2.7 2-4 4-7z" />
      </symbol>
      <symbol id="gm-hs" viewBox="0 0 16 16">
        <rect x="4.2" y="2.5" width="7.6" height="11" rx="2" />
        <circle cx="8" cy="8" r="1.6" />
      </symbol>
      <symbol id="gm-ow" viewBox="0 0 16 16">
        <path d="M12.6 5.2a5.5 5.5 0 0 0-9.2 0" />
        <path d="M3.4 10.8a5.5 5.5 0 0 0 9.2 0" />
      </symbol>
    </svg>
  );
}
