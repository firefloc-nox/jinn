import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock the BOARDS_DIR to point to a temp directory
let tmpDir: string;

vi.mock('../../shared/paths.js', () => ({
  get BOARDS_DIR() {
    return tmpDir;
  },
}));

vi.mock('../../shared/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { handleAutoDispatch, type AutoDispatchContext } from '../auto-dispatch.js';
import { createBoard, saveCards } from '../store.js';
import type { BoardCard, BoardColumn, AutoDispatchConfig } from '../types.js';

function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  const now = new Date().toISOString();
  return {
    id: 'card-1',
    title: 'Test Card',
    description: 'Test description',
    columnId: 'todo',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('auto-dispatch model passthrough', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boards-model-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes model from column autoDispatch config to createSession', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-model-1' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
      employee: 'dev-agent',
      model: 'claude-opus-4',
      promptTemplate: 'Work on: {{card.title}}',
    };
    const columns: BoardColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'in-progress', title: 'In Progress', order: 1, autoDispatch },
    ];
    createBoard({ name: 'Model Test Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'card-model', title: 'Use specific model' });
    saveCards(boardId, [card]);

    await handleAutoDispatch(boardId, card, 'in-progress', mockContext);

    expect(mockContext.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4' }),
    );
  });

  it('passes model=undefined to createSession when not configured on column', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-no-model' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
      employee: 'dev-agent',
      promptTemplate: 'Work on: {{card.title}}',
      // model intentionally omitted
    };
    const columns: BoardColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'in-progress', title: 'In Progress', order: 1, autoDispatch },
    ];
    createBoard({ name: 'No-Model Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'card-no-model', title: 'No model card' });
    saveCards(boardId, [card]);

    await handleAutoDispatch(boardId, card, 'in-progress', mockContext);

    expect(mockContext.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: undefined }),
    );
  });

  it('passes exact model string through unchanged', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-exact' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
      model: 'openrouter/meta-llama/llama-3.1-70b-instruct',
    };
    const columns: BoardColumn[] = [
      { id: 'review', title: 'Review', order: 0, autoDispatch },
    ];
    createBoard({ name: 'Exact Model Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'card-exact', title: 'Exact model task' });
    saveCards(boardId, [card]);

    await handleAutoDispatch(boardId, card, 'review', mockContext);

    expect(mockContext.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openrouter/meta-llama/llama-3.1-70b-instruct',
      }),
    );
  });
});
