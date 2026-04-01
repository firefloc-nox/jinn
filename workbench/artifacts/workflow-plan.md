# Jinn Workflow Engine — Plan d'implémentation

> Branche : `feature/workflows`
> Date : 2026-04-01
> Status : APPROVED — prêt à implémenter

---

## Vision

Système de workflow visuel multi-workflow avec :
- Page `/workflows` : dashboard (actifs/inactifs/live) + création
- Éditeur de nodes React Flow : construction visuelle du graph
- Runner backend : exécution, checkpointing, retry
- Mode system : NodeRegistry extensible par domaine
- Cron bidirectionnel : crons qui déclenchent des workflows ET nodes CRON dans les workflows

---

## Architecture — 3 couches

```
┌─────────────────────────────────────────────────────────┐
│  Frontend — /workflows                                   │
│  ListView | LiveView | Editor (React Flow)              │
├─────────────────────────────────────────────────────────┤
│  Backend — WorkflowEngine                               │
│  NodeRegistry | TriggerRegistry | Runner | EventBus     │
├─────────────────────────────────────────────────────────┤
│  Storage                                                │
│  ~/.jinn/workflows/*.yaml (defs) + SQLite (runs/steps)  │
└─────────────────────────────────────────────────────────┘
```

---

## Backend

### Nouveaux fichiers `packages/jimmy/src/workflows/`

```
engine.ts         ← WorkflowEngine class (singleton)
registry.ts       ← NodeRegistry + TriggerRegistry
runner.ts         ← exécution d'un run, step par step
executor.ts       ← dispatch vers les node handlers
nodes/
  trigger.ts
  agent.ts        ← crée une session Jinn → employee
  condition.ts    ← parser d'expressions safe (pas eval())
  move-card.ts    ← PATCH kanban card
  notify.ts       ← discord / telegram / slack
  wait.ts         ← suspend + reprise (HITL)
  cron.ts         ← node CRON embarqué dans un workflow
  done.ts
triggers/
  manual.ts
  cron.ts         ← cron system-level (lance un workflow)
  webhook.ts
  kanban.ts       ← écoute board:card_moved / board:card_added
  session.ts      ← écoute session:completed (chaîne workflows)
```

### Migrations SQLite

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  status TEXT NOT NULL,          -- queued|running|waiting|success|error|cancelled
  trigger_type TEXT,
  trigger_payload TEXT,          -- JSON
  context TEXT DEFAULT '{}',     -- JSON : variables accumulées
  current_node_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
);

CREATE TABLE workflow_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL,          -- pending|running|success|failed|skipped|waiting
  input TEXT,
  output TEXT,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT
);
```

### Routes API

```
GET    /api/workflows                        → liste des defs
POST   /api/workflows                        → créer
GET    /api/workflows/:id                    → def complète
PUT    /api/workflows/:id                    → update
DELETE /api/workflows/:id                    → supprimer
PATCH  /api/workflows/:id/toggle             → enable/disable

GET    /api/workflows/:id/runs               → historique runs
POST   /api/workflows/:id/trigger            → déclencher manuellement
GET    /api/workflows/runs/:runId            → état d'un run
GET    /api/workflows/runs/:runId/steps      → steps
POST   /api/workflows/runs/:runId/approve    → reprendre WAIT node
DELETE /api/workflows/runs/:runId            → annuler

GET    /api/workflows/runs/:runId/stream     → SSE live (tokens LLM inclus)
GET    /api/workflows/node-types             → catalogue nodes par mode
GET    /api/workflows/templates              → templates préconfigurés
```

### Cron bidirectionnel

```
Sens 1 — Cron → Workflow :
  trigger.type = "cron", trigger.schedule = "0 9 * * *"
  → WorkflowEngine enregistre un job node-cron au démarrage

Sens 2 — Workflow → Cron :
  node type CRON dans le graph
  config : { action: "create"|"pause"|"resume"|"delete", job_id, schedule }
  → interagit avec le CronScheduler existant de jimmy
