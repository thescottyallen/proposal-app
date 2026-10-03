import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

function isLocal(specifier) {
  return specifier.startsWith("@/") || specifier.startsWith("./") || specifier.startsWith("../");
}

export async function resolve(specifier, context, nextResolve) {
  if (!isLocal(specifier)) return nextResolve(specifier, context);

  let mapped = specifier;
  if (specifier.startsWith("@/")) {
    mapped = pathToFileURL(path.join(srcRoot, specifier.slice(2))).href;
  }

  const attempts = [mapped];
  if (!/\.(?:ts|tsx|js|mjs|cjs|json|node)$/.test(mapped)) {
    attempts.push(`${mapped}.ts`);
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      return await nextResolve(attempt, context);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
