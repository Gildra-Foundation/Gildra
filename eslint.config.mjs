// ESLint for the Next.js app (roadmap item 91). Run: npm run lint
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
