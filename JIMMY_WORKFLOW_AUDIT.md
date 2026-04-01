# Audit Jimmy (Jinn Gateway) — Capacités pour un Workflow Engine

> Généré le 2026-04-01 depuis `/packages/jimmy/src/`

---

## 1. Inventaire complet des routes API

### Sessions

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/status` | Statut du gateway : engines, connectors, sessions running, uptime |
| `GET` | `/api/instances` | Liste des instances Jinn connues avec port et état de santé |
| `GET` | `/api/sessions` | Liste toutes les sessions (avec queueDepth, transportState) |
| `GET` | `/api/sessions/interrupted` | Sessions interrompues pouvant être reprises après restart |
| `GET` | `/api/sessions/hermes-activity` | Activité Hermes enrichie avec metadata Jinn (`?limit=N`) |
| `GET` | `/api/sessions/:id` | Détail d'une session + messages. Supporte `?last=N` |
| `PUT` | `/api/sessions/:id` | Met à jour le titre d'une session |
| `DELETE` | `/api/sessions/:id` | Supprime une session (tue le process engine si vivant) |
| `POST` | `/api/sessions/:id/stop` | Arrête une session en cours, vide la queue |
| `POST` | `/api/sessions/:id/reset` | Remet une session bloquée à zéro (vide engineSessions, override, errors) |
| `POST` | `/api/sessions/:id/duplicate` | Fork d'une session (snapshot + fork du session engine) |
| `GET` | `/api/sessions/:id/children` | Enfants d'une session (sous-délégations) |
| `GET` | `/api/sessions/:id/transcript` | Transcrit brut Claude Code JSONL |
| `POST` | `/api/sessions` | Crée une session web et lance l'engine async. Body: `{prompt, engine?, employee?, parentSessionId?, effortLevel?, attachments?}` |
| `POST` | `/api/sessions/stub` | Crée une session avec message initial pré-rempli (onboarding lazy) |
| `POST` | `/api/sessions/bulk-delete` | Suppression multiple. Body: `{ids: string[]}` |
| `POST` | `/api/sessions/:id/message` | Envoie un message à une session existante. Supporte `role: notification` |
| `GET` | `/api/sessions/:id/queue` | Liste les items en attente dans la queue |
| `DELETE` | `/api/sessions/:id/queue` | Vide toute la queue d'une session |
| `DELETE` | `/api/sessions/:id/queue/:itemId` | Annule un item spécifique dans la queue |
| `POST` | `/api/sessions/:id/queue/pause` | Met la queue d'une session en pause |
| `POST` | `/api/sessions/:id/queue/resume` | Reprend la queue d'une session pausée |
| `GET` | `/api/activity` | Activité récente dérivée des sessions (30 derniers events) |

### Organisation / Employés

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/org` | Org complète : departments, employees, hiérarchie, COO synthétique |
| `GET` | `/api/org/employees/:name` | Détail d'un employé avec position hiérarchique |
| `POST` | `/api/org/employees` | Crée un employé (YAML + optionnel clone profil Hermes). Body: `{name, persona, engine?, rank?, department?, reportsTo?, hermesProfile?, ...}` |
| `PATCH` | `/api/org/employees/:name` | Met à jour les champs d'un employé (persona, engine, model, rank, hermesProfile, etc.) |
| `DELETE` | `/api/org/employees/:name` | Supprime un employé. `?deleteHermesProfile=true` pour supprimer aussi le profil |
| `GET` | `/api/org/services` | Liste tous les services inter-département publiés par les employés |
| `POST` | `/api/org/cross-request` | Route une demande de service vers le provider. Body: `{fromEmployee, service, prompt, parentSessionId?}` |
| `GET` | `/api/org/departments/:name/board` | Lit le board Kanban d'un département (board.json) |
| `PUT` | `/api/org/departments/:name/board` | Écrit en entier le board Kanban d'un département |

