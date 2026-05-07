module.exports = async function handler(req, res) {
  const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  const guildId = process.env.DISCORD_GUILD_ID || "1502019388105031772";
  const channelId = process.env.DISCORD_CHANNEL_ID || "1502021548939284510";
  const allowedCreatorIds =
    process.env.ALLOWED_CREATOR_IDS || "871321289854435338,1461023963290407108";

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "discord-auth",
    endpoints: {
      health: `${origin}/api/health`,
      login: `${origin}/api/login`,
      accounts: `${origin}/api/accounts`,
      config: `${origin}/api/config`,
    },
    discord: {
      guildId,
      channelId,
      allowedCreatorIds,
    },
    cpp: {
      authEndpointFile: "auth_endpoint.txt",
      authEndpointValue: `${origin}/api/login`,
    },
    envTemplate: [
      "DISCORD_BOT_TOKEN=your_bot_token",
      `DISCORD_GUILD_ID=${guildId}`,
      `DISCORD_CHANNEL_ID=${channelId}`,
      `ALLOWED_CREATOR_IDS=${allowedCreatorIds}`,
      `DISCORD_FETCH_LIMIT=${process.env.DISCORD_FETCH_LIMIT || "100"}`,
    ].join("\n"),
  });
};
