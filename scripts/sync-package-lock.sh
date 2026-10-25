#!/usr/bin/env bash
# Rebuilds package-lock.json from what bun installed, so `npm audit` (in
# scripts/security-scan.sh) reads the tree that ships. bun.lock is the source
# of truth: Lovable updates only it.
#
# npm cannot be asked to resolve the same tree itself: `npm install
# --package-lock-only` picks newer versions inside each range, and it "fixes"
# a peer conflict bun accepts (react-query 5.103.2 under a persist-client
# asking for ^5.104.1). So: shrinkwrap the installed node_modules for the
# shape, then take every version and sha512 from bun.lock, path by path.
# Run after `bun install --frozen-lockfile`.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f package-lock.json npm-shrinkwrap.json
npm shrinkwrap --ignore-scripts >/dev/null 2>&1
mv npm-shrinkwrap.json package-lock.json
node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const bun = fs.readFileSync("bun.lock", "utf8");
let pinned = 0;
const re = /^    "([^"]+)": \["((?:@[^\/"]+\/)?[^@"]+)@([^"]+)", "[^"]*", (?:\{[^\n]*\}, )?"(sha512-[^"]+)"\]/gm;
for (const m of bun.matchAll(re)) {
  const [, key, name, version, integrity] = m;
  const parts = [];
  for (let rest = key; rest; ) {
    const seg = rest.startsWith("@") ? rest.split("/").slice(0, 2).join("/") : rest.split("/")[0];
    parts.push(seg);
    rest = rest.slice(seg.length + 1);
  }
  const entry = lock.packages[parts.map((p) => "node_modules/" + p).join("/")];
  if (!entry) continue;
  const base = name.includes("/") ? name.split("/")[1] : name;
  Object.assign(entry, { version, resolved: `https://registry.npmjs.org/${name}/-/${base}-${version}.tgz`, integrity });
  pinned++;
}
fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
console.log(`package-lock.json: ${pinned} packages pinned to bun.lock`);
'
