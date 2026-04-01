import { NodeType, TriggerType } from '../types.js'
import { modeRegistry, type WorkflowTemplate } from './registry.js'

/**
 * General-purpose workflow templates (no mode required)
 */
const generalTemplates: WorkflowTemplate[] = [
  {
    id: 'simple-agent',
    name: 'Simple Agent',
    description: 'Template vide pour démarrer : Trigger → Agent → Done',
    mode: 'general',
    definition: {
      id: 'simple-agent',
      name: 'Simple Agent',
      version: 1,
      enabled: false,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'agent',
          type: NodeType.AGENT,
          config: {
            employee: '',
            prompt: 'Décris ce que tu dois faire ici.',
            output_var: 'result',
          },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { from: 'start', to: 'agent' },
        { from: 'agent', to: 'end' },
      ],
    },
  },
  {
    id: 'review-pipeline',
    name: 'Review Pipeline',
    description: "Pipeline de revue : Agent analyse puis approuve ou rejette une carte",
    mode: 'general',
    definition: {
      id: 'review-pipeline',
      name: 'Review Pipeline',
      version: 1,
      enabled: false,
      trigger: { type: TriggerType.kanban_card_added },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'agent',
          type: NodeType.AGENT,
          config: {
            employee: '',
            prompt: 'Analyse cette carte et détermine si elle doit être approuvée. Réponds "approved" ou "rejected" suivi de ton analyse.',
            output_var: 'review',
          },
        },
        {
          id: 'condition',
          type: NodeType.CONDITION,
          config: {
            expression: 'review && review.startsWith("approved")',
            true_branch: 'move-approved',
            false_branch: 'notify-rejected',
          },
        },
        {
          id: 'move-approved',
          type: NodeType.MOVE_CARD,
          config: {
            board: '',
            card_id_var: 'trigger.card.id',
            new_status: 'approved',
          },
        },
        {
          id: 'notify-rejected',
          type: NodeType.NOTIFY,
          config: {
            connector: 'discord',
            message: '❌ Carte rejetée : {{trigger.card.title}}\nRaison : {{review}}',
          },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { from: 'start', to: 'agent' },
        { from: 'agent', to: 'condition' },
        { from: 'move-approved', to: 'end' },
        { from: 'notify-rejected', to: 'end' },
      ],
    },
  },
  {
    id: 'cron-brief',
    name: 'Brief Quotidien',
    description: 'Brief quotidien automatique : Cron → Agent → Notify',
    mode: 'general',
    definition: {
      id: 'cron-brief',
      name: 'Brief Quotidien',
      version: 1,
      enabled: false,
      trigger: { type: TriggerType.cron, cron: '0 9 * * 1-5' },
      nodes: [
        { id: 'start', type: NodeType.CRON, config: { action: 'create', schedule: '0 9 * * 1-5', name: 'daily-brief' } },
        {
          id: 'agent',
          type: NodeType.AGENT,
          config: {
            employee: '',
            prompt: 'Génère un brief quotidien résumant les tâches prioritaires et les points importants du jour.',
            output_var: 'brief',
          },
        },
        {
          id: 'notify',
          type: NodeType.NOTIFY,
          config: {
            connector: 'discord',
            message: '📋 **Brief du jour**\n{{brief}}',
          },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { from: 'start', to: 'agent' },
        { from: 'agent', to: 'notify' },
        { from: 'notify', to: 'end' },
      ],
    },
  },
]

// Register a "general" pseudo-mode to hold the general templates
modeRegistry.register({
  id: 'general',
  label: 'Général',
  icon: '⚙️',
  requiredConfig: [],
  nodes: [],
  templates: generalTemplates,
})
