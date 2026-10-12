// ESLint for the Next.js app (roadmap item 91). Run: npm run lint
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const noApp = { regex: "^@/app/(?!styles/)", message: "app/ is the top of the tree: move shared code to components/ or lib/." };
const noKitInLib = { regex: "^@/components/atlas(/(?!format$).*)?$", message: "lib/ is data and logic; it must not depend on kit components." };
const kitStaysIndependent = { regex: "^@/components/(?!atlas(/|$))", message: "The atlas kit stays independent of features: pass data in through props." };

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
    files: ["components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["components/atlas/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp] }] },
  },
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, noKitInLib] }] },
  },
  {
    files: ["components/atlas/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [noApp, kitStaysIndependent] }] },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
