// ESLint for the Next.js app (roadmap item 91). Run: npm run lint
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import fs from "node:fs";

const noApp = { regex: "^@/app/(?!styles/)", message: "app/ is the top of the tree: move shared code to components/ or lib/." };
const noKitInLib = { regex: "^@/components/atlas(/(?!format$).*)?$", message: "lib/ is data and logic; it must not depend on kit components." };
const noRawGameData = { regex: "^@/data/", message: "Game data reaches components and routes through lib/data (e.g. @/lib/data/wow), on the server." };
const kitStaysIndependent = { regex: "^@/components/(?!atlas(/|$))", message: "The atlas kit stays independent of features: pass data in through props." };

// Feature modules of World of Warcraft (roadmap item 71): each uses its own
// files, components/wow/shared, the kit and lib/ — never another feature's insides.
const wowFeatures = fs.readdirSync(new URL("./components/wow/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "shared" && !entry.name.startsWith("_"))
  .map((entry) => entry.name);
const otherFeature = (feature) => ({
  regex: `^(@/components/wow/(?!(${feature}|shared)/)[^/]+/|\\.\\./(?!shared/)[^./][^/]*/)`,
  message: "A feature module uses its own files, components/wow/shared, the kit and lib/ — move shared pieces to components/wow/shared.",
});

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next*/**", "node_modules/**", ".artifacts/**", "cms/**", "backend/**", "public/**",
      "next-env.d.ts", "**/*.gen.*",
    ],
  },
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
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: ["components/atlas/**", "components/blocks/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noRawGameData] }] },
  },
  {
    // Blocks keep their demo dataset (data/site.ts) behind ctx.source.
    files: ["components/blocks/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp] }] },
  },
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noKitInLib] }] },
  },
  {
    files: ["components/atlas/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noRawGameData, kitStaysIndependent] }] },
  },
  ...wowFeatures.map((feature) => ({
    files: [`components/wow/${feature}/**/*.{ts,tsx}`],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noRawGameData, otherFeature(feature)] }] },
  })),
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