### Cron

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/cron` | Liste tous les jobs (Hermes + Jinn-only) enrichis avec dernier run |
| `GET` | `/api/cron/:id/runs` | Historique des runs d'un job (fichier JSONL) |
| `POST` | `/api/cron` | Crée un nouveau job. Body: `{name, schedule, prompt, engine?, model?, employee?, delivery?, timezone?}` |
| `PUT` | `/api/cron/:id` | Met à jour un job (name, enabled, schedule, prompt, delivery) |
| `DELETE` | `/api/cron/:id` | Supprime un job |
| `POST` | `/api/cron/:id/trigger` | Déclenche manuellement un job |

### Skills

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/skills` | Liste les skills installés localement |
| `GET` | `/api/skills/:name` | Contenu du fichier SKILL.md d'un skill |
| `GET` | `/api/skills/manifest` | Manifest JSON des skills installés |
| `GET` | `/api/skills/search?q=` | Recherche dans le registre skills.sh |
| `POST` | `/api/skills/install` | Installe un skill depuis skills.sh. Body: `{source}` |
| `DELETE` | `/api/skills/:name` | Supprime un skill local |

### Hermes (WebAPI proxy)

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/hermes/health` | Santé du daemon Hermes |
| `GET` | `/api/hermes/sessions` | Sessions Hermes (`?limit`, `?offset`, `?source`) |
| `GET` | `/api/hermes/sessions/search` | Recherche plein texte sur les sessions Hermes (`?q=`) |
| `GET` | `/api/hermes/sessions/:id` | Détail d'une session Hermes |
| `GET` | `/api/hermes/sessions/:id/messages` | Messages d'une session Hermes |
| `GET` | `/api/hermes/memory` | Mémoire globale Hermes |
| `PATCH` | `/api/hermes/memory` | Met à jour la mémoire Hermes. Body: `{target, action, content, old_text?}` |
| `GET` | `/api/hermes/skills` | Skills Hermes disponibles |
| `GET` | `/api/hermes/models` | Modèles disponibles dans Hermes |
| `GET` | `/api/hermes/cron` | Jobs cron Hermes (lecture filesystem directe) |
| `GET` | `/api/hermes/profiles` | Profils Hermes disponibles |
| `GET` | `/api/hermes/profiles/:name` | Détail d'un profil (SOUL.md, AGENT.md, config.yaml) |
| `POST` | `/api/hermes/profiles` | Crée un profil (clone depuis existant). Body: `{name, cloneFrom?}` |
| `PATCH` | `/api/hermes/profiles/:name` | Met à jour les fichiers d'un profil (soul, agent, role_soul, config) |
| `DELETE` | `/api/hermes/profiles/:name` | Supprime un profil (refuse si utilisé par un employé) |

### Goals

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/goals` | Liste tous les goals (SQLite) |
| `GET` | `/api/goals/tree` | Goals en arbre (parent/children) |
| `POST` | `/api/goals` | Crée un goal. Body: `{title, description?, status?, level?, parentId?, department?, owner?, progress?}` |
| `GET` | `/api/goals/:id` | Détail d'un goal |
| `PUT` | `/api/goals/:id` | Met à jour un goal |
| `DELETE` | `/api/goals/:id` | Supprime un goal (cascade children) |

### Costs & Budgets

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/costs/summary` | Résumé des coûts Jinn + Hermes par période (`?period=day|week|month`) |
| `GET` | `/api/costs/by-employee` | Coûts ventilés par employé |
| `GET` | `/api/budgets` | Budgets configurés par employé avec statuts |
| `PUT` | `/api/budgets` | Met à jour les limites de budget |
| `POST` | `/api/budgets/:employee/override` | Override temporaire de budget pour un employé |
| `GET` | `/api/budgets/events` | Historique des events budget |

### Connectors

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/connectors` | Liste tous les connectors actifs avec santé |
| `POST` | `/api/connectors/reload` | Hot-reload des instances connector depuis la config |
| `POST` | `/api/connectors/:id/send` | Envoie un message via un connector. Body: `{channel, text, thread?}` |
| `POST` | `/api/connectors/:id/incoming` | Injecte un message entrant (proxy Discord) |
| `POST` | `/api/connectors/:id/proxy` | Proxy d'opérations connector (sendMessage, editMessage, addReaction, setTypingStatus…) |
| `GET` | `/api/connectors/whatsapp/qr` | QR code WhatsApp (data URL PNG) |

