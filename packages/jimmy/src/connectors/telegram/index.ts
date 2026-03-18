import TelegramBot from "node-telegram-bot-api";
import type {
  Connector,
  ConnectorCapabilities,
  ConnectorHealth,
  IncomingMessage,
  ReplyContext,
  Target,
  TelegramConnectorConfig,
  TelegramBotConfig,
} from "../../shared/types.js";
import { deriveSessionKey, buildReplyContext, isOldMessage } from "./threads.js";
import type { TelegramMessage } from "./threads.js";
import { formatResponse, downloadAttachment } from "./format.js";
import { TMP_DIR } from "../../shared/paths.js";
import { logger } from "../../shared/logger.js";
import { randomUUID } from "node:crypto";

interface BotInstance {
  bot: TelegramBot;
  employee: string | undefined;
  botId: number | null;
}

export class TelegramConnector implements Connector {
  name = "telegram";
  private bots: BotInstance[] = [];
  private handler: ((msg: IncomingMessage) => void) | null = null;
  private readonly allowedUsers: Set<string> | null;
  private readonly ignoreOldMessagesOnBoot: boolean;
  private readonly bootTimeMs = Date.now();
  private started = false;
  private lastError: string | null = null;
  /** Maps chatId → BotInstance for routing replies through the correct bot */
  private chatBotMap = new Map<string, BotInstance>();

  private readonly capabilities: ConnectorCapabilities = {
    threading: false,
    messageEdits: true,
    reactions: false,
    attachments: true,
  };

  constructor(config: TelegramConnectorConfig) {
    this.ignoreOldMessagesOnBoot = config.ignoreOldMessagesOnBoot !== false;
    const allowFrom = Array.isArray(config.allowFrom)
      ? config.allowFrom
      : typeof config.allowFrom === "string"
        ? config.allowFrom.split(",").map((v) => v.trim()).filter(Boolean)
        : [];
    this.allowedUsers = allowFrom.length > 0 ? new Set(allowFrom) : null;

    // Build list of bot instances from config
    const botConfigs: TelegramBotConfig[] = [];
    if (config.bots && config.bots.length > 0) {
      botConfigs.push(...config.bots);
    } else if (config.botToken) {
      // Single-bot backwards-compatible mode
      botConfigs.push({ botToken: config.botToken });
    }

    for (const bc of botConfigs) {
      this.bots.push({
        bot: new TelegramBot(bc.botToken, { polling: true }),
        employee: bc.employee,
        botId: null,
      });
    }
  }

  async start() {
    for (const instance of this.bots) {
      const { bot, employee } = instance;
      const label = employee ? `telegram:${employee}` : "telegram";

      // Fetch bot's own user info
      try {
        const me = await bot.getMe();
        instance.botId = me.id;
        logger.info(`[${label}] Bot identity: @${me.username} (${me.id})`);
      } catch (err) {
        logger.warn(`[${label}] Failed to get bot identity: ${err}`);
      }

      bot.on("message", async (msg) => {
        const tmsg = msg as unknown as TelegramMessage;
        logger.info(`[${label}] Received message: user=${tmsg.from?.id} chat=${tmsg.chat.id} text="${(tmsg.text || "").slice(0, 50)}"`);

        // Skip bot messages
        if (tmsg.from?.is_bot) return;
        if (!this.handler) return;
        if (this.ignoreOldMessagesOnBoot && isOldMessage(tmsg.date, this.bootTimeMs)) {
          logger.debug(`[${label}] Ignoring old message ${tmsg.message_id}`);
          return;
        }
        if (this.allowedUsers && tmsg.from && !this.allowedUsers.has(String(tmsg.from.id))) {
          logger.debug(`[${label}] Ignoring unauthorized user ${tmsg.from.id}`);
          return;
        }

        const text = tmsg.text || "";
        if (!text && !msg.document && !msg.photo) return;

        // Track which bot "owns" this chat for outbound replies
        this.chatBotMap.set(String(tmsg.chat.id), instance);

        // Append employee to session key so each bot gets its own session
        const baseKey = deriveSessionKey(tmsg);
        const sessionKey = employee ? `${baseKey}:${employee}` : baseKey;
        const replyContext = buildReplyContext(tmsg);

        // Download attachments
        const attachments = [];
        if (msg.document) {
          try {
            const fileLink = await bot.getFileLink(msg.document.file_id);
            const filename = `${randomUUID()}-${msg.document.file_name || "file"}`;
            const localPath = await downloadAttachment(fileLink, TMP_DIR, filename);
            attachments.push({
              name: msg.document.file_name || "file",
              url: fileLink,
              mimeType: msg.document.mime_type || "application/octet-stream",
              localPath,
            });
          } catch (err) {
            logger.warn(`[${label}] Failed to download document: ${err}`);
          }
        }
        if (msg.photo && msg.photo.length > 0) {
          try {
            const photo = msg.photo[msg.photo.length - 1];
            const fileLink = await bot.getFileLink(photo.file_id);
            const filename = `${randomUUID()}.jpg`;
            const localPath = await downloadAttachment(fileLink, TMP_DIR, filename);
            attachments.push({
              name: filename,
              url: fileLink,
              mimeType: "image/jpeg",
              localPath,
            });
          } catch (err) {
            logger.warn(`[${label}] Failed to download photo: ${err}`);
          }
        }

        const chatTitle = tmsg.chat.title || tmsg.chat.username || String(tmsg.chat.id);

        const incoming: IncomingMessage = {
          connector: this.name,
          source: "telegram",
          sessionKey,
          replyContext: replyContext as unknown as ReplyContext,
          messageId: String(tmsg.message_id),
          channel: String(tmsg.chat.id),
          thread: undefined,
          user: tmsg.from?.username || String(tmsg.from?.id ?? "unknown"),
          userId: String(tmsg.from?.id ?? "unknown"),
          text: (msg.caption ? `${msg.caption}\n` : "") + text,
          attachments,
          raw: msg,
          transportMeta: {
            chatType: tmsg.chat.type,
            chatTitle,
            // Pass bound employee name so server.ts can route to the right agent
            ...(employee ? { boundEmployee: employee } : {}),
          },
        };

        this.handler(incoming);
      });

      bot.on("polling_error", (err) => {
        this.lastError = err.message;
        logger.error(`[${label}] Polling error: ${err.message}`);
      });

      logger.info(`[${label}] Bot started (polling mode)`);
    }

    this.started = true;
    this.lastError = null;
    logger.info(`Telegram connector started with ${this.bots.length} bot(s)`);
  }

