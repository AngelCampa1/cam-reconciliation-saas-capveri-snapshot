import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "next-env.d.ts",
      "tailwind.config.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Prose-heavy content uses real apostrophes - disable to avoid false positives.
      "react/no-unescaped-entities": "off",
      "react-hooks/globals": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
];

export default eslintConfig;
