import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init, parse } from "es-module-lexer";

await init;

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && existsSync(npmCli), "请通过 npm run verify:package 运行。");
const fixture = join(root, "scripts/fixtures/ui-consumer");
mkdirSync(join(root, ".release-check"), { recursive: true });
const artifacts = mkdtempSync(join(root, ".release-check/run-"));
// Outside the repository: module resolution must not fall back to the dev Pi AI installation.
const consumer = mkdtempSync(join(tmpdir(), "mck-ui-consumer-"));
console.log(`验证产物：${artifacts}\n独立消费者：${consumer}`);

function npm(args, cwd = root, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    if (capture) console.error(result.stdout, result.stderr);
    throw result.error ?? new Error(`npm ${args.join(" ")} 失败（${result.status}）`);
  }
  return result.stdout;
}

function checkRootGraph(entry) {
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const [imports] = parse(readFileSync(path, "utf8"));
    function checkImport(specifier) {
      assert.ok(!specifier.startsWith("@earendil-works/pi-ai") && !specifier.startsWith("node:"), `根入口泄漏依赖：${specifier}`);
      if (specifier.startsWith(".")) visit(resolve(dirname(path), specifier));
      else assert.ok(["react", "react-dom", "react/jsx-runtime"].includes(specifier), `意外的根入口外部依赖：${specifier}`);
    }
    for (const imported of imports) {
      if (imported.d === -2) continue; // import.meta is not a dependency.
      assert.ok(imported.n, "根入口出现不可检查的动态导入");
      checkImport(imported.n);
    }
  }
  visit(entry);
}

function checkManifest(pack) {
  const paths = new Set(pack.files.map((file) => file.path));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const entry of Object.values(pkg.exports)) {
    for (const target of typeof entry === "string" ? [entry] : Object.values(entry)) assert.ok(paths.has(target.replace(/^\.\//, "")), `遗漏导出目标：${target}`);
  }
  for (const path of paths) {
    assert.ok(!/(?:\.test\.|\.typecheck\.|\.d\.ts\.map$|node_modules|\.npm-cache|\.release-check)/.test(path), `不应发布：${path}`);
    assert.ok(path.startsWith("dist/") || ["package.json", "LICENSE", ...pkg.files.filter((file) => file !== "dist")].includes(path), `不在发布 allowlist：${path}`);
    if (!path.endsWith(".md")) continue;
    const source = readFileSync(join(root, path), "utf8");
    for (const [, link] of source.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(link)) continue;
      const target = posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(link.split("#")[0])));
      assert.ok(paths.has(target), `${path} 的本地链接不在包内：${target}`);
    }
  }
  for (const path of ["LICENSE", "README.md", "CHANGELOG.md", "docs/API.md", "docs/THEMING.md", "docs/RELEASING.md", "examples/backend-proxy.ts", "examples/pi-ai-host.ts", "examples/theme.css"]) assert.ok(paths.has(path), `遗漏发布文档/示例：${path}`);
  assert.equal(pkg.peerDependenciesMeta["@earendil-works/pi-ai"].optional, true);
  assert.ok(!pkg.dependencies["@earendil-works/pi-ai"]);
  checkRootGraph(join(root, "dist/index.js"));
  console.log(`pack 清单通过：${pack.entryCount} 个文件，${pack.size} bytes。`);
}

// Verify exactly the README quickstart, not a more permissive handwritten consumer.
const readme = readFileSync(join(root, "README.md"), "utf8");
const snippet = readme.match(/```tsx\r?\n([\s\S]*?)\r?\n```/)?.[1];
assert.equal(snippet?.replaceAll("\r\n", "\n").trim(), readFileSync(join(fixture, "src/App.tsx"), "utf8").replaceAll("\r\n", "\n").trim(), "README 与消费者 App.tsx 不同步。");

npm(["run", "build"]);
const dry = JSON.parse(npm(["pack", "--dry-run", "--ignore-scripts", "--json"], root, true))[0];
checkManifest(dry);
const packed = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", artifacts], root, true))[0];
assert.deepEqual(packed.files, dry.files, "实际 tarball 和 dry-run 不一致。");
cpSync(fixture, consumer, { recursive: true });
npm(["install", "--no-save", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", "--registry", "https://registry.npmjs.org", "--cache", join(root, ".npm-cache"), join(artifacts, packed.filename)], consumer);
assert.ok(!existsSync(join(consumer, "node_modules/@earendil-works/pi-ai")), "UI 消费者意外安装 Pi AI。");
npm(["run", "typecheck"], consumer);
npm(["run", "build"], consumer);
npm(["run", "smoke"], consumer);

const installed = join(consumer, "node_modules/model-connection-kit");
checkRootGraph(join(installed, "dist/index.js"));
const assets = readdirSync(join(consumer, "dist/assets"));
assert.ok(assets.some((path) => path.endsWith(".js")), "消费者缺少 JS 产物。");
const css = assets.filter((path) => path.endsWith(".css")).map((path) => readFileSync(join(consumer, "dist/assets", path), "utf8")).join("\n");
const variables = [...readFileSync(join(root, "src/react/styles.css"), "utf8").matchAll(/(--mck-[a-z-]+)\s*:/g)].map((match) => match[1]);
for (const variable of new Set(variables)) assert.ok(css.includes(variable), `消费者 CSS 缺少变量：${variable}`);
console.log("包验证全部通过；未发布、未打 tag，保留 tarball 和独立消费者供排查。");
