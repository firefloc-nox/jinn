import type { IncomingMessage as HttpRequest, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ApiContext } from '../gateway/api.js';
import {
  listBoards,
  getBoard,
  createBoard,
  updateBoardConfig,
  deleteBoard,
  getCards,
  saveCards,
  patchCard,
} from './store.js';
import type { BoardCard, BoardColumn } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

function badRequest(res: ServerResponse, message: string): void {
  json(res, { error: message }, 400);
}

function serverError(res: ServerResponse, message: string): void {
  json(res, { error: message }, 500);
}

function noContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

function readBody(req: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function readJsonBody(
  req: HttpRequest,
  res: ServerResponse,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> {
  const raw = await readBody(req);
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    badRequest(res, 'Invalid JSON in request body');
    return { ok: false };
  }
}

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function handleBoardsRequest(
  req: HttpRequest,
  res: ServerResponse,
  context: ApiContext,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  const pathname = url.split('?')[0];

  let params: Record<string, string> | null;

  try {
    // GET /api/boards
    if (method === 'GET' && pathname === '/api/boards') {
      return json(res, listBoards()), true;
    }

    // POST /api/boards
    if (method === 'POST' && pathname === '/api/boards') {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const body = parsed.body;
      if (!body.name || typeof body.name !== 'string') return badRequest(res, 'name is required'), true;
      const config = createBoard(body as Parameters<typeof createBoard>[0]);
      return json(res, config, 201), true;
    }

    // GET /api/boards/:id/cards
    params = matchRoute('/api/boards/:id/cards', pathname);
    if (method === 'GET' && params) {
      const board = getBoard(params.id);
      if (!board) return notFound(res), true;
      return json(res, getCards(params.id)), true;
    }

    // PUT /api/boards/:id/cards
    params = matchRoute('/api/boards/:id/cards', pathname);
    if (method === 'PUT' && params) {
      const board = getBoard(params.id);
      if (!board) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const cards = parsed.body as unknown as BoardCard[];
      saveCards(params.id, Array.isArray(cards) ? cards : []);
      return noContent(res), true;
    }

    // POST /api/boards/:id/cards
    params = matchRoute('/api/boards/:id/cards', pathname);
    if (method === 'POST' && params) {
      const boardId = params.id;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const body = parsed.body;
      if (!body.title || typeof body.title !== 'string') return badRequest(res, 'title is required'), true;
      if (!body.columnId || typeof body.columnId !== 'string') return badRequest(res, 'columnId is required'), true;
      const now = new Date().toISOString();
      const card: BoardCard = {
        id: randomUUID(),
        title: body.title as string,
        description: body.description as string | undefined,
        columnId: body.columnId as string,
        priority: body.priority as BoardCard['priority'],
        assigneeId: body.assigneeId as string | undefined,
        workState: body.workState as BoardCard['workState'],
        createdAt: now,
        updatedAt: now,
        metadata: body.metadata as Record<string, unknown> | undefined,
      };
      const cards = getCards(boardId);
      cards.push(card);
      saveCards(boardId, cards);
      context.emit('board:card_added', { boardId, card });
      return json(res, card, 201), true;
    }

    // PATCH /api/boards/:id/cards/:cardId
    params = matchRoute('/api/boards/:id/cards/:cardId', pathname);
    if (method === 'PATCH' && params) {
      const { id: boardId, cardId } = params;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const oldCards = getCards(boardId);
      const oldCard = oldCards.find((c) => c.id === cardId);
      if (!oldCard) return notFound(res), true;
      const updated = patchCard(boardId, cardId, parsed.body as Partial<BoardCard>);
      if (!updated) return notFound(res), true;
      if (parsed.body.columnId && parsed.body.columnId !== oldCard.columnId) {
        context.emit('board:card_moved', { boardId, card: updated, from: oldCard.columnId, to: updated.columnId });
      }
      return json(res, updated), true;
    }

    // DELETE /api/boards/:id/cards/:cardId
    params = matchRoute('/api/boards/:id/cards/:cardId', pathname);
    if (method === 'DELETE' && params) {
      const { id: boardId, cardId } = params;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const cards = getCards(boardId);
      const idx = cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return notFound(res), true;
      cards.splice(idx, 1);
      saveCards(boardId, cards);
      return noContent(res), true;
    }

    // GET /api/boards/:id/columns
    params = matchRoute('/api/boards/:id/columns', pathname);
    if (method === 'GET' && params) {
      const board = getBoard(params.id);
      if (!board) return notFound(res), true;
      return json(res, board.config.columns), true;
    }

    // POST /api/boards/:id/columns
    params = matchRoute('/api/boards/:id/columns', pathname);
    if (method === 'POST' && params) {
      const boardId = params.id;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const body = parsed.body;
      if (!body.title || typeof body.title !== 'string') return badRequest(res, 'title is required'), true;
      const slug = (body.title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
      const newColumn: BoardColumn = {
        id: slug,
        title: body.title as string,
        color: body.color as string | undefined,
        order: board.config.columns.length,
      };
      const updated = updateBoardConfig(boardId, {
        columns: [...board.config.columns, newColumn],
      });
      if (!updated) return serverError(res, 'Failed to update board config'), true;
      return json(res, newColumn, 201), true;
    }

    // PUT /api/boards/:id/columns/reorder
    params = matchRoute('/api/boards/:id/columns/reorder', pathname);
    if (method === 'PUT' && params) {
      const boardId = params.id;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const ids = parsed.body as unknown as string[];
      if (!Array.isArray(ids)) return badRequest(res, 'body must be an array of column ids'), true;
      const colMap = new Map(board.config.columns.map((c) => [c.id, c]));
      const reordered: BoardColumn[] = ids
        .filter((id) => colMap.has(id))
        .map((id, idx) => ({ ...colMap.get(id)!, order: idx }));
      // append any columns not in the ids list at the end
      let extra = reordered.length;
      for (const col of board.config.columns) {
        if (!ids.includes(col.id)) reordered.push({ ...col, order: extra++ });
      }
      const updated = updateBoardConfig(boardId, { columns: reordered });
      if (!updated) return serverError(res, 'Failed to update board config'), true;
      return json(res, reordered), true;
    }

    // PATCH /api/boards/:id/columns/:colId
    params = matchRoute('/api/boards/:id/columns/:colId', pathname);
    if (method === 'PATCH' && params) {
      const { id: boardId, colId } = params;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const colIdx = board.config.columns.findIndex((c) => c.id === colId);
      if (colIdx === -1) return notFound(res), true;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const updatedCol: BoardColumn = {
        ...board.config.columns[colIdx],
        ...(parsed.body.title !== undefined ? { title: parsed.body.title as string } : {}),
        ...(parsed.body.color !== undefined ? { color: parsed.body.color as string } : {}),
      };
      const cols = [...board.config.columns];
      cols[colIdx] = updatedCol;
      const updated = updateBoardConfig(boardId, { columns: cols });
      if (!updated) return serverError(res, 'Failed to update board config'), true;
      return json(res, updatedCol), true;
    }

    // DELETE /api/boards/:id/columns/:colId
    params = matchRoute('/api/boards/:id/columns/:colId', pathname);
    if (method === 'DELETE' && params) {
      const { id: boardId, colId } = params;
      const board = getBoard(boardId);
      if (!board) return notFound(res), true;
      const colIdx = board.config.columns.findIndex((c) => c.id === colId);
      if (colIdx === -1) return notFound(res), true;
      const cards = getCards(boardId);
      const hasCards = cards.some((c) => c.columnId === colId);
      if (hasCards) return badRequest(res, `Cannot delete column "${colId}": it still has cards`), true;
      const cols = board.config.columns.filter((c) => c.id !== colId).map((c, i) => ({ ...c, order: i }));
      const updated = updateBoardConfig(boardId, { columns: cols });
      if (!updated) return serverError(res, 'Failed to update board config'), true;
      return noContent(res), true;
    }

    // GET /api/boards/:id
    params = matchRoute('/api/boards/:id', pathname);
    if (method === 'GET' && params) {
      const board = getBoard(params.id);
      if (!board) return notFound(res), true;
      return json(res, board), true;
    }

    // PATCH /api/boards/:id
    params = matchRoute('/api/boards/:id', pathname);
    if (method === 'PATCH' && params) {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;
      const updated = updateBoardConfig(params.id, parsed.body as Parameters<typeof updateBoardConfig>[1]);
      if (!updated) return notFound(res), true;
      return json(res, updated), true;
    }

    // DELETE /api/boards/:id
    params = matchRoute('/api/boards/:id', pathname);
    if (method === 'DELETE' && params) {
      const deleted = deleteBoard(params.id);
      if (!deleted) return notFound(res), true;
      return noContent(res), true;
    }

  } catch (err) {
    serverError(res, err instanceof Error ? err.message : String(err));
    return true;
  }

  return false;
}
