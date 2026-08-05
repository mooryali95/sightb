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
      // The database client is reachable only through the resilient service layer
      // (retry + offline queue + logging). Everything else goes via `src/services`.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/integrations/supabase/client", "**/integrations/supabase/client"],
              message:
                "لا تستورد عميل قاعدة البيانات مباشرة — استخدم طبقة الخدمات في src/services.",
            },
          ],
        },
      ],
    },
  },
  {
    // The service layer and generated integrations own the raw client.
    files: ["src/services/**", "src/integrations/**", "src/hooks/useAuth.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
);

