const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mime = require("mime-types");

const ID_PATTERN = /^[a-f0-9]{32}$/;

function decodeOriginalName(name) {
  if (/[^\u0000-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("\ufffd") ? name : decoded;
}

function sanitizeOriginalName(value) {
  const decoded = decodeOriginalName(path.basename(String(value || "file")));
  const cleaned = decoded
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  return Array.from(cleaned || "file").slice(0, 180).join("");
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

class FileStore {
  constructor(dataDir, publicBaseUrl) {
    this.filesDir = path.join(dataDir, "files");
    this.metaDir = path.join(dataDir, "meta");
    this.publicBaseUrl = publicBaseUrl;
  }

  async init() {
    await Promise.all([
      fs.mkdir(this.filesDir, { recursive: true }),
      fs.mkdir(this.metaDir, { recursive: true }),
    ]);
  }

  metadataPath(id) {
    return path.join(this.metaDir, `${id}.json`);
  }

  filePath(id) {
    return path.join(this.filesDir, id);
  }

  publicUrl(id, originalName) {
    return `${this.publicBaseUrl}/f/${id}/${encodePathSegment(originalName)}`;
  }

  async writeRecord(record) {
    const storedRecord = {
      id: record.id,
      originalName: record.originalName,
      size: record.size,
      contentType: record.contentType,
      uploadedAt: record.uploadedAt,
      ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    };
    const temporaryPath = `${this.metadataPath(record.id)}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(storedRecord)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, this.metadataPath(record.id));
  }

  async saveUploaded(file) {
    if (!ID_PATTERN.test(file.filename)) {
      throw new Error("Invalid generated file id");
    }

    const originalName = sanitizeOriginalName(file.originalname);
    const record = {
      id: file.filename,
      originalName,
      size: file.size,
      contentType: mime.lookup(originalName) || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
    };

    await this.writeRecord(record);
    return this.withUrl(record);
  }

  withUrl(record) {
    return { ...record, url: this.publicUrl(record.id, record.originalName) };
  }

  async get(id) {
    if (!ID_PATTERN.test(id)) return null;
    try {
      const record = JSON.parse(await fs.readFile(this.metadataPath(id), "utf8"));
      if (record.id !== id) return null;
      return this.withUrl(record);
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async list() {
    const entries = await fs.readdir(this.metaDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.get(entry.name.slice(0, -5))),
    );
    return records
      .filter(Boolean)
      .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
  }

  async rename(id, value) {
    const current = await this.get(id);
    if (!current) return null;

    const originalName = sanitizeOriginalName(value);
    const updated = {
      id: current.id,
      originalName,
      size: current.size,
      contentType: mime.lookup(originalName) || "application/octet-stream",
      uploadedAt: current.uploadedAt,
      updatedAt: new Date().toISOString(),
    };
    await this.writeRecord(updated);
    return this.withUrl(updated);
  }

  async remove(id) {
    const record = await this.get(id);
    if (!record) return false;
    await fs.rm(this.filePath(id), { force: true });
    await fs.rm(this.metadataPath(id), { force: true });
    return true;
  }

  async cleanUpload(file) {
    if (file?.filename && ID_PATTERN.test(file.filename)) {
      await fs.rm(this.filePath(file.filename), { force: true });
      await fs.rm(this.metadataPath(file.filename), { force: true });
    }
  }
}

module.exports = { FileStore, ID_PATTERN };
