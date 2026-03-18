---
name: slack-setup
description: Walk through creating a Slack app and connecting it to {{portalName}}
---

# Slack Setup Skill

## Trigger

When the user wants to connect {{portalName}} to Slack, or asks about Slack integration.

## Overview

{{portalName}} connects to Slack via Socket Mode using `@slack/bolt`. This requires two tokens from a Slack app:

- **App-Level Token** (`xapp-...`) — for Socket Mode connection
- **Bot User OAuth Token** (`xoxb-...`) — for sending messages, reactions, etc.

## Steps

### 1. Guide the User Through Slack App Creation

Tell the user:

> To connect {{portalName}} to Slack, you need to create a Slack app. Here's how:
>
> **Create the app:**
> 1. Go to https://api.slack.com/apps
> 2. Click **Create New App** → **From scratch**
> 3. Name it `{{portalName}}` (or any name you prefer)
> 4. Select your workspace and click **Create App**
>
> **Enable Socket Mode:**
> 1. Go to **Settings → Socket Mode** in the left sidebar
> 2. Toggle **Enable Socket Mode** on
> 3. When prompted, create an app-level token with the scope `connections:write`
> 4. Name it `socket-token` and click **Generate**
> 5. Copy the `xapp-...` token — this is your **App Token**
>
> **Set Bot Permissions:**
> 1. Go to **Features → OAuth & Permissions**
> 2. Under **Bot Token Scopes**, add these scopes:
>    - `chat:write` — send messages
>    - `channels:history` — read channel messages
>    - `channels:read` — resolve channel names
>    - `groups:history` — read private channel messages
>    - `groups:read` — resolve private channel names
>    - `im:history` — read DMs
>    - `im:read` — identify DM channels
>    - `reactions:read` — receive reaction events
>    - `reactions:write` — add/remove emoji reactions
>    - `files:read` — download file attachments
>    - `users:read` — resolve user info
>    - `assistant:write` — show typing indicators in threads
>
> **Enable Events:**
> 1. Go to **Features → Event Subscriptions**
> 2. Toggle **Enable Events** on
> 3. Under **Subscribe to bot events**, add:
>    - `message.channels` — messages in public channels
>    - `message.groups` — messages in private channels
>    - `message.im` — direct messages
>    - `reaction_added` — emoji reactions on messages
>
> **Install the App:**
> 1. Go to **Settings → Install App**
> 2. Click **Install to Workspace** and authorize
> 3. Copy the **Bot User OAuth Token** (`xoxb-...`) — this is your **Bot Token**

### 2. Collect Tokens

Ask the user to paste both tokens:
1. The **App Token** (`xapp-...`)
2. The **Bot Token** (`xoxb-...`)

### 3. Update Configuration

Write the tokens to `~/.jinn/config.yaml` under the `connectors.slack` section:

```yaml
connectors:
  slack:
    appToken: xapp-1-...
    botToken: xoxb-...
    shareSessionInChannel: false
    ignoreOldMessagesOnBoot: true
```

The gateway will hot-reload the config automatically.

### 4. Optional: Restrict Access

If the user wants to limit which Slack users can interact with {{portalName}}, ask for their Slack user IDs and add them:

```yaml
connectors:
  slack:
    appToken: xapp-1-...
    botToken: xoxb-...
    allowFrom:
      - U01ABC123    # User's Slack ID
```

To find a Slack user ID: click on a user's profile in Slack → click the `⋮` menu → **Copy member ID**.

### 5. Verify Connection

Tell the user to restart the gateway (or it will auto-reload), then:
1. Invite the bot to a channel: `/invite @{{portalName}}`
2. Send a test message mentioning or DMing the bot
3. The bot should react with :eyes: and then respond

### 6. Explain Agent Routing

Explain how agents work with Slack:
- **Default**: All messages route to {{portalName}} (the executive/COO)
- **@mentions**: Type `@dev do X` to route directly to the dev agent
- **Threads**: Replies in a thread continue with the same agent
- **Reactions**: React with an emoji to trigger {{portalName}} to interpret the reaction

### 7. Optional: Set Up Cron Alerts

Ask if the user wants cron job results delivered to Slack:

```yaml
cron:
  alertConnector: slack
  alertChannel: "#alerts"    # or any channel the bot is in
```

## Error Handling

- If tokens are invalid, the gateway logs will show authentication errors — tell the user to double-check their tokens
- If the bot doesn't respond in a channel, it probably hasn't been invited — use `/invite @BotName`
- If Socket Mode fails, verify the app-level token has `connections:write` scope
- If reactions don't trigger responses, verify `reaction_added` is in the event subscriptions
