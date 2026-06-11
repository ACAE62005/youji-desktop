const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const releaseDir = path.join(root, "release");

const setupFile = fs
  .readdirSync(releaseDir)
  .filter((name) => name.includes(`Setup-${pkg.version}`) && name.endsWith(".exe"))
  .sort()
  .at(-1);

if (!setupFile) {
  throw new Error(`Cannot find NSIS installer for version ${pkg.version}`);
}

const setupPath = path.join(releaseDir, setupFile);
const releaseAssetName = `youji-Setup-${pkg.version}-x64.exe`;
const releaseAssetPath = path.join(releaseDir, releaseAssetName);
fs.copyFileSync(setupPath, releaseAssetPath);

const setupBlockmapPath = `${setupPath}.blockmap`;
if (fs.existsSync(setupBlockmapPath)) {
  fs.copyFileSync(setupBlockmapPath, `${releaseAssetPath}.blockmap`);
}

const file = fs.readFileSync(setupPath);
const sha512 = crypto.createHash("sha512").update(file).digest("base64");
const stat = fs.statSync(setupPath);

const yaml = [
  `version: ${pkg.version}`,
  "files:",
  `  - url: ${JSON.stringify(releaseAssetName)}`,
  `    sha512: ${sha512}`,
  `    size: ${stat.size}`,
  `path: ${JSON.stringify(releaseAssetName)}`,
  `sha512: ${sha512}`,
  `releaseDate: ${JSON.stringify(stat.mtime.toISOString())}`,
  ""
].join("\n");

fs.writeFileSync(path.join(releaseDir, "latest.yml"), yaml, "utf8");
console.log(`Wrote release/latest.yml for ${releaseAssetName}`);
