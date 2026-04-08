/**
 * Kanban workflow triggers for board:card_moved and board:card_added events.
 * 
 * Supports two event formats for compatibility:
 * - Legacy (gateway/api.ts): { board, cardId, from, to }
 * - New (boards/api.ts): { boardId, card, from, to }
 */
import type EventEmitter from 'node:events';
import { workflowEngine } from '../engine.js';
import type { BoardCard } from '../../boards/types.js';

export type GatewayEventBus = Pick<EventEmitter, 'on' | 'off' | 'emit'>;

/** Legacy event format from gateway/api.ts */
interface LegacyCardMovedEvent {
  board: string;
  cardId: string;
  from: string;
  to: string;
}

/** New event format from boards/api.ts */
interface NewCardMovedEvent {
  boardId: string;
  card: BoardCard;
  from: string;
  to: string;
}

type CardMovedEvent = LegacyCardMovedEvent | NewCardMovedEvent;

/** Normalize event to consistent format */
function normalizeCardMovedEvent(data: CardMovedEvent): { board: string; cardId: string; card?: BoardCard; from: string; to: string } {
  if ('boardId' in data) {
    return {
      board: data.boardId,
      cardId: data.card.id,
      card: data.card,
      from: data.from,
      to: data.to,
    };
  }
  return data;
}

/** Legacy event format from gateway/api.ts */
interface LegacyCardAddedEvent {
  board: string;
  cardId: string;
  title: string;
}

/** New event format from boards/api.ts */
interface NewCardAddedEvent {
  boardId: string;
  card: BoardCard;
}

type CardAddedEvent = LegacyCardAddedEvent | NewCardAddedEvent;

/** Normalize event to consistent format */
function normalizeCardAddedEvent(data: CardAddedEvent): { board: string; cardId: string; card?: BoardCard; title: string } {
  if ('boardId' in data) {
    return {
      board: data.boardId,
      cardId: data.card.id,
      card: data.card,
      title: data.card.title,
    };
  }
  return data;
}

export function registerKanbanTriggers(bus: GatewayEventBus) {
  bus.on('board:card_moved', (data: CardMovedEvent) => {
    const normalized = normalizeCardMovedEvent(data);
    const workflows = workflowEngine.listWorkflows();
    for (const wf of workflows) {
      if (!wf.enabled) continue;
      const t = wf.trigger as { type: string; board?: string; to_column?: string };
      if (t.type !== 'kanban_card_moved') continue;
      if (t.board && t.board !== normalized.board) continue;
      if (t.to_column && t.to_column !== normalized.to) continue;
      workflowEngine.trigger(wf.id, {
        type: 'kanban_card_moved',
        data: {
          board: normalized.board,
          cardId: normalized.cardId,
          card: normalized.card,
          from: normalized.from,
          to: normalized.to,
        },
      }).catch(() => {});
    }
  });

  bus.on('board:card_added', (data: CardAddedEvent) => {
    const normalized = normalizeCardAddedEvent(data);
    const workflows = workflowEngine.listWorkflows();
    for (const wf of workflows) {
      if (!wf.enabled) continue;
      const t = wf.trigger as { type: string; board?: string };
      if (t.type !== 'kanban_card_added') continue;
      if (t.board && t.board !== normalized.board) continue;
      workflowEngine.trigger(wf.id, {
        type: 'kanban_card_added',
        data: {
          board: normalized.board,
          cardId: normalized.cardId,
          card: normalized.card,
          title: normalized.title,
        },
      }).catch(() => {});
    }
  });
}
