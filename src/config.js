const path = require("node:path");

function parsePositiveInt(value, fallback, name) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
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

  const uploadPassword = String(
    overrides.uploadPassword ?? process.env.UPLOAD_PASSWORD ?? "",
  );
  const sessionSecret = String(
    overrides.sessionSecret ?? process.env.SESSION_SECRET ?? "",
  );

  if (uploadPassword.length < 12) {
    throw new Error("UPLOAD_PASSWORD must contain at least 12 characters");
  }
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }

  const maxFileSizeMb = parsePositiveInt(
    overrides.maxFileSizeMb ?? process.env.MAX_FILE_SIZE_MB,
    256,
    "MAX_FILE_SIZE_MB",
  );
  const maxFiles = parsePositiveInt(
    overrides.maxFiles ?? process.env.MAX_FILES_PER_UPLOAD,
    10,
    "MAX_FILES_PER_UPLOAD",
  );

  return {
    host: String(overrides.host ?? process.env.HOST ?? "0.0.0.0"),
    port: parsePositiveInt(overrides.port ?? process.env.PORT, 8000, "PORT"),
    dataDir: path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? "data"),
    publicBaseUrl,
    uploadPassword,
    sessionSecret,
    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxFiles,
    maxRequestBytes: maxFileSizeMb * 1024 * 1024 * maxFiles + 1024 * 1024,
    sessionTtlMs: parsePositiveInt(
      overrides.sessionTtlMs ?? process.env.SESSION_TTL_MS,
      7 * 24 * 60 * 60 * 1000,
      "SESSION_TTL_MS",
    ),
    secureCookie: parseBoolean(
      overrides.secureCookie ?? process.env.COOKIE_SECURE,
      publicBaseUrl.startsWith("https://"),
    ),
    trustProxy: parseBoolean(overrides.trustProxy ?? process.env.TRUST_PROXY, false),
  };
}

module.exports = { loadConfig };
