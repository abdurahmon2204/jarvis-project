// node verify.js  (or: npm run verify)  -> checks that every file of the project is present.
const fs = require("fs");
const path = require("path");

const need = {
  "Backend": [
    "backend/server.js", "backend/package.json", "backend/package-lock.json", "backend/.env.example", "backend/Dockerfile",
    "backend/config/env.js", "backend/config/db.js", "backend/middleware/auth.js", "backend/middleware/rateLimits.js",
    "backend/controllers/chatController.js", "backend/controllers/authController.js", "backend/controllers/dataController.js",
    "backend/routes/chatRoutes.js", "backend/routes/authRoutes.js", "backend/routes/dataRoutes.js",
    "backend/models/Chat.js", "backend/models/Memory.js", "backend/models/Note.js",
    "backend/services/llm/index.js", "backend/services/llm/http.js",
    "backend/services/llm/providers/groq.js", "backend/services/llm/providers/gemini.js", "backend/services/llm/providers/claude.js",
    "backend/services/agent/index.js", "backend/services/agent/prompt.js", "backend/services/agent/parse.js",
    "backend/services/agent/time.js", "backend/services/agent/context.js", "backend/services/agent/net.js",
    "backend/services/agent/tools/index.js", "backend/services/agent/tools/weather.js", "backend/services/agent/tools/search.js",
    "backend/services/agent/tools/memory.js", "backend/services/agent/tools/notes.js", "backend/services/agent/tools/device.js",
    "backend/scripts/doctor.js", "backend/test/llm.test.js", "backend/test/api.test.js", "backend/test/agent.test.js",
    "backend/node_modules/express/package.json", "backend/node_modules/mongoose/package.json",
  ],
  "Web": [
    "web/package.json", "web/index.html", "web/vite.config.js", "web/src/App.jsx", "web/src/main.jsx", "web/src/index.css",
    "web/src/hooks/useJarvis.js", "web/src/hooks/useContinuousRecognition.js", "web/src/hooks/useSpeechSynthesis.js",
    "web/src/components/MicButton.jsx", "web/src/components/Visualizer.jsx", "web/src/services/api.js",
    "web/src/utils/wakeWord.js", "web/src/utils/lang.js", "web/src/utils/chime.js", "web/dist/index.html",
  ],
  "Mobile (Android app)": [
    "mobile/App.tsx", "mobile/index.js", "mobile/package.json", "mobile/package-lock.json", "mobile/app.json",
    "mobile/src/config.ts", "mobile/src/api.ts", "mobile/src/types.ts", "mobile/src/language.ts", "mobile/src/contacts.ts",
    "mobile/src/nameMatch.ts", "mobile/src/deviceActions.ts", "mobile/src/context.ts",
    "mobile/scripts/configure.js", "mobile/scripts/download-model.js",
    "mobile/android/gradlew", "mobile/android/gradlew.bat", "mobile/android/gradle/wrapper/gradle-wrapper.jar",
    "mobile/android/gradle.properties", "mobile/android/build.gradle", "mobile/android/app/build.gradle",
    "mobile/android/app/src/main/AndroidManifest.xml", "mobile/android/app/src/main/res/raw/activate.wav",
    "mobile/android/app/src/main/java/com/jarvisapp/MainApplication.kt", "mobile/android/app/src/main/java/com/jarvisapp/MainActivity.kt",
    "mobile/android/app/src/main/java/com/jarvisapp/JarvisDeviceModule.kt", "mobile/android/app/src/main/java/com/jarvisapp/JarvisDevicePackage.kt",
    "mobile/ios/JarvisApp/Info.plist",
  ],
  "Cloud & docs": [
    "README.md", "BOSHLASH.md", "render.yaml", "package.json", "setup.bat", "start.bat", "setup.sh", "start.sh",
    ".github/workflows/android-apk.yml", ".github/workflows/backend-tests.yml",
  ],
};

const root = __dirname;
let missing = 0, total = 0;
for (const [group, files] of Object.entries(need)) {
  const bad = files.filter((f) => !fs.existsSync(path.join(root, f)));
  total += files.length; missing += bad.length;
  console.log(`${bad.length ? "❌" : "✅"} ${group}: ${files.length - bad.length}/${files.length}`);
  bad.forEach((f) => console.log(`     missing: ${f}`));
}
const major = Number(process.versions.node.split(".")[0]);
console.log(`${major >= 20 ? "✅" : "❌"} Node.js ${process.versions.node} (20+ required)`);
console.log(missing ? `\n${missing} of ${total} files are missing. Re-extract the ZIP completely.` : `\nAll ${total} required files are present.`);
process.exit(missing || major < 20 ? 1 : 0);
