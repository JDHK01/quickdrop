const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");

let baseUrl;
let dataDir;
let server;
let sessionCookie;

async function request(route, options = {}) {
  return fetch(`${baseUrl}${route}`, options);
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "quickdrop-test-"));
  const config = loadConfig({
    dataDir,
    maxFileSizeMb: 1,
    maxFiles: 2,
    publicBaseUrl: "http://127.0.0.1",
    sessionSecret: "test-session-secret-that-is-long-enough",
    uploadPassword: "correct horse battery staple",
  });
  const app = await createApp(config);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("reports health and protects file administration", async () => {
  const health = await request("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: true, service: "quickdrop", version: "1.0.0" });

  const files = await request("/api/files");
  assert.equal(files.status, 401);
});

test("rejects an invalid password and creates a session for the correct password", async () => {
  const badLogin = await request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-quickdrop-request": "1" },
    body: JSON.stringify({ password: "not-the-password" }),
  });
  assert.equal(badLogin.status, 401);

  const login = await request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-quickdrop-request": "1" },
    body: JSON.stringify({ password: "correct horse battery staple" }),
  });
  assert.equal(login.status, 200);
  sessionCookie = login.headers.get("set-cookie").split(";", 1)[0];
  assert.match(sessionCookie, /^quickdrop_session=/);
});

test("uploads, lists, serves, and deletes a file", async () => {
  const form = new FormData();
  form.append("files", new Blob(["hello from quickdrop"], { type: "text/plain" }), "测试 文档.txt");

  const upload = await request("/api/files", {
    method: "POST",
    headers: { cookie: sessionCookie, "x-quickdrop-request": "1" },
    body: form,
  });
  assert.equal(upload.status, 201);
  const payload = await upload.json();
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].originalName, "测试 文档.txt");
  assert.match(payload.files[0].id, /^[a-f0-9]{32}$/);

  const listing = await request("/api/files", { headers: { cookie: sessionCookie } });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).files.length, 1);

  const publicFile = await fetch(payload.files[0].url.replace("http://127.0.0.1", baseUrl));
  assert.equal(publicFile.status, 200);
  assert.equal(await publicFile.text(), "hello from quickdrop");
  assert.match(publicFile.headers.get("content-disposition"), /^attachment;/);
  assert.equal(publicFile.headers.get("access-control-allow-origin"), "*");

  const removed = await request(`/api/files/${payload.files[0].id}`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, "x-quickdrop-request": "1" },
  });
  assert.equal(removed.status, 204);

  const missing = await fetch(payload.files[0].url.replace("http://127.0.0.1", baseUrl));
  assert.equal(missing.status, 404);
});
