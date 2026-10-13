const path = require("node:path");

function parsePositiveInt(value, fallback, name) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function loadConfig(overrides = {}) {
  const publicBaseUrl = String(
    overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:8000",
  ).replace(/\/+$/, "");

  try {
    new URL(publicBaseUrl);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an absolute URL");
  }

  const maxFiles = parsePositiveInt(
    overrides.maxFiles ?? process.env.MAX_FILES_PER_UPLOAD,
    10,
    "MAX_FILES_PER_UPLOAD",
  );
  const maxPreviewChars = parsePositiveInt(
    overrides.maxPreviewChars ?? process.env.MAX_PREVIEW_CHARS,
    65536,
    "MAX_PREVIEW_CHARS",
  );

  return {
    host: String(overrides.host ?? process.env.HOST ?? "0.0.0.0"),
    port: parsePositiveInt(overrides.port ?? process.env.PORT, 8000, "PORT"),
    dataDir: path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? "data"),
    publicBaseUrl,
    httpsEnabled: publicBaseUrl.startsWith("https://"),
    maxFiles,
    maxPreviewChars,
  };
}

module.exports = { loadConfig };
