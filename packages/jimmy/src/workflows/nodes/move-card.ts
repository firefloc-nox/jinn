import fs from 'node:fs';
import path from 'node:path';
import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext, MoveCardNodeConfig } from '../types.js';
import { ORG_DIR } from '../../shared/paths.js';
import { logger } from '../../shared/logger.js';

export const moveCardHandler: NodeHandler = {
  type: NodeType.MOVE_CARD,
  label: 'Move Card',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    const config = node.config as MoveCardNodeConfig;
    const { board, new_status } = config;

    if (!board) throw new Error('move_card node requires config.board');
    if (!new_status) throw new Error('move_card node requires config.new_status');

    // Resolve card_id — can be directly specified or via context variable
    let cardId: string | undefined = config.card_id;
    if (!cardId && config.card_id_var) {
      cardId = String(context[config.card_id_var] ?? '');
    }
    // Fallback: try to get from trigger payload
    if (!cardId && context.trigger?.card?.id) {
      cardId = String(context.trigger.card.id);
    }
    if (!cardId) throw new Error('move_card node requires card_id, card_id_var, or trigger.card.id');

    const boardPath = path.join(ORG_DIR, board, 'board.json');
    if (!fs.existsSync(boardPath)) {
      throw new Error(`Board not found: ${boardPath}`);
    }

    const boardData = JSON.parse(fs.readFileSync(boardPath, 'utf-8')) as {
      cards?: Array<{ id: string; status: string; [key: string]: unknown }>;
      [key: string]: unknown;
    };

    const cards = boardData.cards;
    if (!Array.isArray(cards)) throw new Error(`Board "${board}" has no cards array`);

    const cardIdx = cards.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) throw new Error(`Card "${cardId}" not found in board "${board}"`);

    const card = cards[cardIdx];
    const oldStatus = card.status;
    card.status = new_status;
    cards[cardIdx] = card;

    fs.writeFileSync(boardPath, JSON.stringify(boardData, null, 2));
    logger.info(`[workflow:move_card] Moved card "${cardId}" on board "${board}" from "${oldStatus}" to "${new_status}"`);

    // Update context with card info
    context['last_moved_card'] = { id: cardId, board, from: oldStatus, to: new_status };

    return {
      output: { cardId, board, from: oldStatus, to: new_status },
      next: null,
    };
  },
};
