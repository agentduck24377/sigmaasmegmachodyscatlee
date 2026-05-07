# LSD Discord Auth Vercel App

This is the separate Vercel auth project.

Flow:

1. Run the Python Discord bot from the separate `../bot` folder.
2. Authorized users create accounts with `.makeacc username password` or `.makeacc username,password` in channel `1502021548939284510`.
3. The bot posts a hashed account record into that channel.
4. The Vercel API reads the channel through the Discord bot token and verifies login requests.
5. On first successful login, the API posts an `LSD_CLAIM_V1` record that binds the account to the client's hashed device ID.
6. The C++ app posts username/password plus a hashed device ID to `/api/login`.

## Setup

Copy `.env.example` to `.env` locally and set your bot token:

```powershell
Copy-Item .env.example .env
```

Set the same variables in Vercel Project Settings:

```text
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=1502019388105031772
DISCORD_CHANNEL_ID=1502021548939284510
ALLOWED_CREATOR_IDS=871321289854435338,1461023963290407108
DISCORD_FETCH_LIMIT=100
```

The bot needs **Message Content Intent** enabled in the Discord Developer Portal and access to the account channel.

## Run The Account Bot

```powershell
cd ..
python -m pip install -r bot\requirements.txt
python bot\make_accounts_bot.py
```

Create accounts in your Discord server:

```text
.makeacc username password
```

Comma format also works:

```text
.makeacc username,password
```

The bot replies to your command with a success message, then stores the account details in channel `1502021548939284510` for the Vercel backend.

## Seed Test Account

This creates `duck / duck` in channel `1502021548939284510` and exits:

```powershell
cd ..
python bot\make_accounts_bot.py --seed-duck
```

If you just want to test without running the bot command, paste the contents of `duck_account_record.txt` into channel `1502021548939284510`.

## Run Vercel Locally

```powershell
npx vercel dev
```

Hosted API:

```text
https://fewwefwfefwewfefewwefefwfewfe.vercel.app/api/login
```

Hosted frontend dashboard:

```text
https://fewwefwfefwewfefewwefefwfewfe.vercel.app
```

Deploy:

```powershell
npx vercel --prod
```

The current deployed API URL for `auth_endpoint.txt` is:

```text
https://fewwefwfefwewfefewwefefwfewfe.vercel.app/api/login
```
