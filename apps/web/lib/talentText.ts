// Text clean-up for talent descriptions that reach the page with game template leftovers.

const word = "[\\p{L}-]+";
// "3 дополнительных удара:дополнительных ударов глефой": the number, its words, then the other plural form glued by a colon.
const pluralPair = new RegExp(`(\\d+(?:[.,]\\d+)?)(\\s+)((?:${word}\\s+){0,2}${word}):((?:${word}\\s+){0,3}${word})`, "gu");
// "4 следующие атаки, действующие на одну цель, поражают:следующих атак, действующих на одну цель, поражают":
// a longer phrase with commas; the other form has as many words.
const pluralPhrase = /(\d+(?:[.,]\d+)?)(\s+)([\p{L}][\p{L}\s,-]{2,90}?):([\p{L}][\p{L}\s,-]{2,120})/gu;

const useFewForm = (amount: string) => {
  const value = Number(amount.replace(",", "."));
  const lastTwo = Math.floor(value) % 100;
  const last = Math.floor(value) % 10;
  return Number.isInteger(value) && last >= 1 && last <= 4 && !(lastTwo >= 11 && lastTwo <= 14);
};

/** Picks the Russian plural form a number needs when a description still carries "few:many" forms. */
export function resolvePluralForms(text: string) {
  return text
    .replace(pluralPhrase, (match, amount: string, space: string, few: string, rest: string) => {
      const fewWords = few.trim().split(/\s+/);
      const restWords = rest.split(/\s+/).filter(Boolean);
      // Only a phrase of several words with commas; short pairs go to the narrower rule below.
      if (!few.includes(",") || restWords.length < fewWords.length) return match;
      const many = restWords.slice(0, fewWords.length).join(" ");
      const tail = restWords.slice(fewWords.length).join(" ");
      const trailing = /\s*$/.exec(rest)?.[0] ?? "";
      return `${amount}${space}${useFewForm(amount) ? few.trim() : many}${tail ? ` ${tail}` : ""}${trailing}`;
    })
    .replace(pluralPair, (_match, amount: string, space: string, few: string, rest: string) => {
      const size = few.split(/\s+/).length;
      const after = rest.split(/\s+/);
      const many = after.slice(0, size).join(" ");
      const tail = after.slice(size).join(" ");
      return `${amount}${space}${useFewForm(amount) ? few : many}${tail ? ` ${tail}` : ""}`;
    });
}

/* ---------- Game tooltip templates (Russian) ---------- */

/** The specialization a description is shown for: picks its variant and its "[Spec: …]" clauses. */
export type TalentTextSpec = { specName: string; classSpecNames: string[] };

type Unit = "" | "ap" | "sp" | "wd" | "hp";
type Value = { k: number; unit: Unit };

const unitWords: Record<Exclude<Unit, "">, string> = {
  ap: "силы атаки", sp: "силы заклинаний", wd: "урона оружия", hp: "запаса здоровья",
};
const ofUnits: Record<string, Unit> = { "attack power": "ap", "spell power": "sp", "weapon damage": "wd" };
/** Stat names the game leaves inside formulas; health and power are in percent of the stat. */
const variables: Array<[RegExp, Value]> = [
  [/^Всего очков здоровья/, { k: 100, unit: "hp" }],
  [/^Сила атаки/, { k: 100, unit: "ap" }],
  [/^Сила заклинаний/, { k: 100, unit: "sp" }],
  // Versatility scales the value on the character sheet; the base value is shown.
  [/^Универсальность/, { k: 0, unit: "" }],
];

/** Marker of an evaluated value inside the text: \u0001<index>\u0002. */
const marker = (index: number) => `\u0001${index}\u0002`;
const markerPattern = /\u0001(\d+)\u0002/g;

