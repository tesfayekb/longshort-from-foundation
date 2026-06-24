import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Deno test files (*_test.ts) and scripts run outside the Vite bundle's TS checker.
  // @ts-nocheck is the canonical escape hatch for the Deno/Vite dual-runtime separation.
  {
    files: [
      "**/*_test.ts",
      "scripts/**/*.ts",
      "**/test-fixtures.ts",
      "src/features/longshort/services/broker/**/*.ts",
      // ACT-316 (E6-build-revision): edge-resident broker layer is the
      // architectural mirror of src/.../broker/** and uses the same
      // @ts-ignore Deno-global declaration. Same carve-out applies.
      "supabase/functions/_shared/longshort-broker/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  // tailwind.config.ts uses CommonJS require() for plugin loading per Tailwind convention.
  {
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
