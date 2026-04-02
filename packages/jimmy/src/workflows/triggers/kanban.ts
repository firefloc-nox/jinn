// Écoute l'event 'board:card_moved' émis par le gateway
// Quand un event arrive : parcourir tous les workflows actifs
// Si un workflow a trigger.type === 'kanban_card_moved' ET
//   (trigger.board === event.board ou pas de filtre)
//   (trigger.to_column === event.to ou pas de filtre)
// → workflowEngine.trigger(workflowId, payload)
import type EventEmitter from 'node:events';
import { workflowEngine } from '../engine.js';

export type GatewayEventBus = Pick<EventEmitter, 'on' | 'off' | 'emit'>;

export function registerKanbanTriggers(bus: GatewayEventBus) {
  bus.on('board:card_moved', (data: { board: string; cardId: string; from: string; to: string }) => {
    const workflows = workflowEngine.listWorkflows();
    for (const wf of workflows) {
      if (!wf.enabled) continue;
      const t = wf.trigger as { type: string; board?: string; to_column?: string };
      if (t.type !== 'kanban_card_moved') continue;
      if (t.board && t.board !== data.board) continue;
      if (t.to_column && t.to_column !== data.to) continue;
      workflowEngine.trigger(wf.id, {
        type: 'kanban_card_moved',
        data: { board: data.board, cardId: data.cardId, from: data.from, to: data.to },
      }).catch(() => {});
    }
  });

  bus.on('board:card_added', (data: { board: string; cardId: string; title: string }) => {
    const workflows = workflowEngine.listWorkflows();
    for (const wf of workflows) {
      if (!wf.enabled) continue;
      const t = wf.trigger as { type: string; board?: string };
      if (t.type !== 'kanban_card_added') continue;
      if (t.board && t.board !== data.board) continue;
      workflowEngine.trigger(wf.id, {
        type: 'kanban_card_added',
        data,
      }).catch(() => {});
    }
  });
}
