import fs from 'node:fs';
import path from 'node:path';
import { BOARDS_DIR } from '../shared/paths.js';
import type { Board, BoardCard, BoardConfig, BoardColumn } from './types.js';

const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'backlog', title: 'Backlog', order: 0 },
  { id: 'todo', title: 'To Do', order: 1 },
  { id: 'in-progress', title: 'In Progress', order: 2 },
  { id: 'review', title: 'Review', order: 3 },
  { id: 'done', title: 'Done', order: 4 },
];

function boardDir(id: string): string {
  return path.join(BOARDS_DIR, id);
}

function configPath(id: string): string {
  return path.join(boardDir(id), 'config.json');
}

function cardsPath(id: string): string {
  return path.join(boardDir(id), 'cards.json');
}

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function listBoards(): BoardConfig[] {
  if (!fs.existsSync(BOARDS_DIR)) return [];
  const entries = fs.readdirSync(BOARDS_DIR, { withFileTypes: true });
  const configs: BoardConfig[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const cfg = readJson<BoardConfig>(path.join(BOARDS_DIR, entry.name, 'config.json'));
    if (cfg) configs.push(cfg);
  }
  return configs;
}

export function getBoard(id: string): Board | null {
  const cfg = readJson<BoardConfig>(configPath(id));
  if (!cfg) return null;
  const cards = readJson<BoardCard[]>(cardsPath(id)) ?? [];
  return { config: cfg, cards };
}

export function createBoard(data: Partial<BoardConfig> & { name: string }): BoardConfig {
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = data.id || `${slug}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const config: BoardConfig = {
    id,
    name: data.name,
    description: data.description,
    columns: data.columns ?? DEFAULT_COLUMNS,
    createdAt: now,
    updatedAt: now,
  };
  fs.mkdirSync(boardDir(id), { recursive: true });
  writeJson(configPath(id), config);
  writeJson(cardsPath(id), []);
  return config;
}

export function updateBoardConfig(id: string, patch: Partial<BoardConfig>): BoardConfig | null {
  const cfg = readJson<BoardConfig>(configPath(id));
  if (!cfg) return null;
  const updated: BoardConfig = {
    ...cfg,
    ...patch,
    id: cfg.id, // id is immutable
    updatedAt: new Date().toISOString(),
  };
  writeJson(configPath(id), updated);
  return updated;
}

export function deleteBoard(id: string): boolean {
  const dir = boardDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function getCards(id: string): BoardCard[] {
  return readJson<BoardCard[]>(cardsPath(id)) ?? [];
}

export function saveCards(id: string, cards: BoardCard[]): void {
  writeJson(cardsPath(id), cards);
}

export function patchCard(boardId: string, cardId: string, patch: Partial<BoardCard>): BoardCard | null {
  const cards = getCards(boardId);
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return null;
  const updated: BoardCard = {
    ...cards[idx],
    ...patch,
    id: cards[idx].id, // id is immutable
    updatedAt: new Date().toISOString(),
  };
  cards[idx] = updated;
  saveCards(boardId, cards);
  return updated;
}
