const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "../../frontend/public");
const DST = path.resolve(__dirname, "../overlay");

const FILES = [
  ["model (1).glb", "model.glb"],
  ["hello.glb", "hello.glb"],
  ["you.glb", "you.glb"],
  ["name.glb", "name.glb"],
  ["what.glb", "what.glb"],
];

FILES.forEach(([from, to]) => {
  const src = path.join(SRC, from);
  const dst = path.join(DST, to);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-glbs] skipping ${from} — not found in frontend/public`);
    return;
  }
  fs.copyFileSync(src, dst);
  console.log(`[copy-glbs] ${from} → overlay/${to}`);
});
