const fs = require("node:fs");
const path = require("node:path");

const esbuild = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const DIST_DIR = path.join(ROOT_DIR, "dist");

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function collectJavaScriptFiles(dirPath, results = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      collectJavaScriptFiles(entryPath, results);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(entryPath);
    }
  }

  return results;
}

async function build() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  copyDirectory(SRC_DIR, DIST_DIR);

  const entryPoints = collectJavaScriptFiles(SRC_DIR);

  await esbuild.build({
    entryPoints,
    outdir: DIST_DIR,
    outbase: SRC_DIR,
    bundle: false,
    sourcemap: true,
    target: ["chrome116"],
    logLevel: "info",
  });
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});