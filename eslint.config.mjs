import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generado por Supabase (npm run tipos:filtrar). No se edita a mano, asi
    // que marcar sus `{}` no lleva a ningun arreglo: se regenera y vuelven.
    "lib/types.ts",
  ]),
]);

export default eslintConfig;
