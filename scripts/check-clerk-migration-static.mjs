import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../scripts/clerk-migration/", import.meta.url);

const needles = [
  "set -x",
  "xtrace",
  "postgres://",
  "--clerk-secret-key",
  "DATABASE_URL",
];

export async function findStaticViolations(directory = root) {
  const violations = [];
  const files = await walk(directory);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) violations.push(`${file} contains ${needle}`);
    }
    if (text.includes("curl") && text.includes("Authorization")) {
      violations.push(`${file} contains curl together with Authorization`);
    }
  }
  return violations;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory.pathname ?? directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(sh|sql|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = await findStaticViolations();
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exit(1);
  }
}
