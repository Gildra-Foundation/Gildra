import type { ProfessionData, SpecializationNode } from "@/lib/wow/professions/types";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";

type Lang = "en" | "ru";

function Node({ node, lang, recipeName, open }: { node: SpecializationNode; lang: Lang; recipeName: (spell: number) => string | null; open?: boolean }) {
  const c = professionsCopy[lang];
  return <details className={styles.specNode} open={open}>
    <summary className={styles.specSummary}>
      <span className={styles.specName}>{node.name[lang]}</span>
      <span className={styles.specRanks}>{c.ranksLabel(node.ranks)}</span>
    </summary>
    <div className={styles.specBody}>
      {node.text[lang] ? <p className={styles.specText}>{node.text[lang]}</p> : null}
      {node.perks.length ? <ol className={styles.perks}>
        {node.perks.map((perk, index) => {
          const recipe = perk.recipe ? recipeName(perk.recipe) : null;
          return <li key={`${perk.at}-${index}`} className={styles.perk}>
            <span className={styles.perkAt}>{c.at(perk.at)}</span>
            <span className={styles.perkText}>
              {recipe ? <strong className={styles.perkRecipe}>{c.unlocksRecipe}: {recipe}</strong> : null}
              {perk.text[lang].split("\n").filter(Boolean).filter((line) => !recipe || !line.includes(recipe)).map((line, i) => <span key={i}>{line}</span>)}
            </span>
          </li>;
        })}
      </ol> : null}
      {node.children.length ? <div className={styles.specChildren}>{node.children.map((child) => <Node key={child.id} node={child} lang={lang} recipeName={recipeName} />)}</div> : null}
    </div>
  </details>;
}

/** Every specialization tree: the path, its points, what each threshold gives, and its sub-specializations. */
export function ProfessionSpecializations({ data, lang }: { data: ProfessionData; lang: Lang }) {
  const names = new Map(data.recipes.map((recipe) => [recipe.spell, recipe.name[lang]]));
  return <div className={styles.specs}>
    {data.specializations.map((tree) => <Node key={tree.id} node={tree} lang={lang} recipeName={(spell) => names.get(spell) ?? null} />)}
  </div>;
}
