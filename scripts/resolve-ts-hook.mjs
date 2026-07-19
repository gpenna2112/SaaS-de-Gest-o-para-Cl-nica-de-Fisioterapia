// Hook de resolução só para rodar scripts/seed-dev.ts com `node` puro:
// resolve imports relativos extensionless/diretório (./schema, ./client)
// para .ts/index.ts, sem tocar em nenhum arquivo de src/. Uso único, dev-only.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATES = ["", ".ts", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".")) {
    const basePath = fileURLToPath(new URL(specifier, context.parentURL));
    for (const suffix of CANDIDATES) {
      const candidate = basePath + suffix;
      if (existsSync(candidate) && !candidate.endsWith("/")) {
        try {
          const stat = await import("node:fs").then((fs) =>
            fs.statSync(candidate),
          );
          if (stat.isFile()) {
            return nextResolve(pathToFileURL(candidate).href, context);
          }
        } catch {
          // tenta o próximo candidato
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
