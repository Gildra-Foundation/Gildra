/** A quiet, uneven pen rhythm; pauses belong between thoughts, after closing quotes. */
export const inkDuration = 180;

export function epigraphTiming(text: string, start = 0) {
  const delays: number[] = [];
  let at = start;
  let pause = 0;
  let dots = 0;
  for (const [index, letter] of Array.from(text).entries()) {
    const punctuation = /[,.;:!?…—–]/u.test(letter);
    const ending = /[\s»”’"')\]]/u.test(letter);
    if (!punctuation && !ending) {
      at += pause;
      pause = 0;
    }
    delays.push(at);
    // Deterministic small variations avoid a mechanical typewriter cadence.
    at += Math.round((/\s/u.test(letter) ? 65 : 42 + ((letter.codePointAt(0)! + index * 7) % 5) * 7) * 1.2);
    dots = letter === "." ? dots + 1 : 0;
    const breath = letter === "," ? 420
      : letter === ";" || letter === ":" ? 650
      : letter === "—" || letter === "–" ? 500
      : letter === "…" || dots > 1 ? 2200
      : letter === "!" || letter === "?" ? 1800
      : letter === "." ? 1600 : 0;
    pause = Math.max(pause, breath);
  }
  return { delays, finish: (delays.at(-1) ?? start) + inkDuration, pauseAfter: pause };
}
