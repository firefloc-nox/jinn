# Jinn Workflow Engine — Architecture Technique Complète

> Version : 1.0 — Avril 2026  
> Basé sur l'analyse de la codebase existante (`packages/jimmy` + `packages/web`)

---

## Table des matières

1. [Modèle de données](#1-modèle-de-données)
2. [Types de nœuds MVP](#2-types-de-nœuds-mvp)
3. [Architecture backend](#3-architecture-backend)
4. [Architecture frontend](#4-architecture-frontend)
5. [Intégration kanban](#5-intégration-kanban)
6. [Plan d'implémentation en phases](#6-plan-dimplémentation-en-phases)

---

## 1. Modèle de données

### 1.1 Fichiers de stockage

```
~/.jinn/
  workflows/
    definitions/           ← fichiers YAML des defs de workflow
      review-pipeline.yaml
      onboarding.yaml
    triggers/              ← cache des triggers actifs (webhook secrets, etc.)
  sessions/
    registry.db            ← SQLite existant → on y ajoute workflow_runs + workflow_steps
```

**Nouveaux exports dans `packages/jimmy/src/shared/paths.ts` :**
```typescript
export const WORKFLOWS_DIR      = path.join(JINN_HOME, 'workflows', 'definitions');
export const WORKFLOW_TRIGGERS  = path.join(JINN_HOME, 'workflows', 'triggers');
```

---

### 1.2 Schema YAML — Définition d'un workflow

`~/.jinn/workflows/definitions/review-pipeline.yaml`

```yaml
# ─── Metadata ───────────────────────────────────────────────
id: review-pipeline           # slug unique, doit matcher le nom de fichier
version: 1
name: "Pipeline de revue de code"
description: "Analyse PR → revue critique → notification Slack"
enabled: true
tags: [engineering, quality]

# ─── Trigger ─────────────────────────────────────────────────
trigger:
  type: card_moved            # card_added | card_moved | manual | cron | webhook
  board: engineering          # département / board cible
  from_column: in-progress    # pour card_moved : colonne source (optionnel)
  to_column: review           # pour card_moved : colonne destination
  # Pour cron :
  # schedule: "0 9 * * 1-5"
  # timezone: "Europe/Paris"
  # Pour webhook :
  # secret: "wh_abc123"       # généré auto, stocké dans triggers/

# ─── Variables d'entrée (optionnel, pour trigger manual) ─────
inputs:
  - name: pr_url
    type: string
    required: false
    description: "URL de la Pull Request"

# ─── Nœuds ───────────────────────────────────────────────────
nodes:
  - id: start
    type: TRIGGER
    position: { x: 100, y: 200 }

  - id: analyze
    type: AGENT
    position: { x: 350, y: 200 }
    config:
      employee: pravko-senior    # nom YAML dans ~/.jinn/org/
      prompt: |
        Analyse la carte kanban "{{trigger.card.title}}" :
        {{trigger.card.description}}
        
        Retourne un JSON avec :
        - score: number (0-10)
        - issues: string[]
        - recommendation: "approve" | "changes_needed" | "reject"
      timeout_ms: 120000
      output_var: analysis       # stocké dans run.context.analysis

  - id: check_score
    type: CONDITION
    position: { x: 600, y: 200 }
    config:
      expression: "context.analysis.score >= 7"
      # Opérateurs supportés : >=, <=, ==, !=, >, <, contains, matches
      # Variables : context.<var>, trigger.card.*, trigger.metadata.*

  - id: move_approved
    type: MOVE_CARD
    position: { x: 850, y: 100 }
    config:
      board: "{{trigger.board}}"
      card_id: "{{trigger.card.id}}"
      to_column: done

  - id: move_rejected
    type: MOVE_CARD
    position: { x: 850, y: 300 }
    config:
      board: "{{trigger.board}}"
      card_id: "{{trigger.card.id}}"
      to_column: todo

  - id: notify_team
    type: NOTIFY
    position: { x: 1100, y: 200 }
    config:
      connector: discord          # discord | telegram | slack
      channel: "{{config.channels.engineering}}"
      template: |
        ✅ **{{trigger.card.title}}** — Score {{context.analysis.score}}/10
        Recommandation : {{context.analysis.recommendation}}

  - id: wait_approval
    type: WAIT
    position: { x: 850, y: 200 }
    config:
      mode: human_approval        # delay | human_approval
      timeout_ms: 86400000        # 24h
      approval_message: "Valider la revue ?"

  - id: end_ok
    type: DONE
    position: { x: 1350, y: 100 }

  - id: end_ko
    type: ERROR
    position: { x: 1350, y: 300 }
    config:
      message: "Revue rejetée après score {{context.analysis.score}}/10"

# ─── Edges (connexions entre nœuds) ─────────────────────────
edges:
  - id: e1
    source: start
    target: analyze

  - id: e2
    source: analyze
    target: check_score

  - id: e3
    source: check_score
    target: move_approved
    condition: true              # branche "oui"

  - id: e4
    source: check_score
    target: move_rejected
    condition: false             # branche "non"

  - id: e5
    source: move_approved
    target: notify_team

  - id: e6
    source: notify_team
    target: end_ok

  - id: e7
    source: move_rejected
    target: end_ko

# ─── Config globale du workflow ──────────────────────────────
settings:
  max_retries: 2
  retry_delay_ms: 5000
  timeout_ms: 600000            # 10 min total
  on_error: notify              # notify | stop | ignore
  error_channel: discord:alerts
```

---

### 1.3 Schema TypeScript — WorkflowDefinition

`packages/jimmy/src/workflows/types.ts`

```typescript
export type NodeType =
  | 'TRIGGER'
  | 'AGENT'
  | 'CONDITION'
  | 'MOVE_CARD'
  | 'NOTIFY'
  | 'WAIT'
  | 'DONE'
  | 'ERROR';

export type TriggerType =
  | 'card_added'
  | 'card_moved'
  | 'manual'
  | 'cron'
  | 'webhook';

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: WorkflowNodePosition;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** For CONDITION nodes: true = "if" branch, false = "else" branch */
  condition?: boolean;
  label?: string;
}

export interface WorkflowTrigger {
  type: TriggerType;
  board?: string;
  from_column?: string;
  to_column?: string;
  schedule?: string;
  timezone?: string;
  secret?: string;
}

export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface WorkflowSettings {
  max_retries?: number;
  retry_delay_ms?: number;
  timeout_ms?: number;
  on_error?: 'notify' | 'stop' | 'ignore';
  error_channel?: string;
}

export interface WorkflowDefinition {
  id: string;
  version: number;
  name: string;
  description?: string;
  enabled: boolean;
  tags?: string[];
  trigger: WorkflowTrigger;
  inputs?: WorkflowInput[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings?: WorkflowSettings;
}

// ─── Run / Exécution ──────────────────────────────────────────

export type RunStatus =
  | 'pending'
  | 'running'
  | 'waiting'    // WAIT node actif
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface WorkflowStepLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface WorkflowStep {
  id: string;                   // UUID unique du step
  runId: string;
  nodeId: string;               // référence node dans la def
  nodeType: NodeType;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  input: Record<string, unknown>;     // contexte interpolé passé au nœud
  output: Record<string, unknown>;    // output produit par le nœud
  error: string | null;
  retryCount: number;
  logs: WorkflowStepLog[];
}

export interface WorkflowRun {
  id: string;                   // UUID
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  triggerType: TriggerType;
  triggerPayload: Record<string, unknown>;   // ce qui a déclenché (card, cron, etc.)
  context: Record<string, unknown>;          // variables accumulées (output_var des AGENT nodes)
  currentNodeId: string | null;
  steps: WorkflowStep[];
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  // Approbation humaine (WAIT node)
  waitingFor?: {
    type: 'approval';
    message: string;
    token: string;        // token unique pour approuver/rejeter via URL ou bouton
    expiresAt: string;
  };
}
```

---

### 1.4 Schema SQLite — Tables nouvelles

Migration à ajouter dans `packages/jimmy/src/sessions/registry.ts` :

```sql
-- Table des workflow runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id               TEXT PRIMARY KEY,
  workflow_id      TEXT NOT NULL,
  workflow_version INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'pending',
  trigger_type     TEXT NOT NULL,
  trigger_payload  TEXT,          -- JSON
  context          TEXT,          -- JSON : variables accumulées
  current_node_id  TEXT,
  started_at       TEXT NOT NULL,
  completed_at     TEXT,
  error            TEXT,
  waiting_for      TEXT           -- JSON : { type, message, token, expiresAt }
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id
  ON workflow_runs (workflow_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs (status);

-- Table des steps individuels
CREATE TABLE IF NOT EXISTS workflow_steps (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  node_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  started_at    TEXT,
  completed_at  TEXT,
  input         TEXT,            -- JSON
  output        TEXT,            -- JSON
  error         TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  logs          TEXT             -- JSON array de { timestamp, level, message }
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_run
  ON workflow_steps (run_id, started_at);
```

---

## 2. Types de nœuds MVP

### 2.1 TRIGGER

**Rôle** : Point d'entrée. Reçoit le payload déclencheur, l'injecte dans `run.context.trigger`.

| Champ | Valeur |
|-------|--------|
| Inputs | `triggerPayload` injecté par l'engine |
| Outputs | `trigger.card`, `trigger.metadata`, `trigger.inputs` |
| Config fields | `type`, `board`, `from_column`, `to_column`, `schedule`, `timezone`, `secret` |

**Exécution** :
```typescript
// Dans WorkflowEngine.executeNode()
case 'TRIGGER': {
  // Le TRIGGER ne fait rien à l'exécution, le payload est déjà dans run.triggerPayload
  // On initialise juste run.context.trigger
  await updateStep(step.id, {
    status: 'completed',
    output: { trigger: run.triggerPayload },
  });
  run.context.trigger = run.triggerPayload;
  return { nextNodeId: getNextNode(node, edges) };
}
```

**Sous-types** :
- `card_added` → payload : `{ card: KanbanTicket, board: string }`
- `card_moved` → payload : `{ card: KanbanTicket, board: string, from: TicketStatus, to: TicketStatus }`
- `manual` → payload : `{ inputs: Record<string, unknown>, triggeredBy: string }`
- `cron` → payload : `{ schedule: string, firedAt: string }`
- `webhook` → payload : `{ headers: Record<string, string>, body: unknown }`

---

### 2.2 AGENT

**Rôle** : Crée une session Jinn vers un employé. Le prompt est interpolé avec le contexte. Stocke l'output dans `context[output_var]`.

| Champ | Détail |
|-------|--------|
| Inputs | `context` du run (variables disponibles pour interpolation) |
| Outputs | `{ result: string, sessionId: string, cost: number }` |
| Config fields | `employee`, `prompt`, `timeout_ms`, `output_var`, `engine?`, `model?` |

**Exécution** :
```typescript
case 'AGENT': {
  const { employee: employeeName, prompt, output_var, timeout_ms = 120000 } = node.config as AgentNodeConfig;
  
  const employee = employeeRegistry.get(employeeName);
  if (!employee) throw new Error(`Employee "${employeeName}" not found`);
  
  // Interpoler le prompt avec run.context
  const interpolatedPrompt = interpolate(prompt, run.context);
  
  // Créer une session Jinn "synthetic" (source: 'workflow')
  const session = createSession({
    engine: employee.engine,
    source: 'workflow',
    sourceRef: `workflow:${run.workflowId}:${run.id}`,
    employee: employeeName,
    title: `[WF] ${workflowDef.name} → ${node.id}`,
    transportMeta: { workflowRunId: run.id, nodeId: node.id },
  });
  
  // Exécuter via SessionManager (réutilise le routing existant)
  const result = await sessionManager.runDirect(session, interpolatedPrompt, { timeout_ms });
  
  // Stocker dans le contexte
  if (output_var) {
    run.context[output_var] = tryParseJson(result.result) ?? result.result;
  }
  
  return {
    nextNodeId: getNextNode(node, edges),
    output: { result: result.result, sessionId: session.id, cost: result.cost },
  };
}
```

> **Note** : `sessionManager.runDirect()` est une nouvelle méthode à ajouter (voir §3.2).

---

### 2.3 CONDITION

**Rôle** : Branch if/else. Évalue une expression JSONPath-like sur `context`.

| Champ | Détail |
|-------|--------|
| Inputs | `context` du run |
| Outputs | `{ result: boolean, evaluated: string }` |
| Config fields | `expression` (string DSL), `true_label?`, `false_label?` |

**DSL d'expression (subset sûr)** :
```
context.analysis.score >= 7
context.analysis.recommendation == "approve"
trigger.card.priority == "high"
context.report contains "error"
trigger.card.assigneeId != null
```

**Exécution** :
```typescript
case 'CONDITION': {
  const { expression } = node.config as ConditionNodeConfig;
  const result = evaluateExpression(expression, run.context);
  
  // Trouver la bonne branche (edge.condition === result)
  const nextEdge = edges.find(e => e.source === node.id && e.condition === result);
  
  return {
    nextNodeId: nextEdge?.target ?? null,
    output: { result, evaluated: expression },
  };
}

// Implémentation de l'évaluateur (SANS eval() — parser manuel)
function evaluateExpression(expr: string, context: Record<string, unknown>): boolean {
  // Regex pour parser : `<path> <op> <value>`
  const match = expr.match(/^(.+?)\s*(>=|<=|==|!=|>|<|contains|matches)\s*(.+)$/);
  if (!match) return false;
  
  const [, left, op, right] = match;
  const leftVal = getPath(context, left.trim());
  const rightVal = parseValue(right.trim());
  
  switch (op) {
    case '>=': return Number(leftVal) >= Number(rightVal);
    case '<=': return Number(leftVal) <= Number(rightVal);
    case '>':  return Number(leftVal) > Number(rightVal);
    case '<':  return Number(leftVal) < Number(rightVal);
    case '==': return String(leftVal) === String(rightVal);
    case '!=': return String(leftVal) !== String(rightVal);
    case 'contains': return String(leftVal).includes(String(rightVal));
    case 'matches': return new RegExp(String(rightVal)).test(String(leftVal));
    default: return false;
  }
}
```

---

### 2.4 MOVE_CARD

**Rôle** : Déplace une carte kanban via l'API interne.

| Champ | Détail |
|-------|--------|
| Inputs | `board`, `card_id`, `to_column` (tous interpolables) |
| Outputs | `{ card: KanbanTicket }` |
| Config fields | `board`, `card_id`, `to_column` |

**Exécution** :
```typescript
case 'MOVE_CARD': {
  const config = node.config as MoveCardNodeConfig;
  const boardId = interpolate(config.board, run.context);
  const cardId  = interpolate(config.card_id, run.context);
  const toCol   = interpolate(config.to_column, run.context) as TicketStatus;
  
  // Appel direct à la couche kanban (pas HTTP, accès direct au fichier board.json)
  const updatedCard = await kanbanService.moveCard(boardId, cardId, toCol);
  
  // Émettre un event pour ne pas ré-déclencher les triggers (flag interne)
  engine.emit('card_moved', { card: updatedCard, board: boardId, _internal: true });
  
  return { nextNodeId: getNextNode(node, edges), output: { card: updatedCard } };
}
```

---

### 2.5 NOTIFY

**Rôle** : Envoie un message via un connecteur existant (Discord/Telegram/Slack).

| Champ | Détail |
|-------|--------|
| Inputs | `context` pour interpolation du template |
| Outputs | `{ messageId: string }` |
| Config fields | `connector`, `channel`, `template`, `format?` |

**Exécution** :
```typescript
case 'NOTIFY': {
  const config = node.config as NotifyNodeConfig;
  const connectorName = config.connector; // 'discord' | 'telegram' | 'slack'
  const channel = interpolate(config.channel, run.context);
  const message = interpolate(config.template, run.context);
  
  const connector = connectorMap.get(connectorName);
  if (!connector) throw new Error(`Connector "${connectorName}" not available`);
  
  const target: Target = { channel };
  const msgId = await connector.sendMessage(target, message);
  
  return { nextNodeId: getNextNode(node, edges), output: { messageId: msgId } };
}
```

---

### 2.6 WAIT

**Rôle** : Suspend l'exécution du run. Deux modes :
- `delay` : timer (setInterval / cron-like check)
- `human_approval` : attente d'une action humaine via token

| Champ | Détail |
|-------|--------|
| Inputs | `timeout_ms`, `mode`, `approval_message?` |
| Outputs | `{ approved: boolean, respondedBy?: string }` (approval) ou `{}` (delay) |
| Config fields | `mode`, `timeout_ms`, `approval_message` |

**Exécution** :
```typescript
case 'WAIT': {
  const config = node.config as WaitNodeConfig;
  
  if (config.mode === 'delay') {
    // Persister l'état "waiting" avec une date de reprise
    const resumeAt = new Date(Date.now() + (config.timeout_ms ?? 60000)).toISOString();
    await updateRun(run.id, {
      status: 'waiting',
      current_node_id: node.id,
      waiting_for: JSON.stringify({ type: 'delay', resumeAt }),
    });
    // Le WorkflowEngine poll les runs "waiting" toutes les 30s et reprend si resumeAt est passé
    return { suspend: true };
  }
  
  if (config.mode === 'human_approval') {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + (config.timeout_ms ?? 86400000)).toISOString();
    
    await updateRun(run.id, {
      status: 'waiting',
      current_node_id: node.id,
      waiting_for: JSON.stringify({
        type: 'approval',
        message: interpolate(config.approval_message ?? 'Approve?', run.context),
        token,
        expiresAt,
      }),
    });
    return { suspend: true };
  }
}
```

**Reprise** : Route `POST /api/workflows/runs/:runId/approve` (voir §3.3).

---

### 2.7 DONE

**Rôle** : Nœud terminal de succès.

```typescript
case 'DONE': {
  await updateRun(run.id, { status: 'completed', completed_at: new Date().toISOString() });
  return { nextNodeId: null };
}
```

---

### 2.8 ERROR

**Rôle** : Nœud terminal d'erreur (avec message interpolable).

```typescript
case 'ERROR': {
  const config = node.config as ErrorNodeConfig;
  const message = interpolate(config.message ?? 'Workflow failed', run.context);
  
  await updateRun(run.id, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    error: message,
  });
  
  // Optionnel : envoyer notification d'erreur si settings.on_error === 'notify'
  if (workflowDef.settings?.on_error === 'notify' && workflowDef.settings?.error_channel) {
    await sendErrorNotification(workflowDef.settings.error_channel, message, run);
  }
  
  return { nextNodeId: null };
}
```

---

## 3. Architecture backend

### 3.1 WorkflowEngine class

`packages/jimmy/src/workflows/engine.ts`

```typescript
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { randomUUID } from 'node:crypto';
import type { WorkflowDefinition, WorkflowRun, WorkflowStep } from './types.js';
import type { SessionManager } from '../sessions/manager.js';
import type { Connector } from '../shared/types.js';
import { WORKFLOWS_DIR } from '../shared/paths.js';
import { logger } from '../shared/logger.js';
import {
  createWorkflowRun,
  updateWorkflowRun,
  getWorkflowRun,
  createWorkflowStep,
  updateWorkflowStep,
  listWaitingRuns,
} from './registry.js';

export class WorkflowEngine extends EventEmitter {
  private definitions = new Map<string, WorkflowDefinition>();
  private sessionManager: SessionManager;
  private connectorMap: Map<string, Connector>;
  private employeeRegistry: Map<string, import('../shared/types.js').Employee>;
  private watchInterval: NodeJS.Timeout | null = null;
  private resumeInterval: NodeJS.Timeout | null = null;

  constructor(
    sessionManager: SessionManager,
    connectorMap: Map<string, Connector>,
    employeeRegistry: Map<string, import('../shared/types.js').Employee>,
  ) {
    super();
    this.sessionManager = sessionManager;
    this.connectorMap = connectorMap;
    this.employeeRegistry = employeeRegistry;
  }

  // ─── Chargement des définitions ──────────────────────────────

  async loadDefinitions(): Promise<void> {
    if (!fs.existsSync(WORKFLOWS_DIR)) {
      fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
      return;
    }
    const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
        const def = yaml.load(content) as WorkflowDefinition;
        this.definitions.set(def.id, def);
        logger.info(`[workflow] Loaded definition: ${def.id} (${def.name})`);
      } catch (err) {
        logger.error(`[workflow] Failed to load ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  watchDefinitions(): void {
    // Re-charger si le dossier change (chaque 5s, simple polling)
    this.watchInterval = setInterval(() => {
      this.loadDefinitions().catch(err =>
        logger.error(`[workflow] Reload error: ${err}`)
      );
    }, 5000);
  }

  getDefinitions(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  saveDefinition(def: WorkflowDefinition): void {
    if (!fs.existsSync(WORKFLOWS_DIR)) fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
    const filePath = path.join(WORKFLOWS_DIR, `${def.id}.yaml`);
    fs.writeFileSync(filePath, yaml.dump(def), 'utf8');
    this.definitions.set(def.id, def);
  }

  deleteDefinition(id: string): void {
    const filePath = path.join(WORKFLOWS_DIR, `${id}.yaml`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    this.definitions.delete(id);
  }

  // ─── Écoute des events kanban ─────────────────────────────────

  attachKanbanListeners(kanbanService: KanbanService): void {
    kanbanService.on('card_added', (payload: CardEvent) => {
      this.handleTrigger('card_added', payload).catch(err =>
        logger.error(`[workflow] card_added trigger error: ${err}`)
      );
    });

    kanbanService.on('card_moved', (payload: CardMovedEvent) => {
      if (payload._internal) return; // évite les boucles infinies de MOVE_CARD
      this.handleTrigger('card_moved', payload).catch(err =>
        logger.error(`[workflow] card_moved trigger error: ${err}`)
      );
    });
  }

  // ─── Dispatch des triggers ────────────────────────────────────

  async handleTrigger(
    type: import('./types.js').TriggerType,
    payload: Record<string, unknown>,
  ): Promise<WorkflowRun[]> {
    const matchingDefs = Array.from(this.definitions.values()).filter(def => {
      if (!def.enabled) return false;
      if (def.trigger.type !== type) return false;

      // Filtres spécifiques selon le type
      if (type === 'card_moved') {
        if (def.trigger.board && def.trigger.board !== payload.board) return false;
        if (def.trigger.to_column && def.trigger.to_column !== (payload as any).to) return false;
        if (def.trigger.from_column && def.trigger.from_column !== (payload as any).from) return false;
      }
      if (type === 'card_added') {
        if (def.trigger.board && def.trigger.board !== payload.board) return false;
      }
      return true;
    });

    const runs: WorkflowRun[] = [];
    for (const def of matchingDefs) {
      const run = await this.startRun(def, type, payload);
      runs.push(run);
    }
    return runs;
  }

  // ─── Démarrage et exécution d'un run ─────────────────────────

  async startRun(
    def: WorkflowDefinition,
    triggerType: import('./types.js').TriggerType,
    triggerPayload: Record<string, unknown>,
    inputs?: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const run = createWorkflowRun({
      id: randomUUID(),
      workflowId: def.id,
      workflowVersion: def.version,
      status: 'running',
      triggerType,
      triggerPayload,
      context: { trigger: triggerPayload, inputs: inputs ?? {} },
      currentNodeId: null,
      startedAt: new Date().toISOString(),
    });

    logger.info(`[workflow] Starting run ${run.id} for workflow "${def.id}"`);

    // Démarrer l'exécution de manière asynchrone (non-bloquant)
    this.executeRun(def, run).catch(err => {
      logger.error(`[workflow] Run ${run.id} crashed: ${err}`);
      updateWorkflowRun(run.id, {
        status: 'failed',
        error: String(err),
        completedAt: new Date().toISOString(),
      });
    });

    return run;
  }

  private async executeRun(def: WorkflowDefinition, run: WorkflowRun): Promise<void> {
    // Trouver le nœud de départ (TRIGGER)
    const startNode = def.nodes.find(n => n.type === 'TRIGGER');
    if (!startNode) throw new Error('No TRIGGER node found');

    let currentNode = startNode;

    while (currentNode) {
      updateWorkflowRun(run.id, { currentNodeId: currentNode.id });

      const step = createWorkflowStep({
        id: randomUUID(),
        runId: run.id,
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        status: 'running',
        startedAt: new Date().toISOString(),
        input: { context: run.context },
        output: {},
        error: null,
        retryCount: 0,
        logs: [],
      });

      try {
        const result = await this.executeNodeWithRetry(def, run, currentNode, step);

        updateWorkflowStep(step.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          output: result.output ?? {},
        });

        if (result.suspend) {
          // Le run est suspendu (WAIT node) — on arrête la boucle, il sera repris plus tard
          return;
        }

        if (!result.nextNodeId) {
          // Nœud terminal (DONE/ERROR gèrent eux-mêmes le statut du run)
          return;
        }

        const nextNode = def.nodes.find(n => n.id === result.nextNodeId);
        if (!nextNode) {
          throw new Error(`Next node "${result.nextNodeId}" not found`);
        }
        currentNode = nextNode;

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        updateWorkflowStep(step.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: errorMsg,
        });
        updateWorkflowRun(run.id, {
          status: 'failed',
          error: errorMsg,
          completedAt: new Date().toISOString(),
        });
        logger.error(`[workflow] Run ${run.id} node ${currentNode.id} failed: ${errorMsg}`);
        return;
      }
    }
  }

  private async executeNodeWithRetry(
    def: WorkflowDefinition,
    run: WorkflowRun,
    node: import('./types.js').WorkflowNode,
    step: WorkflowStep,
  ): Promise<{ nextNodeId: string | null; output?: Record<string, unknown>; suspend?: boolean }> {
    const maxRetries = def.settings?.max_retries ?? 2;
    const retryDelay = def.settings?.retry_delay_ms ?? 5000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeNode(def, run, node);
      } catch (err) {
        if (attempt === maxRetries) throw err;
        logger.warn(`[workflow] Node ${node.id} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms`);
        updateWorkflowStep(step.id, { retryCount: attempt + 1 });
        await sleep(retryDelay);
      }
    }
    throw new Error('unreachable');
  }

  private async executeNode(
    def: WorkflowDefinition,
    run: WorkflowRun,
    node: import('./types.js').WorkflowNode,
  ): Promise<{ nextNodeId: string | null; output?: Record<string, unknown>; suspend?: boolean }> {
    // Dispatcher — voir §2 pour chaque implémentation
    switch (node.type) {
      case 'TRIGGER':  return this.execTrigger(def, run, node);
      case 'AGENT':    return this.execAgent(def, run, node);
      case 'CONDITION': return this.execCondition(def, run, node);
      case 'MOVE_CARD': return this.execMoveCard(def, run, node);
      case 'NOTIFY':   return this.execNotify(def, run, node);
      case 'WAIT':     return this.execWait(def, run, node);
      case 'DONE':     return this.execDone(def, run, node);
      case 'ERROR':    return this.execError(def, run, node);
      default:
        throw new Error(`Unknown node type: ${(node as any).type}`);
    }
  }

  // ─── Reprise des runs suspendus (WAIT nodes) ─────────────────

  startResumePoller(): void {
    this.resumeInterval = setInterval(() => {
      this.resumeWaitingRuns().catch(err =>
        logger.error(`[workflow] Resume poller error: ${err}`)
      );
    }, 30_000); // toutes les 30 secondes
  }

  async resumeWaitingRuns(): Promise<void> {
    const waitingRuns = listWaitingRuns();
    for (const run of waitingRuns) {
      const waitingFor = run.waitingFor;
      if (!waitingFor) continue;

      let shouldResume = false;
      let resumeOutput: Record<string, unknown> = {};

      if (waitingFor.type === 'delay') {
        shouldResume = new Date(waitingFor.resumeAt as string) <= new Date();
      } else if (waitingFor.type === 'approval') {
        // Vérifier expiration
        if (new Date((waitingFor as any).expiresAt) <= new Date()) {
          shouldResume = true;
          resumeOutput = { approved: false, reason: 'timeout' };
        }
      }

      if (shouldResume) {
        const def = this.definitions.get(run.workflowId);
        if (!def) continue;

        run.context['_waitOutput'] = resumeOutput;
        updateWorkflowRun(run.id, {
          status: 'running',
          waitingFor: null,
          context: run.context,
        });

        // Reprendre depuis le nœud suivant après le WAIT
        const waitNode = def.nodes.find(n => n.id === run.currentNodeId);
        if (waitNode) {
          const nextNodeId = getNextNodeId(waitNode, def.edges);
          if (nextNodeId) {
            const nextNode = def.nodes.find(n => n.id === nextNodeId);
            if (nextNode) {
              this.executeRun(def, { ...run, currentNodeId: nextNode.id }).catch(err =>
                logger.error(`[workflow] Resume run ${run.id} error: ${err}`)
              );
            }
          }
        }
      }
    }
  }

  // ─── Approbation humaine ──────────────────────────────────────

  async approveRun(runId: string, token: string, approved: boolean, respondedBy?: string): Promise<void> {
    const run = getWorkflowRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.status !== 'waiting') throw new Error(`Run ${runId} is not waiting`);

    const waitingFor = run.waitingFor;
    if (!waitingFor || waitingFor.type !== 'approval') throw new Error('Run is not waiting for approval');
    if ((waitingFor as any).token !== token) throw new Error('Invalid approval token');

    const def = this.definitions.get(run.workflowId);
    if (!def) throw new Error(`Workflow ${run.workflowId} not found`);

    run.context['_waitOutput'] = { approved, respondedBy };
    updateWorkflowRun(run.id, {
      status: 'running',
      waitingFor: null,
      context: run.context,
    });

    // Reprendre l'exécution
    const waitNode = def.nodes.find(n => n.id === run.currentNodeId);
    if (waitNode) {
      const nextNodeId = getNextNodeId(waitNode, def.edges);
      if (nextNodeId) {
        const nextNode = def.nodes.find(n => n.id === nextNodeId);
        if (nextNode) {
          await this.executeRun(def, { ...run, currentNodeId: nextNode.id });
        }
      }
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  stop(): void {
    if (this.watchInterval) clearInterval(this.watchInterval);
    if (this.resumeInterval) clearInterval(this.resumeInterval);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### 3.2 Intégration dans server.ts

**Principe** : WorkflowEngine est instancié après les connectors existants. Aucune ligne existante n'est modifiée — on ajoute des blocs après les initialisations actuelles.

```typescript
// Dans startGateway(), après la ligne :
// sessionManager.setConnectorProvider(() => connectorMap);

// ─── Workflow Engine ───────────────────────────────────────────
import { WorkflowEngine } from '../workflows/engine.js';
import { KanbanService } from '../workflows/kanban-service.js';

const kanbanService = new KanbanService();
const workflowEngine = new WorkflowEngine(sessionManager, connectorMap, employeeRegistry);
await workflowEngine.loadDefinitions();
workflowEngine.watchDefinitions();
workflowEngine.attachKanbanListeners(kanbanService);
workflowEngine.startResumePoller();

logger.info(`[workflow] Engine started with ${workflowEngine.getDefinitions().length} definition(s)`);

// Passer workflowEngine au contexte API
const apiContext: ApiContext = {
  config,
  sessionManager,
  startTime: Date.now(),
  getConfig: () => loadConfig(),
  emit: (event, payload) => wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify({ type: event, payload }));
  }),
  connectors: connectorMap,
  reloadConnectorInstances,
  workflowEngine,   // ← nouveau
  kanbanService,    // ← nouveau
};

// Cleanup (dans la fonction GatewayCleanup existante)
// Ajouter : workflowEngine.stop();
```

**Nouvelle méthode dans SessionManager** (`sessions/manager.ts`) :

```typescript
/**
 * Exécute une session de manière programmatique (pour les workflow AGENT nodes).
 * Retourne quand la session est terminée.
 */
async runDirect(
  session: Session,
  prompt: string,
  opts: { timeout_ms?: number } = {},
): Promise<EngineResult> {
  const engine = this.getEngine(session.engine);
  if (!engine) throw new Error(`Engine "${session.engine}" not available`);

  const employee = session.employee ? this.employeeRegistry?.get(session.employee) : undefined;
  const context = await buildContext(session, employee, this.config);
  
  const runOpts = employee
    ? hermesRunInputToOpts(mapEmployeeToHermesInput(employee, session, this.config), context)
    : { prompt, cwd: JINN_HOME, sessionId: session.id };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Agent timeout')), opts.timeout_ms ?? 120_000)
  );

  return Promise.race([engine.run({ ...runOpts, prompt }), timeoutPromise]);
}
```

---

### 3.3 Routes API

À ajouter dans `packages/jimmy/src/gateway/api.ts`, dans la fonction `handleApiRequest()` :

```typescript
// ─── Workflows ────────────────────────────────────────────────

// GET /api/workflows — liste toutes les définitions
if (method === 'GET' && pathname === '/api/workflows') {
  const defs = context.workflowEngine.getDefinitions();
  return respond(200, { workflows: defs });
}

// POST /api/workflows — créer/sauvegarder une définition
if (method === 'POST' && pathname === '/api/workflows') {
  const body = await readBody<WorkflowDefinition>(req);
  if (!body.id) return respond(400, { error: 'Missing workflow id' });
  context.workflowEngine.saveDefinition(body);
  return respond(201, { workflow: body });
}

// GET /api/workflows/:id — obtenir une définition
if (method === 'GET' && pathnameMatch('/api/workflows/:id')) {
  const def = context.workflowEngine.getDefinition(params.id);
  if (!def) return respond(404, { error: 'Not found' });
  return respond(200, { workflow: def });
}

// PUT /api/workflows/:id — mettre à jour une définition
if (method === 'PUT' && pathnameMatch('/api/workflows/:id')) {
  const body = await readBody<WorkflowDefinition>(req);
  body.id = params.id;
  context.workflowEngine.saveDefinition(body);
  return respond(200, { workflow: body });
}

// DELETE /api/workflows/:id — supprimer une définition
if (method === 'DELETE' && pathnameMatch('/api/workflows/:id')) {
  context.workflowEngine.deleteDefinition(params.id);
  return respond(204, null);
}

// POST /api/workflows/:id/trigger — déclencher manuellement
if (method === 'POST' && pathnameMatch('/api/workflows/:id/trigger')) {
  const def = context.workflowEngine.getDefinition(params.id);
  if (!def) return respond(404, { error: 'Not found' });
  const body = await readBody<{ inputs?: Record<string, unknown> }>(req);
  const run = await context.workflowEngine.startRun(
    def, 'manual',
    { triggeredBy: 'api', triggeredAt: new Date().toISOString() },
    body.inputs ?? {},
  );
  return respond(202, { runId: run.id, status: run.status });
}

// POST /api/workflows/webhook/:secret — trigger webhook
if (method === 'POST' && pathnameMatch('/api/workflows/webhook/:secret')) {
  const body = await readBody(req);
  const runs = await context.workflowEngine.handleWebhookTrigger(params.secret, {
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
    body,
  });
  return respond(200, { triggered: runs.length, runIds: runs.map(r => r.id) });
}

// ─── Workflow Runs ────────────────────────────────────────────

// GET /api/workflows/runs — liste tous les runs (optionnel: ?workflowId=xxx)
if (method === 'GET' && pathname === '/api/workflows/runs') {
  const workflowId = url.searchParams.get('workflowId') ?? undefined;
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const runs = listWorkflowRuns({ workflowId, limit });
  return respond(200, { runs });
}

// GET /api/workflows/runs/:runId — statut d'un run
if (method === 'GET' && pathnameMatch('/api/workflows/runs/:runId')) {
  const run = getWorkflowRun(params.runId);
  if (!run) return respond(404, { error: 'Run not found' });
  const steps = getWorkflowSteps(params.runId);
  return respond(200, { run: { ...run, steps } });
}

// POST /api/workflows/runs/:runId/cancel — annuler un run
if (method === 'POST' && pathnameMatch('/api/workflows/runs/:runId/cancel')) {
  updateWorkflowRun(params.runId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
  });
  return respond(200, { ok: true });
}

// POST /api/workflows/runs/:runId/approve — approuver un WAIT node
if (method === 'POST' && pathnameMatch('/api/workflows/runs/:runId/approve')) {
  const body = await readBody<{ token: string; approved: boolean; respondedBy?: string }>(req);
  await context.workflowEngine.approveRun(
    params.runId, body.token, body.approved, body.respondedBy
  );
  return respond(200, { ok: true });
}
```

**Récapitulatif des routes** :

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/workflows` | Liste toutes les définitions |
| POST | `/api/workflows` | Créer une définition |
| GET | `/api/workflows/:id` | Obtenir une définition |
| PUT | `/api/workflows/:id` | Mettre à jour |
| DELETE | `/api/workflows/:id` | Supprimer |
| POST | `/api/workflows/:id/trigger` | Trigger manuel |
| POST | `/api/workflows/webhook/:secret` | Trigger webhook |
| GET | `/api/workflows/runs` | Liste les runs |
| GET | `/api/workflows/runs/:runId` | Statut d'un run |
| POST | `/api/workflows/runs/:runId/cancel` | Annuler |
| POST | `/api/workflows/runs/:runId/approve` | Approbation humaine |

---

### 3.4 Gestion des erreurs et retry

```typescript
// packages/jimmy/src/workflows/engine.ts

// Stratégie de retry par type de nœud
const RETRYABLE_NODE_TYPES: NodeType[] = ['AGENT', 'NOTIFY', 'MOVE_CARD'];

// Dans executeNodeWithRetry :
const isRetryable = RETRYABLE_NODE_TYPES.includes(node.type);
const maxRetries = isRetryable ? (def.settings?.max_retries ?? 2) : 0;

// Exponential backoff
const delay = def.settings?.retry_delay_ms ?? 5000;
const backoff = delay * Math.pow(2, attempt); // 5s, 10s, 20s
```

**Scénarios d'erreur** :

| Erreur | Comportement |
|--------|-------------|
| Employee introuvable | Fail immédiat, run → `failed` |
| Timeout agent (>120s) | Retry x2 puis fail |
| Connector down | Retry x2 puis skip si `on_error: ignore` |
| CONDITION invalid expr | Fail immédiat (config bug) |
| WAIT expiré | Branch `false` (rejected) |
| Gateway restart pendant run | Run `running` → marqué `failed` au boot, comme les sessions |

---

## 4. Architecture frontend

### 4.1 Structure des pages

```
packages/web/src/app/
  workflows/
    page.tsx                    ← /workflows : liste des workflows
    [id]/
      page.tsx                  ← /workflows/[id] : éditeur visuel
      loading.tsx
  
packages/web/src/components/workflows/
  workflow-list.tsx             ← cards de workflows avec stats de runs
  workflow-card.tsx             ← carte individuelle avec status badge
  workflow-editor.tsx           ← wrapper ReactFlow complet
  workflow-toolbar.tsx          ← boutons Save, Run, Zoom fit, etc.
  workflow-run-panel.tsx        ← panel latéral droit : liste des runs
  workflow-run-detail.tsx       ← détail d'un run avec steps en timeline
  nodes/
    trigger-node.tsx
    agent-node.tsx
    condition-node.tsx
    move-card-node.tsx
    notify-node.tsx
    wait-node.tsx
    done-node.tsx
    error-node.tsx
  node-config-panel.tsx         ← formulaire de config du nœud sélectionné
  edge-label.tsx                ← label sur les edges (true/false pour CONDITION)

packages/web/src/hooks/
  use-workflow.ts               ← fetch + mutation d'une définition
  use-workflow-runs.ts          ← liste runs + polling statut
  use-workflow-editor.ts        ← state management de l'éditeur

packages/web/src/lib/
  workflow-api.ts               ← fonctions d'appel API (CRUD + trigger)
  workflow-utils.ts             ← interpolation preview, validation
```

---

### 4.2 Page liste `/workflows`

```tsx
// packages/web/src/app/workflows/page.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { workflowApi } from '@/lib/workflow-api'
import { WorkflowCard } from '@/components/workflows/workflow-card'
import { PageLayout, ToolbarActions } from '@/components/page-layout'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export default function WorkflowsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.list(),
    refetchInterval: 10_000,
  })

  return (
    <PageLayout
      title="Workflows"
      toolbar={
        <ToolbarActions>
          <Link href="/workflows/new">
            <button className="btn-primary"><Plus size={14} /> Nouveau</button>
          </Link>
        </ToolbarActions>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {data?.workflows.map(wf => (
          <WorkflowCard key={wf.id} workflow={wf} />
        ))}
      </div>
    </PageLayout>
  )
}
```

---

### 4.3 Page éditeur `/workflows/[id]`

```tsx
// packages/web/src/app/workflows/[id]/page.tsx
'use client'

import { ReactFlowProvider } from 'reactflow'
import { WorkflowEditor } from '@/components/workflows/workflow-editor'
import { WorkflowRunPanel } from '@/components/workflows/workflow-run-panel'
import { useWorkflow } from '@/hooks/use-workflow'
import { use } from 'react'

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { workflow, isLoading, save } = useWorkflow(id === 'new' ? null : id)

  return (
    <div className="flex h-screen">
      <ReactFlowProvider>
        <WorkflowEditor
          workflowId={id}
          initialDef={workflow}
          onSave={save}
          className="flex-1"
        />
      </ReactFlowProvider>
      <WorkflowRunPanel workflowId={id} className="w-80 border-l" />
    </div>
  )
}
```

---

### 4.4 Composants React Flow custom

**Installation** :
```bash
pnpm add --filter web reactflow
# reactflow inclut ses propres types TypeScript
```

**Nœud AGENT** (exemple) :
```tsx
// packages/web/src/components/workflows/nodes/agent-node.tsx
import { Handle, Position, type NodeProps } from 'reactflow'
import { Bot, Clock } from 'lucide-react'

interface AgentNodeData {
  employee: string
  prompt: string
  output_var?: string
  timeout_ms?: number
  // État runtime (injecté depuis le run actif)
  stepStatus?: 'pending' | 'running' | 'completed' | 'failed'
}

export function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  const isRunning = data.stepStatus === 'running'
  const isFailed  = data.stepStatus === 'failed'
  const isDone    = data.stepStatus === 'completed'

  return (
    <div className={`
      workflow-node agent-node
      ${selected ? 'ring-2 ring-blue-500' : ''}
      ${isRunning ? 'ring-2 ring-yellow-400 animate-pulse' : ''}
      ${isFailed  ? 'ring-2 ring-red-500' : ''}
      ${isDone    ? 'ring-2 ring-green-500' : ''}
    `}>
      <Handle type="target" position={Position.Left} />
      
      <div className="node-header">
        <Bot size={14} />
        <span className="node-type-label">AGENT</span>
        {isRunning && <Clock size={12} className="animate-spin text-yellow-400" />}
      </div>
      
      <div className="node-body">
        <div className="node-title">{data.employee}</div>
        <div className="node-subtitle truncate text-xs opacity-60">
          {data.prompt.slice(0, 50)}…
        </div>
        {data.output_var && (
          <div className="node-badge">→ {data.output_var}</div>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

**Nœud CONDITION** :
```tsx
export function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  return (
    <div className={`workflow-node condition-node diamond-shape ${selected ? 'ring-2' : ''}`}>
      <Handle type="target" position={Position.Left} />
      
      <div className="node-header">
        <GitBranch size={14} />
        <span>IF</span>
      </div>
      <div className="node-body">
        <code className="text-xs">{data.expression}</code>
      </div>
      
      {/* Deux sorties : true (haut) et false (bas) */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '70%' }}
      />
    </div>
  )
}
```

**Mapping des node types React Flow** :
```typescript
// packages/web/src/components/workflows/workflow-editor.tsx
import { TriggerNode }  from './nodes/trigger-node'
import { AgentNode }    from './nodes/agent-node'
import { ConditionNode } from './nodes/condition-node'
import { MoveCardNode } from './nodes/move-card-node'
import { NotifyNode }   from './nodes/notify-node'
import { WaitNode }     from './nodes/wait-node'
import { DoneNode }     from './nodes/done-node'
import { ErrorNode }    from './nodes/error-node'

export const nodeTypes = {
  TRIGGER:   TriggerNode,
  AGENT:     AgentNode,
  CONDITION: ConditionNode,
  MOVE_CARD: MoveCardNode,
  NOTIFY:    NotifyNode,
  WAIT:      WaitNode,
  DONE:      DoneNode,
  ERROR:     ErrorNode,
}
```

---

### 4.5 State management de l'éditeur

```typescript
// packages/web/src/hooks/use-workflow-editor.ts
import { useCallback, useState } from 'react'
import { useNodesState, useEdgesState, addEdge, type Connection } from 'reactflow'
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@/lib/workflow-api'

export function useWorkflowEditor(initialDef: WorkflowDefinition | null) {
  // Convertir les nodes de la def en nodes ReactFlow
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialDef?.nodes ?? []).map(defNodeToRfNode)
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initialDef?.edges ?? []).map(defEdgeToRfEdge)
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [meta, setMeta] = useState({
    id: initialDef?.id ?? '',
    name: initialDef?.name ?? 'Nouveau workflow',
    description: initialDef?.description ?? '',
    enabled: initialDef?.enabled ?? true,
    trigger: initialDef?.trigger ?? { type: 'manual' as const },
    settings: initialDef?.settings ?? {},
  })

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, animated: true }, eds))
  }, [setEdges])

  const addNode = useCallback((type: string, position: { x: number; y: number }) => {
    const id = `${type.toLowerCase()}-${Date.now()}`
    setNodes(nds => [...nds, {
      id,
      type,
      position,
      data: getDefaultNodeData(type),
    }])
  }, [setNodes])

  const updateNodeConfig = useCallback((nodeId: string, config: Record<string, unknown>) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...config } } : n
    ))
  }, [setNodes])

  // Construire la WorkflowDefinition à partir de l'état RF
  const buildDefinition = useCallback((): WorkflowDefinition => ({
    ...meta,
    version: (initialDef?.version ?? 0) + 1,
    tags: initialDef?.tags ?? [],
    inputs: initialDef?.inputs ?? [],
    nodes: nodes.map(rfNodeToDefNode),
    edges: edges.map(rfEdgeToDefEdge),
  }), [meta, nodes, edges, initialDef])

  return {
    nodes, edges, meta,
    setMeta, selectedNodeId, setSelectedNodeId,
    onNodesChange, onEdgesChange, onConnect,
    addNode, updateNodeConfig,
    buildDefinition,
  }
}

// Helpers de conversion
function defNodeToRfNode(n: WorkflowNode) {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.config ?? {},
  }
}

function rfNodeToDefNode(n: any): WorkflowNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    config: n.data,
  }
}
```

---

### 4.6 Trigger manuel + polling statut

```typescript
// packages/web/src/lib/workflow-api.ts

const BASE = '/api/workflows'

export const workflowApi = {
  list: async () => {
    const r = await fetch(BASE); return r.json()
  },
  get: async (id: string) => {
    const r = await fetch(`${BASE}/${id}`); return r.json()
  },
  save: async (def: WorkflowDefinition) => {
    const method = def.id ? 'PUT' : 'POST'
    const url = def.id ? `${BASE}/${def.id}` : BASE
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def),
    })
    return r.json()
  },
  trigger: async (id: string, inputs?: Record<string, unknown>) => {
    const r = await fetch(`${BASE}/${id}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }),
    })
    return r.json() as Promise<{ runId: string; status: string }>
  },
  getRun: async (runId: string) => {
    const r = await fetch(`${BASE}/runs/${runId}`); return r.json()
  },
  listRuns: async (workflowId?: string) => {
    const qs = workflowId ? `?workflowId=${workflowId}` : ''
    const r = await fetch(`${BASE}/runs${qs}`); return r.json()
  },
  approve: async (runId: string, token: string, approved: boolean) => {
    const r = await fetch(`${BASE}/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, approved }),
    })
    return r.json()
  },
}
```

**Hook de polling** :
```typescript
// packages/web/src/hooks/use-workflow-runs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowApi } from '@/lib/workflow-api'

export function useWorkflowRuns(workflowId: string) {
  return useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: () => workflowApi.listRuns(workflowId),
    refetchInterval: (data) => {
      // Polling rapide si un run est actif
      const hasActive = data?.runs?.some(
        (r: any) => r.status === 'running' || r.status === 'pending'
      )
      return hasActive ? 2000 : 10_000
    },
  })
}

export function useTriggerWorkflow(workflowId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inputs?: Record<string, unknown>) =>
      workflowApi.trigger(workflowId, inputs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
    },
  })
}
```

**Overlay de statut run sur l'éditeur** :
```typescript
// Dans WorkflowEditor : injecter les step statuses dans les nodes
function injectRunStatus(
  nodes: RFNode[],
  activeRun: WorkflowRun | null,
): RFNode[] {
  if (!activeRun) return nodes
  return nodes.map(n => {
    const step = activeRun.steps.find(s => s.nodeId === n.id)
    return {
      ...n,
      data: { ...n.data, stepStatus: step?.status ?? 'pending' },
    }
  })
}
```

---

## 5. Intégration kanban

### 5.1 Migration kanban : localStorage → API backend

**État actuel** : les tickets sont en `localStorage` (voir `packages/web/src/lib/kanban/store.ts`).  
**Problème** : le backend ne peut pas émettre d'events kanban sur des données qu'il ne connaît pas.  
**Solution** : migrer la persistence vers l'API, en conservant un cache localStorage optionnel.

**Nouvelles routes kanban dans `api.ts`** :

```typescript
// GET  /api/kanban/:board/tickets
// POST /api/kanban/:board/tickets
// PUT  /api/kanban/:board/tickets/:ticketId
// DELETE /api/kanban/:board/tickets/:ticketId
// POST /api/kanban/:board/tickets/:ticketId/move  { to_column: string }
```

**Backend storage** : `~/.jinn/kanban/<board>/board.json`

```typescript
// packages/jimmy/src/workflows/kanban-service.ts
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { JINN_HOME } from '../shared/paths.js';
import type { KanbanTicket, TicketStatus } from './kanban-types.js';

export class KanbanService extends EventEmitter {
  private getBoardPath(board: string): string {
    return path.join(JINN_HOME, 'kanban', board, 'board.json');
  }

  private readBoard(board: string): Record<string, KanbanTicket> {
    const p = this.getBoardPath(board);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  private writeBoard(board: string, tickets: Record<string, KanbanTicket>): void {
    const p = this.getBoardPath(board);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(tickets, null, 2), 'utf8');
  }

  listTickets(board: string): KanbanTicket[] {
    return Object.values(this.readBoard(board));
  }

  createTicket(board: string, data: Omit<KanbanTicket, 'id' | 'createdAt' | 'updatedAt' | 'workState'>): KanbanTicket {
    const tickets = this.readBoard(board);
    const id = crypto.randomUUID();
    const now = Date.now();
    const ticket: KanbanTicket = {
      ...data, id, workState: 'idle', createdAt: now, updatedAt: now,
    };
    tickets[id] = ticket;
    this.writeBoard(board, tickets);
    this.emit('card_added', { card: ticket, board });
    return ticket;
  }

  moveCard(board: string, ticketId: string, toColumn: TicketStatus, _internal = false): KanbanTicket {
    const tickets = this.readBoard(board);
    const ticket = tickets[ticketId];
    if (!ticket) throw new Error(`Ticket ${ticketId} not found on board ${board}`);
    const fromColumn = ticket.status;
    ticket.status = toColumn;
    ticket.updatedAt = Date.now();
    this.writeBoard(board, tickets);
    this.emit('card_moved', { card: ticket, board, from: fromColumn, to: toColumn, _internal });
    return ticket;
  }
}
```

---

### 5.2 Écoute des events pour les triggers

```typescript
// Dans WorkflowEngine.attachKanbanListeners() (déjà montré §3.1)
kanbanService.on('card_added', (payload) => {
  // Cherche tous les workflows avec trigger.type === 'card_added'
  // et trigger.board === payload.board
  this.handleTrigger('card_added', payload);
});

kanbanService.on('card_moved', (payload) => {
  if (payload._internal) return; // évite la boucle infinie depuis MOVE_CARD
  this.handleTrigger('card_moved', payload);
});
```

---

### 5.3 MOVE_CARD et l'API existante

Le nœud `MOVE_CARD` appelle directement `kanbanService.moveCard()` avec `_internal: true` pour ne pas ré-déclencher les triggers.

**Variables disponibles dans le contexte pour MOVE_CARD** :

```yaml
# Accès via interpolation {{ }}
- "{{trigger.card.id}}"           # ID de la carte qui a déclenché
- "{{trigger.board}}"             # Board du trigger
- "{{context.analysis.cardId}}"  # Variable produite par un AGENT
```

---

### 5.4 Multi-board : chaque workflow a son propre kanban

Structure des fichiers :
```
~/.jinn/kanban/
  engineering/
    board.json
  marketing/
    board.json
  support/
    board.json
```

Dans une définition de workflow :
```yaml
trigger:
  type: card_moved
  board: engineering       # ← ciblage précis du board
  to_column: review

nodes:
  - id: move_back
    type: MOVE_CARD
    config:
      board: "{{trigger.board}}"  # ou board fixe
      card_id: "{{trigger.card.id}}"
      to_column: done
```

La page `/kanban` du frontend passe un query param `?board=engineering` ou auto-détecte selon le département de l'employé connecté.

**Route de sélection de board** :
```
GET /api/kanban/boards          → liste les boards disponibles (dossiers dans ~/.jinn/kanban/)
GET /api/kanban/:board/tickets  → tickets du board
```

---

## 6. Plan d'implémentation en phases

### Phase 1 — MVP Backend (2-3 semaines)

**Objectif** : le moteur tourne, les workflows s'exécutent, pas d'UI graphique.

#### Sprint 1.1 — Fondations (sem. 1)
- [ ] `packages/jimmy/src/workflows/` — dossier de base
- [ ] `packages/jimmy/src/workflows/types.ts` — tous les types TS
- [ ] Migration SQLite (2 nouvelles tables dans registry.ts)
- [ ] `workflows/registry.ts` — CRUD SQLite (createRun, updateRun, listRuns, etc.)
- [ ] `shared/paths.ts` — ajouter `WORKFLOWS_DIR`
- [ ] `KanbanService` class avec EventEmitter
- [ ] Migration kanban localStorage → API (routes + board.json)

#### Sprint 1.2 — Engine (sem. 2)
- [ ] `WorkflowEngine` class — chargement YAML, dispatch triggers
- [ ] Exécution des nœuds : TRIGGER, AGENT, CONDITION, DONE, ERROR
- [ ] `SessionManager.runDirect()` — exécution programmatique
- [ ] Interpolation de templates `{{variable.path}}`
- [ ] `evaluateExpression()` — parser d'expressions CONDITION
- [ ] Gestion retry + timeout

#### Sprint 1.3 — API + intégration (sem. 3)
- [ ] Routes `/api/workflows*` dans api.ts
- [ ] Routes `/api/kanban*` dans api.ts
- [ ] Intégration dans `server.ts` (sans casser l'existant)
- [ ] MOVE_CARD, NOTIFY, WAIT nodes
- [ ] Poller de reprise des runs suspendus
- [ ] Tests : workflow simple card_moved → AGENT → DONE

**Livrables Phase 1** :
```bash
# Test de bout en bout :
curl -X POST http://localhost:3000/api/workflows \
  -d @~/.jinn/workflows/definitions/test.yaml

# Déplacer une carte → vérifier que le workflow se déclenche
curl -X POST http://localhost:3000/api/kanban/engineering/tickets/abc/move \
  -d '{"to_column":"review"}'

# Vérifier le run
curl http://localhost:3000/api/workflows/runs?workflowId=test
```

---

### Phase 2 — Graph Editor Frontend (2-3 semaines)

**Objectif** : UI visuelle pour créer/éditer les workflows, monitoring des runs.

#### Sprint 2.1 — Pages et hooks (sem. 1)
- [ ] `pnpm add --filter web reactflow`
- [ ] Page `/workflows` — liste avec stats
- [ ] Page `/workflows/[id]` — layout éditeur
- [ ] `use-workflow.ts`, `use-workflow-runs.ts`
- [ ] `workflow-api.ts` — client API
- [ ] Navigation dans le sidebar existant

#### Sprint 2.2 — Éditeur React Flow (sem. 2)
- [ ] Tous les custom nodes (8 types)
- [ ] Toolbar : Save, Run, Zoom fit, + node picker
- [ ] `node-config-panel.tsx` — formulaire par type de nœud
- [ ] `workflow-editor.tsx` — canvas principal
- [ ] Overlay statut run en temps réel (polling 2s si run actif)
- [ ] Conversion def ↔ RF nodes/edges

#### Sprint 2.3 — Runs + polish (sem. 3)
- [ ] `WorkflowRunPanel` — liste des runs + logs en temps réel
- [ ] Timeline des steps dans `workflow-run-detail.tsx`
- [ ] Bouton d'approbation pour WAIT nodes
- [ ] Trigger manuel avec inputs form
- [ ] Drag & drop pour ajouter des nœuds depuis une palette
- [ ] Validation du graph (pas de cycles, DONE/ERROR terminal, etc.)

**Livrables Phase 2** :
- Workflow créatable entièrement via UI
- Monitoring visuel avec nœuds qui s'animent pendant l'exécution
- Historique des runs consultable

---

### Phase 3 — Intégrations avancées (3-4 semaines)

**Objectif** : triggers riches, exécution parallèle, templates réutilisables.

#### Sprint 3.1 — Triggers avancés
- [ ] Trigger `cron` — intégration avec `node-cron` existant
- [ ] Trigger `webhook` — génération de secrets, validation HMAC
- [ ] Trigger `manual` avec formulaire d'inputs dynamique
- [ ] Trigger `session_completed` — un workflow se déclenche quand une session Jinn se termine

#### Sprint 3.2 — Nœuds avancés
- [ ] Nœud `FORK` — exécution parallèle de branches
- [ ] Nœud `JOIN` — attend que toutes les branches parallèles finissent
- [ ] Nœud `LOOP` — boucle sur un array (ex: itérer sur une liste de tickets)
- [ ] Nœud `HTTP` — appel HTTP externe générique
- [ ] Nœud `SUB_WORKFLOW` — déclenche un autre workflow et attend son résultat

#### Sprint 3.3 — Templates et bibliothèque
- [ ] Bibliothèque de templates built-in (review pipeline, onboarding, rapport hebdo)
- [ ] Import/export de workflows (zip avec YAML)
- [ ] Versioning des définitions (git-based avec `simple-git`)
- [ ] Diff visuel entre versions dans l'UI

#### Sprint 3.4 — Observabilité
- [ ] Page `/workflows/runs` — vue globale de tous les runs toutes définitions confondues
- [ ] Métriques : durée moyenne, taux d'échec, coût total par workflow
- [ ] Logs en streaming via WebSocket (comme les sessions actuelles)
- [ ] Alertes : email/Discord si un workflow échoue N fois de suite

---

### Annexe A — Fichiers à créer/modifier

| Action | Fichier |
|--------|---------|
| CRÉER | `packages/jimmy/src/workflows/types.ts` |
| CRÉER | `packages/jimmy/src/workflows/engine.ts` |
| CRÉER | `packages/jimmy/src/workflows/registry.ts` |
| CRÉER | `packages/jimmy/src/workflows/kanban-service.ts` |
| CRÉER | `packages/jimmy/src/workflows/interpolate.ts` |
| CRÉER | `packages/jimmy/src/workflows/expression.ts` |
| MODIFIER | `packages/jimmy/src/shared/paths.ts` (2 lignes) |
| MODIFIER | `packages/jimmy/src/sessions/registry.ts` (migration SQL) |
| MODIFIER | `packages/jimmy/src/sessions/manager.ts` (+ runDirect) |
| MODIFIER | `packages/jimmy/src/gateway/api.ts` (+ routes workflow + kanban) |
| MODIFIER | `packages/jimmy/src/gateway/server.ts` (+ init WorkflowEngine) |
| CRÉER | `packages/web/src/app/workflows/page.tsx` |
| CRÉER | `packages/web/src/app/workflows/[id]/page.tsx` |
| CRÉER | `packages/web/src/components/workflows/*` (8+ composants) |
| CRÉER | `packages/web/src/hooks/use-workflow.ts` |
| CRÉER | `packages/web/src/hooks/use-workflow-runs.ts` |
| CRÉER | `packages/web/src/lib/workflow-api.ts` |
| MODIFIER | `packages/web/src/lib/nav.ts` (ajouter lien Workflows) |

---

### Annexe B — Conventions d'interpolation

Le moteur supporte `{{variable.path}}` dans tous les champs `config` des nœuds.

```typescript
// packages/jimmy/src/workflows/interpolate.ts

function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const value = getNestedValue(context, path.trim());
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// Variables disponibles dans le contexte d'un run :
// trigger.*                    ← payload du trigger
// trigger.card.id              ← pour card_added/card_moved
// trigger.card.title
// trigger.card.status
// trigger.card.priority
// trigger.card.assigneeId
// trigger.board
// trigger.from / trigger.to    ← pour card_moved
// inputs.*                     ← inputs du trigger manual
// context.<output_var>.*       ← outputs des AGENT nodes précédents
// config.*                     ← config globale Jinn (pour channels, etc.)
```

---

### Annexe C — Exemple de workflow complet minimal

`~/.jinn/workflows/definitions/quick-notify.yaml`

```yaml
id: quick-notify
version: 1
name: "Notifier à chaque nouvelle carte"
enabled: true

trigger:
  type: card_added
  board: general

nodes:
  - id: start
    type: TRIGGER
    position: { x: 100, y: 200 }

  - id: notify
    type: NOTIFY
    position: { x: 400, y: 200 }
    config:
      connector: discord
      channel: "general"
      template: |
        📋 Nouvelle carte : **{{trigger.card.title}}**
        Priorité : {{trigger.card.priority}}
        Assigné à : {{trigger.card.assigneeId}}

  - id: end
    type: DONE
    position: { x: 700, y: 200 }

edges:
  - id: e1
    source: start
    target: notify
  - id: e2
    source: notify
    target: end
```

---

*Spec produite le 1er avril 2026 — à réviser après Phase 1 en fonction des retours d'implémentation.*
