/**
 * Auto-dispatch: automatically trigger sessions when cards move to specific columns.
 * 
 * When a card is moved to a column with autoDispatch.enabled = true:
 * 1. Create a new session with the configured employee/runtime/model
 * 2. Use the promptTemplate with card data substituted
 * 3. Link the session to the card
 * 4. Optionally set card workState to 'working'
 */
import { randomUUID } from 'node:crypto';
import type EventEmitter from 'node:events';
import { getBoard, patchCard } from './store.js';
import type { BoardCard, AutoDispatchConfig } from './types.js';
import { logger } from '../shared/logger.js';

export type GatewayEventBus = Pick<EventEmitter, 'on' | 'off' | 'emit'>;

export interface AutoDispatchContext {
  /** Function to create and run a session */
  createSession: (opts: CreateSessionOpts) => Promise<{ sessionId: string }>;
}

export interface CreateSessionOpts {
  prompt: string;
  employee?: string;
  engine?: string;
  model?: string;
  title?: string;
  source: string;
  sourceRef: string;
  metadata?: Record<string, unknown>;
}

/**
 * Build prompt from template with card data substitution.
 * Supported placeholders:
 * - {{card.title}} - Card title
 * - {{card.description}} - Card description (or empty string)
 * - {{card.id}} - Card ID
 * - {{card.priority}} - Card priority (or empty string)
 * - {{board.name}} - Board name
 * - {{column.title}} - Target column title
 */
export function buildPromptFromTemplate(
  template: string,
  card: BoardCard,
  boardName: string,
  columnTitle: string,
): string {
  return template
    .replace(/\{\{card\.title\}\}/g, card.title)
    .replace(/\{\{card\.description\}\}/g, card.description ?? '')
    .replace(/\{\{card\.id\}\}/g, card.id)
    .replace(/\{\{card\.priority\}\}/g, card.priority ?? '')
    .replace(/\{\{board\.name\}\}/g, boardName)
    .replace(/\{\{column\.title\}\}/g, columnTitle);
}

const DEFAULT_PROMPT_TEMPLATE = `Task: {{card.title}}

{{card.description}}

Please work on this task from the kanban board.`;

/**
 * Handle auto-dispatch when a card is moved to a column with autoDispatch enabled.
 */
export async function handleAutoDispatch(
  boardId: string,
  card: BoardCard,
  toColumnId: string,
  context: AutoDispatchContext,
): Promise<{ sessionId: string } | null> {
  const board = getBoard(boardId);
  if (!board) {
    logger.warn(`[auto-dispatch] Board ${boardId} not found`);
    return null;
  }

  const column = board.config.columns.find(c => c.id === toColumnId);
  if (!column) {
    logger.warn(`[auto-dispatch] Column ${toColumnId} not found in board ${boardId}`);
    return null;
  }

  const config = column.autoDispatch;
  if (!config?.enabled) {
    return null;
  }

  logger.info(`[auto-dispatch] Triggering session for card ${card.id} moved to column ${toColumnId}`);

  const template = config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  const prompt = buildPromptFromTemplate(template, card, board.config.name, column.title);

  try {
    // Create the session
    const result = await context.createSession({
      prompt,
      employee: config.employee,
      engine: config.runtime,
      model: config.model,
      title: `Kanban: ${card.title}`,
      source: 'kanban',
      sourceRef: `${boardId}:${card.id}`,
      metadata: {
        boardId,
        cardId: card.id,
        columnId: toColumnId,
        autoDispatch: true,
      },
    });

    // Link session to card and optionally set working state
    const cardPatch: Partial<BoardCard> = {
      sessionId: result.sessionId,
    };
    if (config.setWorkingState) {
      cardPatch.workState = 'working';
    }
    patchCard(boardId, card.id, cardPatch);

    logger.info(`[auto-dispatch] Created session ${result.sessionId} for card ${card.id}`);
    return result;
  } catch (err) {
    logger.error(`[auto-dispatch] Failed to create session for card ${card.id}: ${err}`);
    return null;
  }
}

/**
 * Register auto-dispatch listener on the event bus.
 * Listens for 'board:card_moved' events and triggers sessions when appropriate.
 */
export function registerAutoDispatch(bus: GatewayEventBus, context: AutoDispatchContext): void {
  bus.on('board:card_moved', async (data: {
    boardId: string;
    card: BoardCard;
    from: string;
    to: string;
  }) => {
    await handleAutoDispatch(data.boardId, data.card, data.to, context);
  });
}
