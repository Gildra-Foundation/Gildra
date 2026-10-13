import { Fragment, type CSSProperties } from "react";
import styles from "./grimoireHome.module.css";

export function inkWords(text: string, start: number, step: number, cues?: { start: number; end: number }[]) {
  let index = 0;
  let cueIndex = 0;
  return text.split(/(\s+)/).map((word, wordIndex) => {
    if (/^\s+$/.test(word)) {
      index += Array.from(word).length;
      return <Fragment key={wordIndex}>{word}</Fragment>;
    }
    const letters = Array.from(word);
    const cue = cues?.[cueIndex++];
    const duration = cue ? cue.end - cue.start : 180;
    const inkDuration = cue ? (letters.length === 1 ? duration : Math.min(180, duration / letters.length * 1.6)) : 180;
    const letterStep = cue ? (duration - inkDuration) / Math.max(1, letters.length - 1) : step;
    return <span className={styles.inkWord} key={wordIndex}>
      {letters.map((letter, letterIndex) => {
        const delay = cue ? cue.start + letterIndex * letterStep : start + index * step;
        index++;
        return <span className={styles.inkLetter} key={letterIndex} style={{ "--ink-delay": `${delay}ms`, "--ink-duration": `${inkDuration}ms` } as CSSProperties}>{letter}</span>;
      })}
    </span>;
  });
}
