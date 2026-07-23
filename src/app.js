const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const { FileStore } = require("./storage");

const INLINE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
]);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function contentDisposition(disposition, filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback || "file"}"; filename*=UTF-8''${encoded}`;
}

function requireAppRequest(req, res, next) {
  if (req.get("x-quickdrop-request") !== "1") {
    return res.status(403).json({ error: { code: "INVALID_REQUEST", message: "请求来源无效" } });
  }
  next();
}

async function createApp(config) {
  const app = express();
  const store = new FileStore(config.dataDir, config.publicBaseUrl);
  await store.init();
  const publicDir = path.join(__dirname, "..", "public");
  const lucideDir = path.join(__dirname, "..", "node_modules", "lucide", "dist", "umd");

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          upgradeInsecureRequests: config.httpsEnabled ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.httpsEnabled ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (req, res) => {
    res.json({ status: true, service: "quickdrop", version: "1.0.0" });
  });

  app.get(
    "/api/files",
    asyncRoute(async (req, res) => {
      const files = await store.list();
      res.json({
        files,
        totalBytes: files.reduce((total, file) => total + file.size, 0),
        limits: { maxFileSizeMb: config.maxFileSizeMb, maxFiles: config.maxFiles },
      });
    }),
  );

  app.get(
    "/api/files/:id",
    asyncRoute(async (req, res) => {
      const file = await store.get(req.params.id);
      if (!file) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "文件不存在" } });
      }
      res.json({ file });
    }),
  );

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.filesDir,
      filename: (req, file, callback) => callback(null, crypto.randomBytes(16).toString("hex")),
    }),
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: config.maxFiles,
      fields: 0,
      parts: config.maxFiles,
    },
  }).array("files", config.maxFiles);

  app.post("/api/files", requireAppRequest, (req, res, next) => {
    const contentLength = Number.parseInt(req.get("content-length") || "0", 10);
    if (Number.isFinite(contentLength) && contentLength > config.maxRequestBytes) {
      return res.status(413).json({ error: { code: "REQUEST_TOO_LARGE", message: "上传内容过大" } });
    }

    upload(req, res, async (error) => {
      if (error) {
        await Promise.all((req.files || []).map((file) => store.cleanUpload(file)));
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
          error: {
            code: tooLarge ? "FILE_TOO_LARGE" : "UPLOAD_REJECTED",
            message: tooLarge ? `单个文件不能超过 ${config.maxFileSizeMb} MB` : "上传请求无效",
          },
        });
      }

      if (!req.files?.length) {
        return res.status(400).json({ error: { code: "NO_FILES", message: "请选择文件" } });
      }

      try {
        const records = [];
        for (const file of req.files) records.push(await store.saveUploaded(file));
        res.status(201).json({ files: records });
      } catch (saveError) {
        await Promise.all(req.files.map((file) => store.cleanUpload(file)));
        next(saveError);
      }
    });
  });

  app.patch(
    "/api/files/:id",
    requireAppRequest,
    asyncRoute(async (req, res) => {
      if (typeof req.body?.originalName !== "string" || !req.body.originalName.trim()) {
        return res.status(400).json({
          error: { code: "INVALID_NAME", message: "文件名不能为空" },
        });
      }
      const file = await store.rename(req.params.id, req.body.originalName);
      if (!file) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "文件不存在" } });
      }
      res.json({ file });
    }),
  );

  app.delete(
    "/api/files/:id",
    requireAppRequest,
    asyncRoute(async (req, res) => {
      if (!(await store.remove(req.params.id))) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "文件不存在" } });
      }
      res.status(204).end();
    }),
  );

  const serveFile = asyncRoute(async (req, res) => {
    const record = await store.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "文件不存在" } });
    }
    if (req.params.name && req.params.name !== record.originalName) {
      return res.redirect(308, record.url);
    }

    const disposition = INLINE_CONTENT_TYPES.has(record.contentType) ? "inline" : "attachment";
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Disposition", contentDisposition(disposition, record.originalName));
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(record.contentType);
    res.sendFile(record.id, { root: store.filesDir, dotfiles: "deny" }, (error) => {
      if (!error) return;
      if (error.code === "ENOENT" && !res.headersSent) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "文件不存在" } });
      }
      if (!res.headersSent) return res.status(500).end();
      res.destroy();
    });
  });

  app.get(["/f/:id", "/f/:id/:name"], serveFile);
  app.use("/vendor", express.static(lucideDir, { immutable: true, maxAge: "1y" }));
  app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
  app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  app.use((req, res) => {
    const isApi = req.path.startsWith("/api/");
    res.status(404).json({
      error: { code: "NOT_FOUND", message: isApi ? "接口不存在" : "页面不存在" },
    });
  });

  app.use((error, req, res, next) => {
    console.error("Request failed", error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } });
  });

  return app;
}

module.exports = { createApp };