### Config, Logs, Onboarding, STT, Files

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/config` | Config actuelle sanitisée (secrets masqués) |
| `PUT` | `/api/config` | Met à jour la config (deep merge, hot-reload) |
| `GET` | `/api/logs` | Dernières N lignes du log gateway (`?n=100`) |
| `GET` | `/api/onboarding` | Check si onboarding requis |
| `POST` | `/api/onboarding` | Persiste les paramètres du portal (portalName, operatorName, language) |
| `GET` | `/api/stt/status` | Statut du modèle STT (Whisper) |
| `POST` | `/api/stt/download` | Télécharge le modèle STT configuré |
| `POST` | `/api/stt/transcribe` | Transcrit un fichier audio (multipart, jusqu'à 100MB) |
| `PUT` | `/api/stt/config` | Met à jour les langues STT |
| `POST` | `/api/files` | Upload de fichier (multipart) |
| `GET` | `/api/files/:id` | Télécharge un fichier uploadé |
| `DELETE` | `/api/files/:id` | Supprime un fichier |
| `POST` | `/api/files/transfer` | Transfère un fichier vers une URL distante |

---

## 2. Events émis par Jimmy (WebSocket broadcast + triggers workflow)

Tous les events sont broadcastés sur `/ws` via `emit(event, payload)` vers tous les clients WebSocket connectés. Format : `{ event: string, payload: unknown, ts: number }`.

### Events Sessions

| Event | Payload | Contexte |
|-------|---------|----------|
| `session:started` | `{ sessionId }` | Juste avant l'exécution d'une session (queue dequeue) |
| `session:completed` | `{ sessionId, result, error?, cost?, durationMs? }` | Fin d'une session (succès ou erreur) |
| `session:created` | `{ sessionId }` | Session dupliquée créée |
| `session:updated` | `{ sessionId }` | Titre mis à jour, reset effectué |
| `session:deleted` | `{ sessionId }` | Session supprimée (unitaire ou bulk) |
| `session:stopped` | `{ sessionId }` | Session stoppée manuellement |
| `session:interrupted` | `{ sessionId, reason }` | Interruption par nouveau message |
| `session:resumed` | `{ sessionId }` | Session interrompue reprise |
| `session:queued` | `{ sessionId, message }` | Message mis en queue (engine déjà running) |
| `session:notification` | `{ sessionId, message }` | Notification système dans une session (rate-limit, callback enfant) |
| `session:delta` | `{ sessionId, delta, role? }` | Streaming incrémental (token par token) |
| `session:rate-limited` | `{ sessionId, resetsAt?, strategy }` | Session bloquée par rate limit |
| `sessions:interrupted` | `{ count, sessions[] }` | Broadcast au démarrage si sessions reprises disponibles |

### Events Queue

| Event | Payload | Contexte |
|-------|---------|----------|
| `queue:updated` | `{ sessionId, sessionKey, depth?, paused? }` | Queue modifiée (ajout, suppression, pause, resume) |

### Events Organisation

| Event | Payload | Contexte |
|-------|---------|----------|
| `org:updated` | `{ employee }` | Employé créé, modifié ou supprimé |
| `org:changed` | `{}` | Changement détecté dans le dossier org/ (file watcher) |
| `board:updated` | `{ department }` | Board Kanban d'un département mis à jour |

### Events Fichiers

| Event | Payload | Contexte |
|-------|---------|----------|
| `file:uploaded` | `{ id, filename, size }` | Fichier uploadé via /api/files |
| `file:transferred` | `{ destination, ok, failed }` | Transfert de fichier terminé |
| `file:deleted` | `{ id, filename }` | Fichier supprimé |

### Events Config / Système

| Event | Payload | Contexte |
|-------|---------|----------|
| `config:updated` | `{ portal }` | Portal settings mis à jour (onboarding) |
| `config:reloaded` | `{}` | Config rechargée depuis disque (file watcher) |
| `cron:reloaded` | `{}` | Jobs cron rechargés (file watcher) |
| `skills:changed` | `{}` | Dossier skills modifié (file watcher) |
| `connectors:reloaded` | `{ started[], stopped[], errors[] }` | Instances connectors rechargées |

### Events STT

| Event | Payload | Contexte |
|-------|---------|----------|
| `stt:download:progress` | `{ progress }` | Progression du téléchargement du modèle |
| `stt:download:complete` | `{ model }` | Téléchargement terminé |
| `stt:download:error` | `{ error }` | Erreur de téléchargement |

### ⚠️ Events manquants (identifiés)

- **Cron** : aucun event `cron:started`, `cron:completed`, `cron:failed` n'est émis lors de l'exécution d'un job
- **Goals** : aucun event `goal:created`, `goal:updated`, `goal:completed` n'est émis
- **Kanban** : `board:updated` est émis mais sans granularité (pas de `card:created`, `card:moved`, `card:completed`)
- **Cross-request** : aucun event quand un cross-request est créé ou complété
- **Budget** : aucun event quand un budget est dépassé (seulement un blocage silencieux)

---

## 3. Capacités Agents (Session Manager + Org)

### Création d'une session agent via `POST /api/sessions`

```json
{
  "prompt": "Rédige un rapport sur les ventes",
  "engine": "hermes",          // hermes | claude | codex | gemini
  "employee": "jinn-writer",   // nom de l'employé (charge la persona + engine)
  "parentSessionId": "abc123", // optionnel : lie en child session (callback auto)
  "effortLevel": "high",       // low | medium | high | xhigh | max
  "attachments": ["file-id-1"] // IDs de fichiers préalablement uploadés
}
```

### Configuration d'un employé (YAML)

```yaml
name: jinn-writer
displayName: "Writing Specialist"
department: content
rank: employee          # executive | manager | senior | employee
reportsTo: coo          # hiérarchie (détermine escalation path)
persona: |
  Spécialiste en rédaction...
