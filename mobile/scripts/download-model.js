// Downloads the small offline English Vosk model (~40 MB, Apache-2.0) into assets/model-en-en.
// Works on Windows/macOS/Linux (no unzip needed).   npm run model
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const AdmZip = require("adm-zip");

const URL_ = process.env.VOSK_MODEL_URL || "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
const TARGET = path.join(__dirname, "..", "assets", "model-en-en");

(async () => {
  if (fs.existsSync(path.join(TARGET, "am"))) {
    console.log("Model already present:", TARGET);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vosk-"));
  const zipPath = path.join(tmp, "model.zip");
  console.log("Downloading", URL_);
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zipPath));

  console.log("Extracting...");
  const out = path.join(tmp, "out");
  new AdmZip(zipPath).extractAllTo(out, true);
  const root = fs.readdirSync(out).find((d) => fs.statSync(path.join(out, d)).isDirectory());
  if (!root) throw new Error("Archive did not contain a model folder");

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.cpSync(path.join(out, root), TARGET, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("Model installed at", TARGET);
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
