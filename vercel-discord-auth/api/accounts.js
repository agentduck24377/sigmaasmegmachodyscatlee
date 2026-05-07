const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "1502021548939284510";
const FETCH_LIMIT = Math.max(1, Math.min(Number(process.env.DISCORD_FETCH_LIMIT || 100), 100));
const RECORD_MARKER = "LSD_ACCOUNT_V1";
const CLAIM_MARKER = "LSD_CLAIM_V1";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
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
      const username = normalizeUsername(record.username);
      if (username) {
        records.push({
          username,
          createdBy: String(record.createdBy || ""),
          algo: String(record.algo || ""),
        });
      }
    } catch {
      // Ignore messages that have the marker but not a valid account JSON object.
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
      if (username && claim.hwidHash) {
        claims.push({
          username,
          claimedAt: String(claim.claimedAt || ""),
        });
      }
    } catch {
      // Ignore messages that have the marker but not a valid claim JSON object.
    }
  }
  return claims;
}

async function fetchDiscordRecords() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === "replace_me") {
    throw new Error("DISCORD_BOT_TOKEN is not set");
  }

  const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${FETCH_LIMIT}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord fetch failed: ${response.status} ${body.slice(0, 120)}`);
  }

  const messages = await response.json();
  const records = [];
  const claims = [];
  for (const message of messages) {
    records.push(...extractRecordsFromContent(message.content || ""));
    claims.push(...extractClaimsFromContent(message.content || ""));
  }

  const claimedUsers = new Set(claims.map((claim) => claim.username));
  const seen = new Set();
  return records.filter((record) => {
    if (seen.has(record.username)) {
      return false;
    }
    seen.add(record.username);
    record.claimed = claimedUsers.has(record.username);
    return true;
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const accounts = await fetchDiscordRecords();
    return res.status(200).json({
      ok: true,
      channelId: CHANNEL_ID,
      count: accounts.length,
      accounts,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "discord_lookup_failed",
      detail: error.message,
    });
  }
};