engine: hermes          # engine par défaut pour cet employé
model: claude-opus-4    # override modèle
fallbackEngine: claude  # fallback si engine principal KO
emoji: ✍️
alwaysNotify: true      # notifie le parent à chaque complétion
effortLevel: medium
cliFlags: ["--max-turns", "10"]
mcp: true               # active MCP (ou liste de serveurs)
# Hermes-specific
hermesProfile: writer-profile   # profil Hermes à utiliser
hermesProvider: anthropic
hermesToolsets: "web,code"
hermesSkills: "writing,research"
# Services cross-département
provides:
  - name: copywriting
    description: "Rédaction de textes marketing et web"
```

### Architecture Session Manager

- **Queue par sessionKey** : chaque session a sa propre queue FIFO (via `SessionQueue`)
- **Fallback Brain** : si l'engine demandé n'est pas disponible, fallback automatique selon `config.brain.fallbacks`
- **Rate-limit recovery** : si Claude rate-limited, switch auto vers Codex (configurable) avec sync transcript au retour
- **Parent/Child linking** : `parentSessionId` lie les sessions, le callback `notifyParentSession` envoie automatiquement le résultat au parent via `POST /api/sessions/:parentId/message`
- **Budget enforcement** : vérifie les budgets par employé avant chaque exécution
- **MCP** : résolution automatique des serveurs MCP depuis config + employee, injection via `--mcp-config`

### Engines disponibles

| Engine | Description |
|--------|-------------|
| `hermes` | Hermes daemon local (Hermes-first, MCP natif) |
| `claude` | Claude Code CLI |
| `codex` | OpenAI Codex CLI |
| `gemini` | Gemini CLI |

---

## 4. Capacités Notifications

### notifyDiscordChannel (callbacks.ts)

Fonction fire-and-forget qui envoie un message texte au channel Discord configuré dans `config.notifications`:

```yaml
notifications:
  connector: discord   # ou slack, telegram
  channel: "C0ACR0ZVD7H"