```

### Kanban — event granulaire manquant

Ajouter dans `api.ts` :
```
PATCH /api/org/departments/:name/board/cards/:cardId
→ émet context.emit('board:card_moved', { board, cardId, from, to })
→ WorkflowEngine écoute cet event pour les triggers kanban
```

---

## Frontend

### Structure pages

```
/workflows
  page.tsx                ← dashboard 3 tabs (Workflows | Live | History)
  [id]/page.tsx           ← éditeur React Flow
  runs/[runId]/page.tsx   ← vue live d'un run
```

### Tab Workflows — dashboard

- Cards par workflow : nom, trigger, nb runs, statut enabled/disabled
- Actions : Edit, Run, Enable/Disable, Delete
- Bouton `+ New Workflow` + `Templates ▼`

### Tab Live — runs en cours

- SSE polling : statut step par step
- Indicateur visuel par node : ✓ done / ↻ running / ⏸ waiting
- Bouton Approve/Reject pour WAIT nodes

### Tab History — runs passés

- Statut, durée, trigger type, date

### Éditeur React Flow `/workflows/[id]`

**Sidebar gauche — Node palette :**
```
TRIGGERS  : Manual | Cron | Webhook | Kanban event
ACTIONS   : Agent | Notify | Move Card | Cron (manage)
CONTROL   : Condition | Wait/Approval | Sub-workflow
MODES     : Discord | GitHub | Hermes | Monitor | Connectors
```

**Canvas :**
- Nodes custom par type (couleur + icône)
- Edges colorées selon statut runtime
- Overlay live : statut + tokens LLM streamés

**Properties panel (sidebar droite) :**
- Formulaire contextuel par node
- AGENT : dropdown employees org
- CRON : expression + preview "next run in 4h"
- CONDITION : autocomplete variables de contexte
- NOTIFY : connector + template Markdown

**Toolbar :**
```
[← Back]  nom v3  [● Enabled]  |  [▶ Test Run]  [Save]  [Deploy]
```

### State management — Zustand

```typescript
interface WorkflowEditorStore {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  definition: WorkflowDefinition
  isDirty: boolean
  version: number
  activeRunId: string | null
  stepStates: Map<string, StepState>   // nodeId → statut live
  
  addNode(type: NodeType, position: XYPosition): void
  updateNodeConfig(nodeId: string, config: unknown): void
  saveWorkflow(): Promise<void>
  triggerRun(inputs?: Record<string, unknown>): Promise<string>
}
```

---

## Mode System — extensibilité

```typescript
workflowEngine.registerMode({
  id: "discord",
  label: "Discord",
  icon: "🎮",
  requiredConfig: ["discord.bot_token"],
  nodes: [DiscordOnMessageNode, DiscordSendNode],
  triggers: [DiscordMessageTrigger],
  templates: [DiscordBotTemplate],
})
```

### Modes post-MVP

| Mode | Valeur | Effort |
|------|--------|--------|
| Discord | Bots visuels | Faible — notifyDiscordChannel existe |
| GitHub | Pipeline dev auto | Moyen |
| Hermes | Cross-profils | Faible — sessions existent |
| Monitor | Alerting + auto-remediation | Moyen |
| Connectors | Zero effort — expose l'existant | Très faible |

---

## Impacts

- **Économie tokens** : conditions, moves, notifications = 0 LLM call
- **Bots Discord visuels** : comportement = graph, pas du code
- **Kanban runtime** : déplacer une carte déclenche un workflow
- **Observabilité** : chaque run loggé, chaque step inspectable
- **Extensible** : nouveau mode = 3 lignes de registration

---

## Planning

```
Semaine 1-2 : Backend Ph1
  ├── SQLite migrations
  ├── WorkflowEngine + NodeRegistry
  ├── 8 node handlers MVP
  ├── PATCH card kanban (event granulaire)
  └── Routes CRUD + trigger manual

Semaine 3 : Backend Ph2
  ├── Triggers cron + webhook + kanban event
  ├── SSE stream /runs/:id/stream
  ├── WAIT/HITL suspend + resume
  └── Tests

Semaine 4-5 : Frontend Ph1
  ├── Page /workflows dashboard (3 tabs)
  ├── React Flow + 8 custom nodes
  ├── Properties panel
  └── Save/Deploy

Semaine 6 : Frontend Ph2 + intégration
  ├── Live run overlay SSE
  ├── Mode Discord MVP
  └── Templates starter pack
```

---

*Plan validé par Firefloc — 2026-04-01*
