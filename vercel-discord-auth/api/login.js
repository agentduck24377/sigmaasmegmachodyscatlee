const crypto = require("crypto");

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "1502021548939284510";
const FETCH_LIMIT = Math.max(1, Math.min(Number(process.env.DISCORD_FETCH_LIMIT || 100), 100));
const RECORD_MARKER = "LSD_ACCOUNT_V1";
const CLAIM_MARKER = "LSD_CLAIM_V1";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeHwid(value) {
  return String(value || "").trim().toLowerCase();
}

function safeEqual(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(String(a));
  if (!Buffer.isBuffer(b)) b = Buffer.from(String(b));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, record) {
  if (!record || record.algo !== "pbkdf2_sha256") {
    return false;
  }

  const iterations = Number(record.iterations || 200000);
  const salt = Buffer.from(String(record.salt || ""), "base64");
  const expected = Buffer.from(String(record.hash || ""), "base64");
  if (!salt.length || !expected.length || !Number.isFinite(iterations)) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, "sha256");
  return safeEqual(actual, expected);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function extractJsonObjects(content) {
  return content.match(/\{[\s\S]*?\}/g) || [];
}

function extractRecordsFromContent(content) {
  const records = [];
  if (!content || !content.includes(RECORD_MARKER)) {
    return records;
  }

  const jsonMatches = extractJsonObjects(content);
  for (const rawJson of jsonMatches) {
    try {
      const record = JSON.parse(rawJson);
      if (normalizeUsername(record.username)) {
        records.push(record);
      }
    } catch {
      // Ignore non-account JSON in the same channel.
    }
  }
  return records;
}

function extractClaimsFromContent(content) {
  const claims = [];
  if (!content || !content.includes(CLAIM_MARKER)) {
    return claims;
  }

  const jsonMatches = extractJsonObjects(content);
  for (const rawJson of jsonMatches) {
    try {
      const claim = JSON.parse(rawJson);
      const username = normalizeUsername(claim.username);
      const hwidHash = normalizeHwid(claim.hwidHash);
      if (username && hwidHash) {
        claims.push({
          username,
          hwidHash,
          claimedAt: String(claim.claimedAt || ""),
        });
      }
    } catch {
      // Ignore non-claim JSON in the same channel.
    }
  }
  return claims;
}

async function discordRequest(path, options = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === "replace_me") {
    throw new Error("DISCORD_BOT_TOKEN is not set");
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord request failed: ${response.status} ${body.slice(0, 120)}`);
  }

  return response;
}

async function fetchDiscordState() {
  const response = await discordRequest(`/channels/${CHANNEL_ID}/messages?limit=${FETCH_LIMIT}`);
  const messages = await response.json();
  const accounts = [];
  const claims = [];

  for (const message of messages) {
    accounts.push(...extractRecordsFromContent(message.content || ""));
    claims.push(...extractClaimsFromContent(message.content || ""));
  }

  return { accounts, claims };
}

async function postClaim(username, hwidHash) {
  const claim = {
    username: normalizeUsername(username),
    hwidHash: normalizeHwid(hwidHash),
    claimedAt: new Date().toISOString(),
  };
  const content = `${CLAIM_MARKER}\n\`\`\`json\n${JSON.stringify(claim)}\n\`\`\``;

  await discordRequest(`/channels/${CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
}

function findAccount(accounts, username) {
  const normalized = normalizeUsername(username);

  for (const record of accounts) {
    if (normalizeUsername(record.username) === normalized) {
      return record;
    }
  }
  return null;
}

function findClaim(claims, username) {
  const normalized = normalizeUsername(username);

  for (const claim of claims) {
    if (normalizeUsername(claim.username) === normalized) {
      return claim;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return res.status(400).json({ ok: false, error: "bad_json" });
  }

  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");
  const hwidHash = normalizeHwid(payload.hwid || payload.hwidHash);
  if (!username || !password || !hwidHash) {
    return res.status(400).json({ ok: false, error: "missing_credentials" });
  }

  try {
    const { accounts, claims } = await fetchDiscordState();
    const account = findAccount(accounts, username);
    if (!account || !verifyPassword(password, account)) {
      return res.status(401).json({
        ok: false,
        error: "invalid_credentials",
      });
    }

    const claim = findClaim(claims, username);
    if (claim && claim.hwidHash !== hwidHash) {
      return res.status(423).json({
        ok: false,
        error: "account_claimed",
        message: "This account has already been claimed on another device.",
      });
    }

    if (!claim) {
      await postClaim(username, hwidHash);
      return res.status(200).json({
        ok: true,
        username,
        claimed: true,
        message: "valid",
      });
    }

    return res.status(200).json({
      ok: true,
      username,
      claimed: true,
      message: "valid",
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "discord_lookup_failed",
      detail: error.message,
    });
  }
};
