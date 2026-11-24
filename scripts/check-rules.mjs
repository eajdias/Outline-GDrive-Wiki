import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] ?? ".");
const SRC = path.join(ROOT, "src");
const TEST = path.join(ROOT, "test");

const MAX_SRC_LINES = 250;
const MAX_TEST_LINES = 400;
const MAX_CLASS_METHODS = 8;

const LAYERS = ["domain", "ports", "usecases", "commands"];

const FORBIDDEN_LAYER_IMPORTS = {
  domain: ["ports", "usecases", "commands", "infra", "cli"],
  ports: ["usecases", "commands", "cli"],
  usecases: ["commands", "cli"],
  commands: ["cli"],
};

const violations = [];

function report(file, rule, detail) {
  violations.push({ file: path.relative(ROOT, file).split(path.sep).join("/"), rule, detail });
}

async function exists(dir) {
  try {
    await readdir(dir);
    return true;
  } catch {
    return false;
  }
}

async function collect(dir) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function layerOf(file) {
  const relative = path.relative(SRC, file).split(path.sep).join("/");
  const [first] = relative.split("/");
  if (relative === "index.ts" || relative === "cli.ts") return "entrypoint";
  return LAYERS.includes(first) ? first : "entrypoint";
}

function importSpecifiers(source) {
  const result = [];
  const pattern = /import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    result.push({ typeOnly: Boolean(match[1]), specifier: match[2] });
  }
  return result;
}

function checkBoundary(file, source) {
  const fileLayer = layerOf(file);
  const relativeFile = path.relative(SRC, file).split(path.sep).join("/");
  const forbidden = FORBIDDEN_LAYER_IMPORTS[fileLayer] ?? [];

  for (const { typeOnly, specifier } of importSpecifiers(source)) {
    if (specifier.startsWith("@repo/")) {
      if (fileLayer === "domain" || fileLayer === "ports") {
        report(file, "shared-only-in-infra", `${fileLayer} must not import ${specifier}`);
      }
      continue;
    }
    if (!specifier.startsWith(".")) continue;

    const target = path.resolve(path.dirname(file), specifier);
    const targetLayer = layerOf(target.replace(/\.js$/, ".ts"));
    const relativeTarget = path.relative(SRC, target).split(path.sep).join("/");

    if (targetLayer === "entrypoint" && (relativeTarget === "cli" || relativeTarget === "index")) {
      if (forbidden.includes("cli")) report(file, "layer-direction", `${fileLayer} must not import entrypoint`);
      continue;
    }

    if (forbidden.includes(targetLayer)) {
      report(file, "layer-direction", `${fileLayer} must not import ${targetLayer} (${specifier})`);
      continue;
    }

    if (
      targetLayer === "ports" &&
      !typeOnly &&
      fileLayer !== "commands" &&
      relativeFile !== "infra/context.ts" &&
      relativeFile !== "index.ts"
    ) {
      report(file, "di-boundary", `${fileLayer} must receive ports via injection, not import them (${specifier})`);
    }
  }
}

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function checkSourceRules(file, source) {
  const lines = source.split("\n").length;
  if (lines > MAX_SRC_LINES) {
    report(file, "max-file-lines", `${lines} lines (limit ${MAX_SRC_LINES})`);
  }

  if (/process\.env/.test(source) && relativeFile(ROOT, file) !== "src/infra/config.ts") {
    report(file, "env-only-in-config", "process.env used outside src/infra/config.ts");
  }

  if (/console\.(log|error|warn|debug)/.test(source)) {
    report(file, "logger-only", "console.* used outside @repo/logger");
  }

  if (/\bexport\s+default\b/.test(source)) {
    report(file, "no-default-export", "use named exports");
  }

  if (/\b(?:as\s+any|:\s*any\b|<any>)/.test(source)) {
    report(file, "no-any", "explicit any is forbidden");
  }

  if (/\bas\s+unknown\s+as\b/.test(source)) {
    report(file, "no-double-cast", "as unknown as is forbidden outside tests");
  }

  if (/\b(?:TODO|FIXME|XXX)\b/.test(source)) {
    report(file, "no-todo", "TODO/FIXME left in code");
  }

  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(source)) {
    report(file, "no-silent-catch", "empty catch block");
  }

  if (/\brequire\s*\(/.test(source)) {
    report(file, "esm-only", "require() is not allowed, use import");
  }

  const NOT_METHODS = new Set([
    "constructor",
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "do",
    "try",
    "return",
    "const",
    "let",
    "var",
    "await",
    "function",
    "else",
  ]);
  const methodPattern = /^ {2}(?:public\s+)?(?:static\s+)?(?:async\s+)?[A-Za-z_][\w]*\s*[(<]/gm;
  if (/^export class |^class /m.test(source)) {
    const methods = (source.match(methodPattern) ?? []).filter((line) => {
      const name = line.trim().replace(/^(?:public\s+)?(?:static\s+)?(?:async\s+)?/, "").split(/[\s(<]/)[0];
      return name !== undefined && !NOT_METHODS.has(name);
    });
    if (methods.length > MAX_CLASS_METHODS) {
      report(file, "max-class-methods", `${methods.length} public methods (limit ${MAX_CLASS_METHODS})`);
    }
  }

  checkBoundary(file, source);
}

function checkTestRules(file, source) {
  const lines = source.split("\n").length;
  if (lines > MAX_TEST_LINES) {
    report(file, "max-file-lines", `${lines} lines (limit ${MAX_TEST_LINES})`);
  }
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(source)) {
    report(file, "no-silent-catch", "empty catch block");
  }
  if (/\b(?:TODO|FIXME|XXX)\b/.test(source)) {
    report(file, "no-todo", "TODO/FIXME left in code");
  }
}

const sourceFiles = await collect(SRC);
const importedFiles = new Set();

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  checkSourceRules(file, source);

  for (const { specifier } of importSpecifiers(source)) {
    if (specifier.startsWith("@repo/")) continue;
    if (!specifier.startsWith(".")) continue;
    importedFiles.add(path.resolve(path.dirname(file), specifier).replace(/\.js$/, ".ts"));
  }
}

const STATIC_ENTRYPOINTS = new Set(["src/index.ts", "src/cli.ts"]);

for (const file of sourceFiles) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  if (STATIC_ENTRYPOINTS.has(relative) || relative.endsWith(".entry.ts")) continue;
  if (!importedFiles.has(file)) {
    report(file, "dead-module", "no other module imports this file");
  }
}

for (const file of await collect(TEST)) {
  checkTestRules(file, await readFile(file, "utf8"));
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}: ${violation.rule} — ${violation.detail}`);
  }
  console.error(`\n${violations.length} architecture violation(s)`);
  process.exit(1);
}

console.log(`architecture rules ok (${sourceFiles.length} source files)`);