function formatNumber(value: number) {
  const size = Math.abs(value);
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

function renderValue(value: Value) {
  return value.unit ? `${formatNumber(value.k)}% ${unitWords[value.unit]}` : formatNumber(value.k);
}

/** Evaluates "(3 * (A)% + (B)%) * 195 / 100" over numbers and stat values; null when the expression is not linear. */
function evaluate(source: string, values: Value[]): Value | null {
  const tokens = source.match(/\u0001\d+\u0002|\d+(?:\.\d+)?|[()+\-*/%]|[\p{L}][\p{L} ]*[\p{L}]|\S/gu) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const fail = (): never => { throw new Error("formula"); };
  const primary = (): Value => {
    const token = tokens[position++];
    if (token === undefined) return fail();
    if (token === "(") {
      const inner = sum();
      if (tokens[position++] !== ")") fail();
      return inner;
    }
    if (token === "-") { const inner = primary(); return { ...inner, k: -inner.k }; }
    const markerMatch = /^\u0001(\d+)\u0002$/.exec(token);
    if (markerMatch) return values[Number(markerMatch[1])] ?? fail();
    if (/^\d/.test(token)) return { k: Number(token), unit: "" };
    const variable = variables.find(([pattern]) => pattern.test(token));
    return variable ? { ...variable[1] } : fail();
  };
  const postfix = (): Value => {
    const value = primary();
    // "(A)%" — the percent sign after a stat value repeats what the value already says.
    while (peek() === "%") position += 1;
    return value;
  };
  const product = (): Value => {
    let left = postfix();
    while (peek() === "*" || peek() === "/") {
      const operator = tokens[position++];
      const right = postfix();
      if (operator === "*") {
        if (left.unit && right.unit) fail();
        left = { k: left.k * right.k, unit: left.unit || right.unit };
      } else {
        if (right.unit || right.k === 0) fail();
        left = { k: left.k / right.k, unit: left.unit };
      }
    }
    return left;
  };
  const sum = (): Value => {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const operator = tokens[position++];
      const right = product();
      if (left.unit !== right.unit && left.k !== 0 && right.k !== 0) fail();
      left = { k: operator === "+" ? left.k + right.k : left.k - right.k, unit: left.unit || right.unit };
    }
    return left;
  };
  try {
    const result = sum();
    return position === tokens.length && Number.isFinite(result.k) ? result : null;
  } catch {
    return null;
  }
}

const isFormula = (source: string) => /\d|\u0001/.test(source)
  && source.replace(/\u0001\d+\u0002|\d+(?:\.\d+)?|[()+\-*/%\s]|Всего очков здоровья|Сила атаки|Сила заклинаний|Универсальность/g, "") === "";

/** Splits "A / B" at the top level of a clause (not inside parentheses). */
function splitAlternatives(body: string) {
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && body.startsWith(" / ", index)) return [body.slice(0, index), body.slice(index + 3)] as const;
  }
  return null;
}

/** Spec names compare without case and without "ё" (the game writes "Лед"). */
const specKey = (name: string) => name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");

/** "Оружие, Неистовство\n…\n\nЗащита\n…": keeps the block of the given specialization. */
export function pickSpecVariant(text: string, spec?: TalentTextSpec) {
  if (!spec || spec.classSpecNames.length < 2) return text;
  const names = new Set(spec.classSpecNames.map(specKey));
  const isHeader = (line: string) => {
    const parts = line.split(",").map(specKey);
    return parts.length > 0 && parts.every((part) => names.has(part));
  };
  const lines = text.split("\n");
  if (!lines.some((line) => isHeader(line.trim()))) return text;
  const blocks: Array<{ specs: string[]; lines: string[] }> = [];
  let current: { specs: string[]; lines: string[] } | null = null;
  for (const line of lines) {
    if (isHeader(line.trim())) {
      current = { specs: line.split(",").map(specKey), lines: [] };
      blocks.push(current);
    } else if (current) current.lines.push(line);
    else if (line.trim()) { current = { specs: [], lines: [line] }; blocks.push(current); }
  }
  const own = specKey(spec.specName);
  const chosen = blocks.find((block) => block.specs.includes(own)) ?? blocks.find((block) => block.specs.length === 0) ?? blocks[0];
  return chosen.lines.join("\n").trim();
}

/**
 * The Russian tooltip text as a player reads it in game: formulas computed
 * ("[([206.998% of Attack Power]) + …]" → "414% силы атаки"), talent clauses
 * resolved for a character without the modifying talent, the specialization's
 * own variant kept, plural pairs and stray brackets removed.
 */
