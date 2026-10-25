// Writes src/config.ts from environment variables (used locally and by CI).
//   BACKEND_URL=https://api.example.com APP_KEY=xyz DEFAULT_LANGUAGE=ru LANGUAGES=ru,en,uz npm run configure
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "config.ts");
let s = fs.readFileSync(file, "utf8");
const set = (name, value) => {
  if (value === undefined || value === "") return;
  const re = new RegExp(`(export const ${name} = )(\\[.*?\\]|'.*?');`);
  if (!re.test(s)) throw new Error(`${name} not found in src/config.ts`);
  const lit = Array.isArray(value) ? `[${value.map((v) => `'${v}'`).join(", ")}]` : `'${String(value).replace(/'/g, "\\'")}'`;
  s = s.replace(re, `$1${lit};`);
  console.log(`  ${name} = ${name === "APP_KEY" ? "(hidden)" : lit}`);
};

const url = (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
if (url && !/^https:\/\//i.test(url) && process.env.ALLOW_HTTP !== "1") {
  console.error("BACKEND_URL must be https:// for release builds (set ALLOW_HTTP=1 to override for local tests).");
  process.exit(1);
}
set("BACKEND_URL", url);
set("APP_KEY", (process.env.APP_KEY || "").trim());
set("DEFAULT_LANGUAGE", (process.env.DEFAULT_LANGUAGE || "").trim().toLowerCase());
if (process.env.LANGUAGES) set("LANGUAGES", process.env.LANGUAGES.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
if (process.env.WAKE_ALIASES) set("WAKE_ALIASES", process.env.WAKE_ALIASES.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
fs.writeFileSync(file, s);
console.log("src/config.ts updated.");
