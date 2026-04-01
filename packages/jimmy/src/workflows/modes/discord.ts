import { NodeType, TriggerType } from '../types.js'
import { modeRegistry, type ModeDefinition } from './registry.js'

const discordMode: ModeDefinition = {
  id: 'discord',
  label: 'Discord',
  icon: '🎮',
  requiredConfig: [],  // pas de config requise — utilise notifyDiscordChannel existant
  nodes: [
    {
      type: 'discord.send',
      category: 'discord',
      label: 'Send Message',
      description: 'Envoie un message dans un channel Discord',
      configSchema: {
        channel_id: { type: 'string', required: true, description: 'ID du channel Discord' },
        message: { type: 'string', required: true, description: 'Message (supporte {{variables}})' },
        embed_title: { type: 'string', description: "Titre de l'embed (optionnel)" },
      },
      execute: async (config, ctx) => {
        // Interpolation des templates
        function interpolate(template: string): string {
          return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
            const parts = (key as string).trim().split('.')
            let val: unknown = ctx
            for (const p of parts) val = (val as Record<string, unknown>)?.[p]
            return val !== undefined ? String(val) : `{{${key as string}}}`
          })
        }
        const message = interpolate(String(config.message ?? ''))
        const channelId = String(config.channel_id)
        const token = (ctx as unknown as Record<string, unknown>).discordBotToken as string | undefined
        if (!token) return { error: 'No discord bot token configured' }

        const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        })
        const data = await resp.json() as Record<string, unknown>
        return { message_id: data.id, status: resp.status }
      },
    },
    {
      type: 'discord.notify',
      category: 'discord',
      label: 'Notify Channel',
      description: 'Envoie une notification via le connector Discord de Jinn',
      configSchema: {
        message: { type: 'string', required: true, description: 'Message (supporte {{variables}})' },
      },
      execute: async (config, ctx) => {
        function interpolate(template: string): string {
          return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
            const parts = (key as string).trim().split('.')
            let val: unknown = ctx
            for (const p of parts) val = (val as Record<string, unknown>)?.[p]
            return val !== undefined ? String(val) : `{{${key as string}}}`
          })
        }
        const message = interpolate(String(config.message ?? ''))
        const notifyFn = (ctx as unknown as Record<string, unknown>).notifyDiscord as ((msg: string) => Promise<void>) | undefined
        if (notifyFn) await notifyFn(message)
        return { sent: true, message }
      },
    },
  ],
  templates: [
    {
      id: 'discord-card-notify',
      name: 'Notification Discord sur carte',
      description: 'Notifie un channel Discord quand une carte Kanban est déplacée',
      mode: 'discord',
      definition: {
        id: 'discord-card-notify',
        name: 'Notification Discord sur carte',
        version: 1,
        enabled: false,
        trigger: { type: TriggerType.kanban_card_moved },
        nodes: [
          { id: 'start', type: NodeType.TRIGGER, position: { x: 100, y: 200 }, config: {} },
          {
            id: 'notify',
            type: NodeType.NOTIFY,
            position: { x: 350, y: 200 },
            config: {
              connector: 'discord',
              message: '📌 **{{trigger.card.id}}** déplacée vers **{{trigger.to}}**',
            },
          },
          { id: 'end', type: NodeType.DONE, position: { x: 600, y: 200 }, config: {} },
        ],
        edges: [
          { from: 'start', to: 'notify' },
          { from: 'notify', to: 'end' },
        ],
      },
    },
    {
      id: 'discord-agent-notify',
      name: 'Agent + Notification Discord',
      description: 'Un agent analyse une carte puis notifie Discord',
      mode: 'discord',
      definition: {
        id: 'discord-agent-notify',
        name: 'Agent + Notification Discord',
        version: 1,
        enabled: false,
        trigger: { type: TriggerType.manual },
        nodes: [
          { id: 'start', type: NodeType.TRIGGER, position: { x: 100, y: 200 }, config: {} },
          {
            id: 'agent',
            type: NodeType.AGENT,
            position: { x: 350, y: 200 },
            config: { employee: '', prompt: 'Analyse la situation et répond brièvement.', output_var: 'analysis' },
          },
          {
            id: 'notify',
            type: NodeType.NOTIFY,
            position: { x: 600, y: 200 },
            config: { connector: 'discord', message: '🤖 **Analyse:** {{analysis}}' },
          },
          { id: 'end', type: NodeType.DONE, position: { x: 850, y: 200 }, config: {} },
        ],
        edges: [
          { from: 'start', to: 'agent' },
          { from: 'agent', to: 'notify' },
          { from: 'notify', to: 'end' },
        ],
      },
    },
  ],
}

modeRegistry.register(discordMode)
export { discordMode }
