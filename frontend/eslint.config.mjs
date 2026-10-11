import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // AGENTS.md: no console.log in committed code (warn/error stay for real failures)
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      // CM-052b: eslint-config-next 16 enables the React Compiler rules as errors. They flag
      // existing patterns that work at runtime; keep them visible as warnings until a follow-up ticket fixes the code.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
