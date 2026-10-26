// ESLint for the monorepo (roadmap items 81, 91): the web app in apps/web and the
// shared packages. Run: npm run lint (root) or npm run lint -w @gildra/web.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import fs from "node:fs";

const noApp = { regex: "^@/app/(?!styles/)", message: "app/ is the top of the tree: move shared code to components/ or lib/." };
const noKitInLib = { regex: "^(@/components/atlas|@gildra/atlas-ui)(/(?!format$|placeholders$|motionPreference$|morph$).*)?$", message: "lib/ is data and logic; it must not depend on kit components (helpers like format are fine)." };
const noRawGameData = { regex: "^(@/data/|@gildra/game-data)", message: "Game data reaches components and routes through lib/data (e.g. @/lib/data/wow), on the server." };
const kitStaysIndependent = { regex: "^@/", message: "Packages (@gildra/atlas-ui, @gildra/game-data) never import the app — pass data in through props, or keep app-derived data in apps/web/lib." };

// Feature modules of World of Warcraft (roadmap item 71): each uses its own
// files, components/wow/shared, the kit and lib/ — never another feature's insides.
const wowFeatures = fs.readdirSync(new URL("./apps/web/components/wow/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "shared" && !entry.name.startsWith("_"))
  .map((entry) => entry.name);
const otherFeature = (feature) => ({
  regex: `^(@/components/wow/(?!(${feature}|shared)/)[^/]+/|\\.\\./(?!shared/)[^./][^/]*/)`,
  message: "A feature module uses its own files, components/wow/shared, the kit and lib/ — move shared pieces to components/wow/shared.",
});

const iconRule = {
  selector: "Literal[value=/^\\/assets\\/(abilities|classes|specs)\\/[^/]+\\.(jpe?g|png|webp)$/]",
  message: "Game icons resolve only through lib/games/wow/assets.ts (specIcon, classIcon, abilityIcon).",
};
// A word pair, not a path, a locale code or an empty side.
const words = (side) => `[${side}.type='Literal'][${side}.value=/[A-Za-zА-Яа-яЁё]/]:not([${side}.value=/^(\\/|#|https?:|en$|ru$|en_US$|ru_RU$)/])`;
const copyMessage = "Put the words in the component's *Copy.ts ({ en, ru }) and read copy[locale].key.";
const copyRules = [
  { selector: `ConditionalExpression[test.operator='==='][test.right.value=/^(ru|en)$/]${words("consequent")}${words("alternate")}`, message: copyMessage },
  { selector: `ConditionalExpression[test.type='Identifier'][test.name=/^(ru|isRu|isRussian)$/]${words("consequent")}${words("alternate")}`, message: copyMessage },
];
const web = (glob) => `apps/web/${glob}`;
const frozenCopy = ["components/platform/home/**", "components/platform/navigation/**", "components/wow/audit/**", "components/wow/characters/**"].map(web);

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "**/.next*/**", "**/node_modules/**", "**/.artifacts/**", "backend/**", "scraper/**", "apps/web/public/**",
      "**/next-env.d.ts", "**/*.gen.*",
    ],
  },
  // Next's own rules look for the app here.
  { settings: { next: { rootDir: "apps/web/" } } },
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // React Compiler rules: the large legacy client tools (rotation trainer,
      // talent calculator, M+ route map, character audit) read refs during
      // render and sync state in effects on purpose. Warn until each tool is
      // refactored (docs/roadmap.md, items 70–72); new code keeps them clean.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      // Leading underscore marks an intentionally unused argument or binding.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  // Import boundaries (roadmap item 72). Routes sit on top of the tree; the atlas
  // kit never reaches into features, so it can move to its own package; lib/ is
  // data and logic and does not depend on kit components. (One block per file
  // set: a later no-restricted-imports replaces an earlier one, not merges.)
  {
    files: [web("components/**/*.{ts,tsx}"), web("app/**/*.{ts,tsx}")],
    ignores: [web("components/blocks/**")],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noRawGameData] }] },
  },
  {
    // Blocks may read data modules in their load(); the components stay pure.
    files: [web("components/blocks/**/*.{ts,tsx}")],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp] }] },
  },
  {
    files: [web("lib/**/*.{ts,tsx}")],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noKitInLib] }] },
  },
  {
    files: ["packages/atlas-ui/**/*.{ts,tsx}", "packages/game-data/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [kitStaysIndependent] }] },
  },
  ...wowFeatures.map((feature) => ({
    files: [web(`components/wow/${feature}/**/*.{ts,tsx}`)],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noRawGameData, otherFeature(feature)] }] },
  })),
  // Icon rule (roadmap item 7): components and routes take game icons from
  // lib/games/wow/assets.ts, never a hard-coded path (data mappings in lib/ may).
  // Copy rule (roadmap item 76): words live in a *Copy.ts with en/ru sides
  // (tests/atlas/copy.test.ts checks both have the same keys), not in inline
  // `lang === "ru" ? "…" : "…"` ternaries. The landing and the book keep theirs
  // (they are frozen at 0 px); a *Copy.ts may branch on the locale itself.
  {
    files: [web("components/**/*.{ts,tsx}"), web("app/**/*.{ts,tsx}")],
    ignores: [...frozenCopy, "**/*Copy.ts"],
    rules: { "no-restricted-syntax": ["error", iconRule, ...copyRules] },
  },
  {
    files: [...frozenCopy, web("components/**/*Copy.ts")],
    rules: { "no-restricted-syntax": ["error", iconRule] },
  },
  {
    files: [web("lib/**/*.{ts,tsx}")],
    ignores: [web("lib/wow/battleNet*.ts"), web("lib/platform/home/**"), "**/*Copy.ts"],
    rules: { "no-restricted-syntax": ["error", ...copyRules] },
  },
  {
    // Original Valyro registry source: its virtualizer deliberately memoizes a
    // getter and mutable measurement cache. React Compiler advisories cannot
    // preserve that upstream pattern; keep the source/provenance checksums and
    // all other lint rules intact. This hook is not used by the public adapters.
    files: ["packages/atlas-ui/src/valyro-ui/primitives/useVirtualizer.ts"],
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/use-memo": "off",
    },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