```

**Déclenchée automatiquement** par :
- Rate-limit Claude atteint → switch GPT
- Rate-limit résolu → retour Claude
- Retry timeout Claude dépassé

**Mécanisme** : appel HTTP interne → `POST /api/connectors/{connector}/send`

### notifyParentSession (callbacks.ts)

Notifie le parent d'une session child quand celle-ci termine :
- Succès : preview 200 chars du résultat + lien pour lire la session
- Erreur : message d'erreur
- Rate-limit : message "will auto-resume"

**Mécanisme** : `POST /api/sessions/{parentId}/message` avec `role: "notification"`

### notifyRateLimited / notifyRateLimitResumed

Notifient le parent de l'état du rate-limit (avec estimation de résolution).

### Connectors supportés

| Connector | Capacités |
|-----------|-----------|
| **Slack** | Receive messages, reply (threads), reactions, typing indicator |
| **Discord** | Receive messages, reply, reactions (mode direct ou proxy) |
| **Telegram** | Receive messages, reply |
| **WhatsApp** | Receive messages, reply, QR code auth |
| **Hermes-data** | Lecture des sessions/mémoire/skills Hermes via WebAPI |

**Envoi programmatique** via `POST /api/connectors/:name/send` avec `{channel, text, thread?}`.

---

## 5. Kanban — État actuel

### Structure du board

Le kanban est un **simple fichier JSON** par département : `~/.jinn/org/{department}/board.json`

Structure attendue (déduite du MCP gateway-server.ts) :
```json
[
  {
    "id": "uuid",
    "title": "Tâche à faire",
    "status": "todo | in_progress | done",
    "assignee": "jinn-writer",
    "priority": "low | medium | high | urgent",
    "notes": "..."
  }
]
```

### API Kanban existante

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/api/org/departments/:name/board` | Lit le board entier |
| `PUT` | `/api/org/departments/:name/board` | Remplace le board entier (pas de PUT card individuelle) |

**Problème majeur** : la mise à jour est **destructive** (full replace). Il n'y a pas d'opérations atomiques de type "move card" ou "update card status".

### Events Kanban existants

- ✅ `board:updated` : émis quand `PUT /api/org/departments/:name/board` est appelé
- ❌ **Pas d'event** pour `card:created`, `card:moved`, `card:status_changed`, `card:assigned`, `card:completed`

### Access via MCP (gateway-server.ts)

Les outils MCP `get_board` et `update_board` permettent aux agents de lire/écrire le board, mais toujours en full-replace.

### `kanbanTicketId` dans transportMeta

Un champ `kanbanTicketId` existe dans `transportMeta` des sessions (visible dans `/api/sessions/hermes-activity`), suggérant qu'une liaison session↔ticket est possible mais **non implémentée côté backend**.

---

## 6. Ce qui manque pour un Workflow Engine

### 6.1 Event Bus robuste

**Problème** : L'`emit()` actuel est un simple WebSocket broadcast. Il n'y a :
- ❌ Pas de persistance des events
- ❌ Pas d'abonnements filtrés (subscribe to `session:completed` where `employee="jinn-writer"`)
- ❌ Pas de retry si le consumer est absent
- ❌ Pas d'historique queryable

**Ce qu'il faudrait** : Un event store persistant (SQLite) + un système de subscriptions avec filtres.

### 6.2 State Machine / Workflow Engine

**Ce qui n'existe pas** :
- ❌ Pas de notion de "workflow" : séquence d'étapes conditionnelles
- ❌ Pas de transitions d'état définies formellement
- ❌ Pas de gestion des erreurs avec retry policies au niveau workflow
- ❌ Pas de parallel/join (fan-out/fan-in de sessions child)
- ❌ Pas de conditions/branches (if session:completed AND result contains "approved")

**Ce qui existe partiellement** :
- ✅ Parent/child sessions (délégation simple)
- ✅ Queue per session (séquentialisation)
- ✅ Rate-limit retry (auto-retry basique)
- ✅ Cross-request (service routing entre départements)

### 6.3 Triggers Workflow

