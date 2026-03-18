# Connectors

Connectors are modular adapters that bridge external messaging platforms with {{portalName}}'s session manager.

## Connector Interface

```typescript
interface Connector {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(sourceRef: string, text: string): Promise<void>;
  addReaction(sourceRef: string, emoji: string): Promise<void>;
  removeReaction(sourceRef: string, emoji: string): Promise<void>;
  editMessage(sourceRef: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
}

interface IncomingMessage {
  sourceRef: string;     // Unique identifier for routing
  text: string;          // Message content
  userId: string;        // Platform user ID
  userName: string;      // Display name
  connector: string;     // Connector name
}
```

## Slack Connector

Uses `@slack/bolt` with Socket Mode (no public URL required).

### Configuration

```yaml
connectors:
  slack:
    appToken: xapp-...    # Socket Mode app token
    botToken: xoxb-...    # Bot user OAuth token
    allowFrom: []          # Optional: restrict to specific Slack user IDs
    shareSessionInChannel: false
    ignoreOldMessagesOnBoot: true
```

### Required Slack App Setup

1. Create a Slack app at https://api.slack.com/apps
2. Enable **Socket Mode** and generate an app-level token (`xapp-...`) with `connections:write` scope
3. Add **Bot Token Scopes**: `chat:write`, `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `reactions:read`, `reactions:write`, `files:read`, `users:read`, `assistant:write`
4. Subscribe to **Bot Events**: `message.channels`, `message.groups`, `message.im`, `reaction_added`
5. Install the app to your workspace and copy the Bot User OAuth Token (`xoxb-...`)

For a full walkthrough, use the `slack-setup` skill.

### Thread Mapping

Slack messages are mapped to sessions based on conversation context:

| Slack Context | Source Ref Format | Session Behavior |
|---|---|---|
| Direct message | `slack:dm:<userId>` | One session per DM user |
| Channel root message | `slack:<channelId>` | One session per channel |
| Thread reply | `slack:<channelId>:<threadTs>` | One session per thread |

### Reaction Workflow

Reactions provide visual feedback during processing:

1. Message received → add :eyes: reaction (acknowledged)
2. Engine processing...
3. On success → remove :eyes:, add :white_check_mark:
4. On error → remove :eyes:, add :x:

### Employee Routing

- Default: messages route to the default employee ({{portalName}})
- `@mention`: messages mentioning a specific employee name route to that employee
- Thread continuity: replies in a thread continue with the same employee

## Discord Connector

Uses `discord.js` with a bot token. Supports both direct integration and remote proxy mode.

### Configuration

```yaml
connectors:
  discord:
    botToken: ...           # Discord bot token
    guildId: ...            # Optional: restrict to a specific server
    allowFrom: []           # Optional: restrict to specific Discord user IDs
    ignoreOldMessagesOnBoot: true
```

## WhatsApp Connector

Uses `@whiskeysockets/baileys` for unofficial WhatsApp Web integration via QR code authentication.

### Configuration

```yaml
connectors:
  whatsapp:
    allowFrom: []           # Optional: restrict to specific phone numbers
```

## Telegram Connector

Uses `node-telegram-bot-api` with long polling (no webhook URL required).

### Configuration

**Single bot mode:**

```yaml
connectors:
  telegram:
    botToken: "123456:ABC-..."    # Bot token from @BotFather
    allowFrom: []                  # Optional: restrict to specific Telegram user IDs
    ignoreOldMessagesOnBoot: true
```

**Team mode (multiple bots, each bound to an agent):**

```yaml
connectors:
  telegram:
    bots:
      - botToken: "123456:ABC-..."
        employee: gentech          # All messages to this bot route to gentech
      - botToken: "654321:DEF-..."
        employee: yoyo
      - botToken: "789012:GHI-..."
        employee: dmob
    ignoreOldMessagesOnBoot: true
```

In team mode, each bot runs its own polling loop. Messages sent to a bot are automatically routed to the bound employee — no `@mention` needed. Each bot gets its own session per chat.

### Required Setup

1. Message `@BotFather` on Telegram
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Add the token to `config.yaml` under `connectors.telegram.botToken`

For a full walkthrough, use the `telegram-setup` skill.

### Session Mapping

| Context | Session Key | Behavior |
|---|---|---|
| Private chat (DM) | `telegram:dm:<userId>` | One session per user |
| Group/supergroup | `telegram:<chatId>` | One session per group |

### Capabilities

- **Threading**: Not supported (Telegram groups use flat messages)
- **Message edits**: Supported (bot can edit its own messages)
- **Reactions**: Not supported via Bot API
- **Attachments**: Supported (documents, photos)
- **Typing indicator**: Supported (`sendChatAction("typing")`)

### Employee Routing

- Default: messages route to the default employee ({{portalName}})
- `@mention`: messages mentioning a specific employee name route to that employee

## Future Connectors

The connector interface is designed for additional platforms:
- **iMessage**: macOS-only via AppleScript bridge
- **Email**: IMAP/SMTP integration
- **Webhooks**: Generic HTTP webhook receiver