  async stop() {
    for (const { bot } of this.bots) {
      await bot.stopPolling();
    }
    this.started = false;
    logger.info("Telegram connector stopped");
  }

  getCapabilities(): ConnectorCapabilities {
    return this.capabilities;
  }

  getHealth(): ConnectorHealth {
    return {
      status: this.lastError ? "error" : this.started ? "running" : "stopped",
      detail: this.lastError ?? undefined,
      capabilities: this.capabilities,
    };
  }

  reconstructTarget(replyContext: ReplyContext): Target {
    return {
      channel: typeof replyContext.channel === "string" ? replyContext.channel : "",
      thread: undefined,
      messageTs: typeof replyContext.messageTs === "string" ? replyContext.messageTs : undefined,
      replyContext,
    };
  }

  /** Resolve the correct bot instance for a given chat ID */
  private getBotForChat(chatId: string): TelegramBot {
    const instance = this.chatBotMap.get(chatId);
    if (instance) return instance.bot;
    // Fallback to first bot
    return this.bots[0].bot;
  }

  async sendMessage(target: Target, text: string): Promise<string | undefined> {
    if (!text || !text.trim()) return undefined;
    const bot = this.getBotForChat(target.channel);
    const chunks = formatResponse(text);
    let lastMsgId: string | undefined;
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const sent = await bot.sendMessage(Number(target.channel), chunk);
      lastMsgId = String(sent.message_id);
    }
    return lastMsgId;
  }

  async replyMessage(target: Target, text: string): Promise<string | undefined> {
    if (!text || !text.trim()) return undefined;
    const bot = this.getBotForChat(target.channel);
    const replyToId = target.messageTs ? Number(target.messageTs) : undefined;
    const chunks = formatResponse(text);
    let lastMsgId: string | undefined;
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const sent = await bot.sendMessage(Number(target.channel), chunk, {
        reply_to_message_id: replyToId,
      });
      lastMsgId = String(sent.message_id);
    }
    return lastMsgId;
  }

  async addReaction(_target: Target, _emoji: string): Promise<void> {
    // Telegram Bot API has limited reaction support; no-op
  }

  async removeReaction(_target: Target, _emoji: string): Promise<void> {
    // No-op
  }

  async editMessage(target: Target, text: string): Promise<void> {
    if (!target.messageTs) return;
    if (!text || !text.trim()) return;
    try {
      const bot = this.getBotForChat(target.channel);
      await bot.editMessageText(text, {
        chat_id: Number(target.channel),
        message_id: Number(target.messageTs),
      });
    } catch (err) {
      logger.warn(`[telegram] Failed to edit message: ${err}`);
    }
  }

  async setTypingStatus(channelId: string): Promise<void> {
    try {
      const bot = this.getBotForChat(channelId);
      await bot.sendChatAction(Number(channelId), "typing");
    } catch (err) {
      logger.debug(`[telegram] Typing status failed: ${err}`);
    }
  }

  onMessage(handler: (msg: IncomingMessage) => void) {
    this.handler = handler;
  }
}
