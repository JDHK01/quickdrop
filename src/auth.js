const crypto = require("node:crypto");

const COOKIE_NAME = "quickdrop_session";

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function safeEqual(left, right) {
  return crypto.timingSafeEqual(digest(left), digest(right));
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return cookies;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});
}

function createAuth({ uploadPassword, sessionSecret, sessionTtlMs, secureCookie }) {
  function signature(payload) {
    return crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  }

  function createToken() {
    const payload = Buffer.from(
      JSON.stringify({ exp: Date.now() + sessionTtlMs, nonce: crypto.randomUUID() }),
    ).toString("base64url");
    return `${payload}.${signature(payload)}`;
  }

  function verifyToken(token) {
    if (typeof token !== "string") return false;
    const [payload, suppliedSignature, extra] = token.split(".");
    if (!payload || !suppliedSignature || extra) return false;
    if (!safeEqual(suppliedSignature, signature(payload))) return false;

    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return Number.isFinite(parsed.exp) && parsed.exp > Date.now();
    } catch {
      return false;
    }
  }

  function isAuthenticated(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    return verifyToken(token);
  }

  function setSessionCookie(res) {
    const attributes = [
      `${COOKIE_NAME}=${encodeURIComponent(createToken())}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
      "Priority=High",
    ];
    if (secureCookie) attributes.push("Secure");
    res.setHeader("Set-Cookie", attributes.join("; "));
  }

  function clearSessionCookie(res) {
    const attributes = [
      `${COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      "Max-Age=0",
    ];
    if (secureCookie) attributes.push("Secure");
    res.setHeader("Set-Cookie", attributes.join("; "));
  }

  function requireAuth(req, res, next) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "请先登录" } });
    }
    next();
  }

  return {
    clearSessionCookie,
    isAuthenticated,
    passwordMatches: (password) => safeEqual(password, uploadPassword),
    requireAuth,
    setSessionCookie,
  };
}

module.exports = { createAuth };
