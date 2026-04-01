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
        { id: 'start', type: NodeType.TRIGGER, position: { x: 100, y: 200 }, config: {} },
        {
          id: 'agent',
          type: NodeType.AGENT,
          position: { x: 350, y: 200 },
          config: {
            employee: '',
            prompt: 'Décris ce que tu dois faire ici.',
            output_var: 'result',
          },
        },
        { id: 'end', type: NodeType.DONE, position: { x: 600, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'agent' },
        { id: 'e2', source: 'agent', target: 'end' },
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
        { id: 'start', type: NodeType.TRIGGER, position: { x: 100, y: 200 }, config: {} },
        {
          id: 'agent',
          type: NodeType.AGENT,
          position: { x: 350, y: 200 },
          config: {
            employee: '',
            prompt: 'Analyse cette carte et détermine si elle doit être approuvée. Réponds \"approved\" ou \"rejected\" suivi de ton analyse.',
            output_var: 'review',
          },
        },
        {
          id: 'condition',
          type: NodeType.CONDITION,
          position: { x: 600, y: 200 },
          config: {
            expression: 'review && review.startsWith(\"approved\")',
            true_branch: 'move-approved',
            false_branch: 'notify-rejected',
          },
        },
        {
          id: 'move-approved',
          type: NodeType.MOVE_CARD,
          position: { x: 850, y: 100 },
          config: {
            board: '',
            card_id_var: 'trigger.card.id',
            new_status: 'approved',
          },
        },
        {
          id: 'notify-rejected',
          type: NodeType.NOTIFY,
          position: { x: 850, y: 300 },
          config: {
            connector: 'discord',
            message: '❌ Carte rejetée : {{trigger.card.title}}\nRaison : {{review}}',
          },
        },
        { id: 'end', type: NodeType.DONE, position: { x: 1100, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'agent' },
        { id: 'e2', source: 'agent', target: 'condition' },
        { id: 'e3', source: 'move-approved', target: 'end' },
        { id: 'e4', source: 'notify-rejected', target: 'end' },
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
        { id: 'start', type: NodeType.CRON, position: { x: 100, y: 200 }, config: { action: 'create', schedule: '0 9 * * 1-5', name: 'daily-brief' } },
        {
          id: 'agent',
          type: NodeType.AGENT,
          position: { x: 350, y: 200 },
          config: {
            employee: '',
            prompt: 'Génère un brief quotidien résumant les tâches prioritaires et les points importants du jour.',
            output_var: 'brief',
          },
        },
        {
          id: 'notify',
          type: NodeType.NOTIFY,
          position: { x: 600, y: 200 },
          config: {
            connector: 'discord',
            message: '📋 **Brief du jour**\n{{brief}}',
          },
        },
        { id: 'end', type: NodeType.DONE, position: { x: 850, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'agent' },
        { id: 'e2', source: 'agent', target: 'notify' },
        { id: 'e3', source: 'notify', target: 'end' },
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
