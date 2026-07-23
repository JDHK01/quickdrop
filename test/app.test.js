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

test("reports health and exposes file administration without login", async () => {
  const health = await request("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: true, service: "quickdrop", version: "1.0.0" });
  assert.doesNotMatch(health.headers.get("content-security-policy"), /upgrade-insecure-requests/);
  assert.equal(health.headers.get("strict-transport-security"), null);

  const files = await request("/api/files");
  assert.equal(files.status, 200);
  assert.deepEqual(await files.json(), {
    files: [],
    totalBytes: 0,
    limits: { maxFileSizeMb: 1, maxFiles: 2 },
  });
});

test("uploads, lists, serves, and deletes a file", async () => {
  const form = new FormData();
  form.append("files", new Blob(["hello from quickdrop"], { type: "text/plain" }), "测试 文档.txt");

  const upload = await request("/api/files", {
    method: "POST",
    headers: { "x-quickdrop-request": "1" },
    body: form,
  });
  assert.equal(upload.status, 201);
  const payload = await upload.json();
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].originalName, "测试 文档.txt");
  assert.match(payload.files[0].id, /^[a-f0-9]{32}$/);

  const listing = await request("/api/files");
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).files.length, 1);

  const detail = await request(`/api/files/${payload.files[0].id}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).file.originalName, "测试 文档.txt");

  const rejectedRename = await request(`/api/files/${payload.files[0].id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ originalName: "新名称.txt" }),
  });
  assert.equal(rejectedRename.status, 403);

  const renamed = await request(`/api/files/${payload.files[0].id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-quickdrop-request": "1" },
    body: JSON.stringify({ originalName: "新名称.txt" }),
  });
  assert.equal(renamed.status, 200);
  const renamedFile = (await renamed.json()).file;
  assert.equal(renamedFile.originalName, "新名称.txt");
  assert.notEqual(renamedFile.url, payload.files[0].url);

  const oldUrl = payload.files[0].url.replace("http://127.0.0.1", baseUrl);
  const oldPublicFile = await fetch(oldUrl, { redirect: "manual" });
  assert.equal(oldPublicFile.status, 308);
  assert.equal(oldPublicFile.headers.get("location"), renamedFile.url);

  const publicFile = await fetch(renamedFile.url.replace("http://127.0.0.1", baseUrl));
  assert.equal(publicFile.status, 200);
  assert.equal(await publicFile.text(), "hello from quickdrop");
  assert.match(publicFile.headers.get("content-disposition"), /^attachment;/);
  assert.equal(publicFile.headers.get("access-control-allow-origin"), "*");

  const removed = await request(`/api/files/${payload.files[0].id}`, {
    method: "DELETE",
    headers: { "x-quickdrop-request": "1" },
  });
  assert.equal(removed.status, 204);

  const missing = await fetch(renamedFile.url.replace("http://127.0.0.1", baseUrl));
  assert.equal(missing.status, 404);
});
