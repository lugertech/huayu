import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));
const configPath = resolve(webRoot, "tsconfig.json");
const config = ts.getParsedCommandLineOfConfigFile(
  configPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(error) {
      throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
    },
  },
);
if (!config || config.errors.length) throw new Error("Invalid web tsconfig");

const options = config.options;
const sourceRoot = resolve(webRoot, "src");
const files = config.fileNames.filter(
  (file) =>
    relative(sourceRoot, file).split(sep)[0] !== ".." && /\.tsx?$/.test(file),
);
const modulePaths = new Map(
  files.map((file) => [
    resolve(file),
    relative(sourceRoot, file).split(sep).join("/"),
  ]),
);
const dot = process.argv.includes("--dot");
if (dot) console.log("digraph web {");
let edgeCount = 0;
for (const [file, from] of modulePaths) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const targets = new Set<string>();
  const testModule = /\.test\.tsx?$/.test(from);
  function visit(node: ts.Node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      specifier = node.arguments[0];
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal;
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const target = ts.resolveModuleName(
        specifier.text,
        file,
        options,
        ts.sys,
      ).resolvedModule;
      const to = target && modulePaths.get(resolve(target.resolvedFileName));
      if (to) targets.add(to);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (dot) console.log(`  ${JSON.stringify(from)};`);
  for (const to of targets) {
    edgeCount++;
    if (dot) console.log(`  ${JSON.stringify(from)} -> ${JSON.stringify(to)};`);
    if (testModule) continue;
    if (
      (from.startsWith("api/") && /^(?:ai|features|workflow)\//.test(to)) ||
      (from.startsWith("features/") && to.startsWith("pages/")) ||
      (from.startsWith("features/asset-library/") &&
        to.startsWith("features/canvas/")) ||
      (from.startsWith("features/canvas/") &&
        to.startsWith("features/asset-library/")) ||
      (from.startsWith("features/canvas/engine/") &&
        to.startsWith("features/canvas/components/"))
    ) {
      console.error(
        `Import crosses an architectural boundary: ${from} -> ${to}`,
      );
      process.exitCode = 1;
    }
  }
}
if (dot) console.log("}");
else
  console.log(
    `Checked ${modulePaths.size} Web modules and ${edgeCount} local dependencies.`,
  );