**Ce qui manque** :
- ❌ Webhook inbound (déclencher un workflow depuis l'extérieur)
- ❌ Trigger on event (ex: "quand un goal est mis à jour, créer une session")
- ❌ Trigger on schedule avec contexte (les crons existent mais ne peuvent pas passer du contexte dynamique)
- ❌ Trigger on Kanban card move

**Ce qui existe** :
- ✅ Cron (schedule fixe, prompt statique)
- ✅ Connector messages (Slack/Discord → session)
- ✅ `POST /api/cron/:id/trigger` (déclenchement manuel)

### 6.4 Kanban granulaire

**Problème** : Le board est un fichier JSON écrasé en entier. Il n'y a pas de :
- ❌ PATCH card individuelle (`PATCH /api/org/departments/:dept/board/:cardId`)
- ❌ Events granulaires (`card:moved`, `card:completed`, `card:created`)
- ❌ Liaison automatique session ↔ ticket (le champ `kanbanTicketId` existe mais n'est pas writable via API)
- ❌ Historique des transitions de statut d'une carte

### 6.5 Goals / OKR non connectés

Le système de Goals (SQLite) existe mais :
- ❌ Aucun event émis lors des changements (`goal:created`, `goal:updated`, `goal:completed`)
- ❌ Pas de liaison goals ↔ sessions (quelle session travaille sur quel goal ?)
- ❌ Pas de liaison goals ↔ kanban cards
- ❌ Pas de progression automatique basée sur les sessions complétées

### 6.6 Pas de Webhook sortant générique

Il existe `notifyDiscordChannel` mais :
- ❌ Pas de webhook sortant vers une URL arbitraire (ex: Zapier, n8n, systèmes externes)
- ❌ Pas de `POST /api/webhooks` pour enregistrer des listeners

### 6.7 Pas d'API d'introspection workflow

- ❌ Pas de `GET /api/workflow/runs` pour voir les workflows en cours
- ❌ Pas de visualisation des dépendances parent/child au niveau graphe
- ❌ `/api/sessions/:id/children` existe mais ne remonte pas récursivement

### 6.8 Manque de contexte dynamique dans les Crons

Les cron jobs ont un `prompt` statique. Il manque :
- ❌ Templates avec variables (`{{date}}`, `{{lastRunResult}}`, `{{goal.title}}`)
- ❌ Injection de contexte depuis le résultat du dernier run
- ❌ Cron conditionnels (n'exécute que si une condition est vraie)

---

## 7. Résumé — Opportunités d'intégration Workflow

### ✅ Briques solides à exploiter immédiatement

1. **`POST /api/sessions`** → créer des sessions avec `employee` + `parentSessionId` = délégation hierarchique
2. **`session:completed` event** → trigger pour la prochaine étape d'un workflow
3. **`POST /api/org/cross-request`** → routing automatique vers le bon provider
4. **`POST /api/cron`** → créer des triggers temporels
5. **`POST /api/connectors/:id/send`** → notifications vers Slack/Discord à chaque étape
6. **WebSocket `/ws`** → écoute temps réel de tous les events du gateway
7. **`GET /api/sessions/:id/children`** → suivi des sous-tâches

### 🔧 À ajouter en priorité pour les workflows

| Priorité | Feature | Effort |
|----------|---------|--------|
| P0 | Events Kanban granulaires (`card:created`, `card:moved`) | Faible — juste ajouter emit() dans PUT board |
| P0 | Events Goals (`goal:created`, `goal:updated`, `goal:completed`) | Faible — ajouter emit() dans goals.ts |
| P1 | `PATCH /api/org/departments/:dept/board/:cardId` | Moyen |
| P1 | Event store persistant (SQLite) + GET /api/events | Moyen |
| P1 | Liaison `kanbanTicketId` ← session via API | Faible |
| P2 | Webhook outbound (`POST /api/webhooks/register`) | Moyen |
| P2 | Workflow engine minimal (DAG de sessions) | Élevé |
| P2 | Cron templates avec variables | Moyen |
| P3 | Webhook inbound (trigger externe) | Moyen |
| P3 | Fan-out/fan-in sessions parallel | Élevé |
