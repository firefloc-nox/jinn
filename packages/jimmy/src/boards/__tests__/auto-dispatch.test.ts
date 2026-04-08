import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

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

import {
  buildPromptFromTemplate,
  handleAutoDispatch,
  registerAutoDispatch,
  type AutoDispatchContext,
} from '../auto-dispatch.js';
import { createBoard, saveCards, getCards } from '../store.js';
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

describe('buildPromptFromTemplate', () => {
  it('replaces card placeholders', () => {
    const card = makeCard({
      title: 'Fix Bug',
      description: 'Fix the login bug',
      id: 'bug-123',
      priority: 'high',
    });
    const template = 'Task: {{card.title}}\nDescription: {{card.description}}\nID: {{card.id}}\nPriority: {{card.priority}}';
    const result = buildPromptFromTemplate(template, card, 'My Board', 'In Progress');
    expect(result).toBe('Task: Fix Bug\nDescription: Fix the login bug\nID: bug-123\nPriority: high');
  });

  it('replaces board and column placeholders', () => {
    const card = makeCard({ title: 'Task' });
    const template = 'Board: {{board.name}}, Column: {{column.title}}';
    const result = buildPromptFromTemplate(template, card, 'Sprint Board', 'Done');
    expect(result).toBe('Board: Sprint Board, Column: Done');
  });

  it('handles missing optional fields with empty string', () => {
    const card = makeCard({ description: undefined, priority: undefined });
    const template = 'Desc: {{card.description}}, Priority: {{card.priority}}';
    const result = buildPromptFromTemplate(template, card, 'Board', 'Col');
    expect(result).toBe('Desc: , Priority: ');
  });

  it('handles multiple occurrences of same placeholder', () => {
    const card = makeCard({ title: 'Bug' });
    const template = '{{card.title}} - {{card.title}}';
    const result = buildPromptFromTemplate(template, card, 'Board', 'Col');
    expect(result).toBe('Bug - Bug');
  });
});

describe('handleAutoDispatch', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boards-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when board not found', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn(),
    };
    const card = makeCard();
    const result = await handleAutoDispatch('nonexistent', card, 'in-progress', mockContext);
    expect(result).toBeNull();
    expect(mockContext.createSession).not.toHaveBeenCalled();
  });

  it('returns null when column not found', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn(),
    };
    createBoard({ name: 'Test Board' });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];
    const card = makeCard();

    const result = await handleAutoDispatch(boardId, card, 'nonexistent-column', mockContext);
    expect(result).toBeNull();
    expect(mockContext.createSession).not.toHaveBeenCalled();
  });

  it('returns null when autoDispatch not enabled', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn(),
    };
    createBoard({ name: 'Test Board' });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];
    const card = makeCard({ columnId: 'in-progress' });

    const result = await handleAutoDispatch(boardId, card, 'in-progress', mockContext);
    expect(result).toBeNull();
    expect(mockContext.createSession).not.toHaveBeenCalled();
  });

  it('triggers session when autoDispatch enabled', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-123' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
      employee: 'dev-agent',
      promptTemplate: 'Work on: {{card.title}}',
    };
    const columns: BoardColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'in-progress', title: 'In Progress', order: 1, autoDispatch },
    ];
    createBoard({ name: 'Test Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'card-abc', title: 'Fix the bug' });
    saveCards(boardId, [card]);

    const result = await handleAutoDispatch(boardId, card, 'in-progress', mockContext);

    expect(result).toEqual({ sessionId: 'session-123' });
    expect(mockContext.createSession).toHaveBeenCalledWith({
      prompt: 'Work on: Fix the bug',
      employee: 'dev-agent',
      engine: undefined,
      model: undefined,
      title: 'Kanban: Fix the bug',
      source: 'kanban',
      sourceRef: `${boardId}:card-abc`,
      metadata: {
        boardId,
        cardId: 'card-abc',
        columnId: 'in-progress',
        autoDispatch: true,
      },
    });
  });

  it('links session to card and sets working state', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-456' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
      setWorkingState: true,
    };
    const columns: BoardColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'in-progress', title: 'In Progress', order: 1, autoDispatch },
    ];
    createBoard({ name: 'Test Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'card-xyz', title: 'My Task' });
    saveCards(boardId, [card]);

    await handleAutoDispatch(boardId, card, 'in-progress', mockContext);

    const updatedCards = getCards(boardId);
    const updatedCard = updatedCards.find(c => c.id === 'card-xyz');
    expect(updatedCard?.sessionId).toBe('session-456');
    expect(updatedCard?.workState).toBe('working');
  });

  it('uses default prompt template when not specified', async () => {
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-789' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
    };
    const columns: BoardColumn[] = [
      { id: 'in-progress', title: 'In Progress', order: 0, autoDispatch },
    ];
    createBoard({ name: 'Test Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ title: 'Build Feature', description: 'Build the new feature' });

    await handleAutoDispatch(boardId, card, 'in-progress', mockContext);

    expect(mockContext.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Task: Build Feature'),
      }),
    );
    expect(mockContext.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Build the new feature'),
      }),
    );
  });
});

describe('registerAutoDispatch', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boards-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('listens for board:card_moved events', async () => {
    const bus = new EventEmitter();
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-auto' }),
    };

    const autoDispatch: AutoDispatchConfig = {
      enabled: true,
    };
    const columns: BoardColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'in-progress', title: 'In Progress', order: 1, autoDispatch },
    ];
    createBoard({ name: 'Test Board', columns });
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard({ id: 'event-card' });
    saveCards(boardId, [card]);

    registerAutoDispatch(bus, mockContext);

    // Emit the event
    bus.emit('board:card_moved', {
      boardId,
      card,
      from: 'todo',
      to: 'in-progress',
    });

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockContext.createSession).toHaveBeenCalled();
  });

  it('does not trigger for columns without autoDispatch', async () => {
    const bus = new EventEmitter();
    const mockContext: AutoDispatchContext = {
      createSession: vi.fn(),
    };

    createBoard({ name: 'Test Board' }); // default columns without autoDispatch
    const boards = fs.readdirSync(tmpDir);
    const boardId = boards[0];

    const card = makeCard();
    saveCards(boardId, [card]);

    registerAutoDispatch(bus, mockContext);

    bus.emit('board:card_moved', {
      boardId,
      card,
      from: 'todo',
      to: 'in-progress',
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockContext.createSession).not.toHaveBeenCalled();
  });
});
