import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import globals from "globals";

// Reuse the website's locked analysis tools, without its DOM/Next rules.
// The mobile package owns this configuration; no runtime dependency is added.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
});

export default [
  { ignores: ["node_modules/**", ".generated/**", ".expo/**", "android/**", "ios/**"] },
  ...compat.extends("plugin:@typescript-eslint/recommended", "plugin:react-hooks/recommended"),
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": "off" }
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "react-hooks/exhaustive-deps": "error"
    }
  },
  {
    files: ["*.js", "plugins/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" }
  }
];
