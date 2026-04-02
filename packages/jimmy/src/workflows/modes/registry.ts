import type { WorkflowDefinition } from '../types.js'
import type { RunContext } from '../types.js'

export interface ModeNodeHandler {
  type: string          // ex: 'discord.send'
  category: string      // ex: 'discord'
  label: string
  description: string
  configSchema: Record<string, { type: string; required?: boolean; description?: string }>
  execute: (config: Record<string, unknown>, context: RunContext) => Promise<unknown>
}

export interface ModeDefinition {
  id: string
  label: string
  icon: string
  requiredConfig: string[]   // dotpaths dans config.yaml, ex: ['discord.bot_token']
  nodes: ModeNodeHandler[]
  templates: WorkflowTemplate[]
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  mode: string
  definition: WorkflowDefinition
}

class ModeRegistry {
  private modes = new Map<string, ModeDefinition>()

  register(mode: ModeDefinition) {
    this.modes.set(mode.id, mode)
  }

  getMode(id: string) { return this.modes.get(id) }
  listModes() { return Array.from(this.modes.values()) }

  getAvailableNodes(config: Record<string, unknown>): ModeNodeHandler[] {
    const result: ModeNodeHandler[] = []
    for (const mode of this.modes.values()) {
      // check required config keys exist
      const available = mode.requiredConfig.every(key => {
        const parts = key.split('.')
        let obj: unknown = config
        for (const p of parts) { obj = (obj as Record<string, unknown>)?.[p] }
        return Boolean(obj)
      })
      if (available) result.push(...mode.nodes)
    }
    return result
  }

  getTemplates(): WorkflowTemplate[] {
    return Array.from(this.modes.values()).flatMap(m => m.templates)
  }
}

export const modeRegistry = new ModeRegistry()