export function formatRussianTalentText(raw: string, spec?: TalentTextSpec) {
  const values: Value[] = [];
  const own = spec ? specKey(spec.specName) : undefined;
  const keep = (value: Value) => { values.push(value); return marker(values.length - 1); };
  let text = pickSpecVariant(raw.replace(/\r\n?/g, "\n").replace(/\|c[0-9A-Fa-f]{8}|\|r/g, ""), spec)
    .replace(/\$mas\b/g, "искусность");

  for (let pass = 0; pass < 40; pass += 1) {
    let changed = false;
    text = text.replace(/\[([^[\]{}]*)\]/g, (_match, body: string) => {
      changed = true;
      const of = /^\s*(\d+(?:\.\d+)?)%\s+of\s+(Attack Power|Spell Power|Weapon Damage)\s*$/i.exec(body);
      if (of) return keep({ k: Number(of[1]), unit: ofUnits[of[2].toLowerCase()] });
      if (isFormula(body)) {
        const value = evaluate(body, values);
        return value ? keep(value) : body.replace(markerPattern, (_m, index: string) => renderValue(values[Number(index)])).replace(/\s\*\s/g, " × ");
      }
      const clause = /^\s*([\p{Lu}][^:\n[\]]{0,40}):\s?([\s\S]*)$/u.exec(body);
      if (clause) {
        const name = specKey(clause[1]);
        const alternatives = splitAlternatives(clause[2]);
        const active = name === own;
        if (alternatives) return active ? alternatives[0] : alternatives[1];
        return active ? clause[2] : "";
      }
      // An unnamed clause the game leaves empty for this character ("[\nДает 0 ед. ярости.]").
      return /^\s*Дает 0 ед\./.test(body) ? "" : body;
    });
    // "{?a320415[{V1][{V2]": an opening brace glued to a value, then the aura condition.
    text = text.replace(/\{(?=\u0001)/g, () => { changed = true; return ""; })
      .replace(/\{?\?[a-z]?\d+\s*(\u0001\d+\u0002)\s*(\u0001\d+\u0002)\}?/g, (_match, _with: string, without: string) => { changed = true; return without; });
    text = text.replace(/\{([^{}[\]]*)\}/g, (match, body: string) => {
      // "{?a320415<with aura><without>}": the value without the aura.
      const conditional = /^\?[a-z]?\d+(\u0001\d+\u0002)(\u0001\d+\u0002)$/.exec(body.trim());
      if (conditional) { changed = true; return conditional[2]; }
      if (/^\s*\u0001\d+\u0002\s*$/.test(body)) { changed = true; return body.trim(); }
      return match;
    });
    if (!changed) break;
  }

  text = text
    // "(120 / 10) ед. ярости" — plain arithmetic in parentheses.
    .replace(/\((\d+(?:\.\d+)?(?:\s*[*/+]\s*\d+(?:\.\d+)?)+)\)/g, (match, body: string) => {
      const value = evaluate(body, values);
      return value ? formatNumber(value.k) : match;
    })
    // "после 5 / Безрассудство: 8 / Разящий гром: 85-й": the value without those talents.
    .replace(/(\d+(?:\.\d+)?)((?: \/ [\p{Lu}][^/:\n]{0,40}: \d+(?:\.\d+)?)+)(-\p{L}+)?/gu, (_match, base: string, _rest: string, suffix = "") => `${base}${suffix}`)
    // "(V)%" and "(V)" around a computed value.
    .replace(/\((\u0001\d+\u0002)\)%?/g, "$1")
    .replace(/(\u0001\d+\u0002)%/g, "$1");

  // "V ед. физического урона" → "физический урон в размере V"; "на V ед. здоровья" → "на V".
  text = text
    .replace(/(до )?(\u0001(\d+)\u0002) ед\. (?:(\p{L}+?)(ого|его) )?урона( от (?:\p{L}+(?:ой|ей) магии|магии \p{L}+|умения "[^"]+"|(?!(?:этого|этой|этих|него|нее|неё|них|вас|нас|себя)(?!\p{L}))\p{L}+))?/gu, (match, upTo = "", token: string, index: string, stem?: string, ending?: string, from = "") => {
      if (!values[Number(index)]?.unit) return match;
      const adjective = stem ? `${stem}${ending === "его" || /[кгхжшчщ]$/.test(stem) ? "ий" : "ый"} ` : "";
      return `${adjective}урон${from} в размере ${upTo}${token}`;
    })
    .replace(/(на|до) (\u0001(\d+)\u0002) ед\. здоровья/g, (match, preposition: string, token: string, index: string) => values[Number(index)]?.unit ? `${preposition} ${token}` : match)
    .replace(/(\u0001(\d+)\u0002) ед\. здоровья/g, (match, token: string, index: string) => values[Number(index)]?.unit ? `здоровье в размере ${token}` : match)
    .replace(markerPattern, (_match, index: string) => renderValue(values[Number(index)]))
    .replace(/\s\*\s/g, " × ");

  return resolvePluralForms(text)
    .replace(/[[\]{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,:;])/g, "$1")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
