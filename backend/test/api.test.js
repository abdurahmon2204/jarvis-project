import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.GROQ_API_KEY = "gsk_test";
process.env.LLM_PROVIDERS = "groq";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.APP_KEY = "k123";

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.startsWith("http://127.0.0.1")) return realFetch(url, init); // our own test server
  if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }] }), { status: 200 });
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify({ choices: [{ message: { content: `Echo: ${body.messages.at(-1).content}` } }] }), { status: 200 });
};

const authRoutes = (await import("../routes/authRoutes.js")).default;
const chatRoutes = (await import("../routes/chatRoutes.js")).default;

const app = express();
app.use(express.json());
app.use("/api", authRoutes);
app.use("/api/chat", chatRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("register requires the app key", async () => {
  assert.equal((await post("/register", {})).status, 401);
});

test("register -> token -> chat works (DB offline: answers without memory)", async () => {
  const reg = await post("/register", {}, { "x-app-key": "k123" });
  assert.equal(reg.status, 201);
  const { token, deviceId } = await reg.json();
  assert.ok(token && deviceId);

  const res = await post("/chat", { message: "hello jarvis" }, { Authorization: `Bearer ${token}` });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: "Echo: hello jarvis", actions: [] });
});

test("chat without or with a bad token is rejected with a machine-readable code", async () => {
  const a = await post("/chat", { message: "x" });
  assert.equal(a.status, 401);
  assert.equal((await a.json()).code, "no_token");
  const b = await post("/chat", { message: "x" }, { Authorization: "Bearer nope" });
  assert.equal((await b.json()).code, "bad_token");
});

test("empty message is rejected", async () => {
  const { token } = await (await post("/register", {}, { "x-app-key": "k123" })).json();
  const res = await post("/chat", { message: "   " }, { Authorization: `Bearer ${token}` });
  assert.equal(res.status, 400);
});
