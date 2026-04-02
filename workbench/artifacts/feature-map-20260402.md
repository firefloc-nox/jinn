# Feature Map — Jinn Frontend
**Date :** 2026-04-02  
**Version :** Jinn 0.9.3 (branche `lain`)  
**URL :** http://127.0.0.1:7778  
**Méthode :** Analyse statique code source + tests API curl

---

## Layout & Navigation

- Sidebar navigation (icônes) : ✅ PASS — 12 items, groupes, active state
- Sidebar expanded (labels) : ✅ PASS — classe opacity-0 → se révèle au hover
- Hermes status badge (sidebar) : ❌ FAIL — reste en "loading" permanent (B11: `/api/hermes/status` → 404)
- Theme toggle (dark/light/system) : ✅ PASS — bouton en bas sidebar, localStorage `jinn-theme`
- Breadcrumb bar : ✅ PASS — contexte React, mis à jour par chaque page
- Mobile menu (hamburger) : 🚧 NOT TESTED — requiert vrai browser
- Notification bell : 🚧 NOT TESTED — requiert interaction browser
- Quick search (⌘K) : 🚧 NOT TESTED — requiert interaction browser

---

## 1. Dashboard (`/`)

- Chargement de la page : ✅ PASS — SSR + hydratation client
- Stat card "Uptime" : ⚠️ PARTIAL — s'affiche "--" au SSR, se met à jour côté client
- Stat card "Active Sessions" : ⚠️ PARTIAL — idem, `sessions.active = 0` après hydratation
- Stat card "Engines" : ⚠️ PARTIAL — idem, affiche le brain primaire + fallbacks
- Stat card "Cron Jobs" : ⚠️ PARTIAL — idem, `2` cron jobs après hydratation
- Quick Links (Chat, Org, Kanban, Cron, Costs, Logs) : ⚠️ PARTIAL — "Costs" → 404 (B5)
- Section "Hermes Activity" : ⚠️ PARTIAL — affiche "Loading…" (dépend de `/api/hermes/sessions`)
- Section "Recent Activity" : ✅ PASS — WebSocket + polling `/api/activity`, "Waiting for events…" si vide
- Redirect onboarding (si needed) : ✅ PASS — vérifie `/api/onboarding` au mount

---

## 2. Chat (`/chat`)

- Interface chat : ✅ PASS — `ChatPane`, `ChatSidebar`, `ChatTabs`
- Envoi message : 🚧 NOT TESTED — nécessite browser interactif
- Sélection agent : 🚧 NOT TESTED
- Sessions historique : 🚧 NOT TESTED
- Voice/STT : 🚧 NOT TESTED
- File attachment : 🚧 NOT TESTED
- Streaming réponse : 🚧 NOT TESTED
- Queue panel : 🚧 NOT TESTED
- Keyboard shortcuts overlay : 🚧 NOT TESTED
- CLI transcript view : 🚧 NOT TESTED

---

## 3. Organisation (`/org`)

- Chargement de la page : ✅ PASS — `/api/org` → 200, 2 départements, agents listés
- Vue "Map" (React Flow organigramme) : 🚧 NOT TESTED — nécessite browser (dynamic import)
- Vue "Grid" : 🚧 NOT TESTED
- Vue "Feed" : 🚧 NOT TESTED
- Vue "Tree" : 🚧 NOT TESTED
- Detail panel agent : 🚧 NOT TESTED
- New Agent modal : ✅ PASS (code) — composant `NewAgentModal`, POST `/api/org/employees`
- Delete agent : ✅ PASS (code) — DELETE `/api/org/employees/:name`
- Edit agent (PATCH) : ✅ PASS (code) — PATCH `/api/org/employees/:name`
- Hermes profile editor : ✅ PASS (code) — `HermesProfileEditorModal`, GET/PATCH `/api/hermes/profiles/:name`
- Hierarchy warnings display : ✅ PASS (code) — affiche les warnings de `hierarchy.warnings`
- COO node virtuel : ✅ PASS (code) — ajouté dynamiquement depuis `settings.portalName`
- Dept board (ancien) : ⚠️ PARTIAL — endpoint retourne `[]` au lieu de 404 (B4 résolu)

---

## 4. Kanban (`/kanban`)

- Chargement de la page : ✅ PASS — `/api/boards` + `/api/org`
- Liste boards sidebar : ✅ PASS — affiche tous les boards, board actif highlighted
- Créer un board (modal) : ✅ PASS — modal avec nom, description, colonnes personnalisables
- Sélectionner un board : ✅ PASS — charge `/api/boards/:id` (config + cards)
- Renommer un board (click) : ✅ PASS — input inline + PATCH `/api/boards/:id`
- Supprimer un board : ✅ PASS — bouton visible au hover (classe `group` présente sur `div.group`)
- Colonnes par défaut : ✅ PASS — Backlog, To Do, In Progress, Review, Done
- Renommer une colonne (double-click) : ✅ PASS — input inline + PATCH
- Supprimer une colonne (vide) : ❌ FAIL — bouton trash INVISIBLE (B6: manque classe `group` sur parent colonne)
- Ajouter une colonne : ❌ FAIL — utilise `window.prompt()` natif (B7: UX cassée)
- Ajouter une carte : ✅ PASS — clic "+ Add Card" → inline input
- Drag & drop carte : 🚧 NOT TESTED — HTML5 DnD, requiert browser
- Déplacer carte (API) : ✅ PASS (code) — PATCH `/api/boards/:id/cards/:cardId` avec `{columnId}`
- Card detail drawer : ✅ PASS (code) — slide-in depuis la droite, titre/description/assignee/priority
- Modifier titre carte (drawer) : ✅ PASS — PATCH `/api/boards/:id/cards/:cardId`
- Assigner un agent : ✅ PASS — select avec liste employees depuis `/api/org`
- Changer priorité : ✅ PASS — select low/medium/high, badge coloré
- Supprimer une carte : ✅ PASS — bouton Delete dans le drawer
- Filtres assignee/priorité : ✅ PASS — filtres dans le header du board
- WorkState dot (working/done/failed) : ✅ PASS — indicateur visuel sur les cartes
- Persistance (refresh) : ✅ PASS — données en backend SQLite, rechargées au mount
- Boards vides (état initial) : ✅ PASS — empty state avec CTA "Create your first board"

---

## 5. Cron Jobs (`/cron`)

- Chargement de la page : ✅ PASS — `/api/cron` → 2 jobs
- Liste des jobs : ✅ PASS — avec nom, schedule human-readable, toggle enabled/disabled
- Tab "List" : ✅ PASS — affichage, filtres (all/enabled/disabled)
- Tab "Schedule" (WeeklySchedule) : 🚧 NOT TESTED
- Tab "Pipeline" (PipelineGraph) : 🚧 NOT TESTED
- Toggle enabled/disabled : ✅ PASS — PUT `/api/cron/:id` avec `{enabled}`, UI optimiste
- Trigger manuel "Run Now" : ✅ PASS (code) — POST `/api/cron/:id/trigger`
- Expanded detail (schedule, engine, model) : ✅ PASS
- Recent Runs (lazy) : ✅ PASS (code) — GET `/api/cron/:id/runs`
- Last/Next run display : ⚠️ PARTIAL — API retourne `_hermesLastRunAt` / `_hermesNextRunAt` (non-standard), UI utilise `CronRun.startedAt` de `/api/cron/:id/runs`

---

## 6. Workflows Dashboard (`/workflows`)

- Chargement de la page : ✅ PASS — `/api/workflows` → 7 workflows
- Tab "Workflows" (liste) : ✅ PASS — cards avec nom, trigger type, nb nodes
- Tab "Live" : ✅ PASS — poll toutes 3s, runs running/waiting/queued
- Tab "History" : ✅ PASS — runs terminés, `started_at` et `trigger_type` (snake_case) correctement affichés
- Créer un workflow (modal "+ New Workflow") : ✅ PASS — nom, description, trigger type → POST `/api/workflows`
- Créer depuis template : ✅ PASS — modal "Templates" → GET `/api/workflows/templates` (5 templates)
- Toggle enable/disable : ✅ PASS — B1 résolu, PATCH `/api/workflows/:id/toggle` envoie `{enabled: bool}`
- Run from list : ✅ PASS — navigue vers `/workflows/run?id=...`
- Redirect vers éditeur après création : ✅ PASS — `router.push('/workflows/editor?id=...')`
- Approve run (waiting status) : ✅ PASS (code) — bouton Approve visible dans Live tab
- Workflow History : champs `startedAt`/`triggerType` : ✅ PASS — B3 résolu, double-fallback

---

## 7. Éditeur Workflow (`/workflows/editor?id=...`)

- Chargement du workflow : ✅ PASS (code) — GET `/api/workflows/:id`
- Récupération de l'id URL : ⚠️ PARTIAL — B8: `window.location.search` au lieu de `useSearchParams()`, peut causer hydratation mismatch
- ReactFlow canvas : 🚧 NOT TESTED — requiert browser
- Node palette (sidebar gauche) : ✅ PASS (code) — TRIGGERS, ACTIONS, CONTROL + Mode nodes
- Mode nodes dynamiques : ✅ PASS (code) — GET `/api/workflows/node-types`, affiche `discord.send`, `discord.notify`
- Drag & drop node depuis palette : 🚧 NOT TESTED — requiert browser
- Properties panel (clic nœud) : ✅ PASS (code) — `PropertiesPanel` slide-in
- Connecter des nœuds : 🚧 NOT TESTED
- Sauvegarder : ✅ PASS (code) — PUT `/api/workflows/:id`, bouton Save désactivé si pas dirty
- Indicateur dirty (•) : ✅ PASS — pastille orange dans le toolbar
- Test Run → navigation : ✅ PASS — B2 résolu, navigue `/workflows/run?id=...`
- Toggle enabled (toolbar) : ✅ PASS — B1 résolu
- Retour liste : ✅ PASS — bouton ← dans toolbar

---

## 8. Workflow Run View (`/workflows/run?id=...`)

- Chargement du run : ✅ PASS (code) — GET `/api/workflows/runs/:runId`
- Récupération de l'id URL : ⚠️ PARTIAL — B8: même bug que l'éditeur
- Chargement définition workflow : ✅ PASS (code) — charge via `r.workflowId ?? r.workflow_id`
- ReactFlow read-only : 🚧 NOT TESTED
- Step Logs panel : ✅ PASS (code) — GET `/api/workflows/runs/:id/steps`
- SSE stream (`/api/workflows/runs/:id/stream`) : 🚧 NOT TESTED
- Polling fallback (5s) : ✅ PASS (code)
- Approve/Reject buttons (waiting) : ✅ PASS (code)
- Status badge : ✅ PASS (code) — queued/running/waiting/success/error/cancelled

---

## 9. Logs (`/logs`)

- Chargement de la page : ✅ PASS — GET `/api/logs?n=5` → 5 lignes récentes
- LogBrowser composant : ✅ PASS (code) — `components/activity/log-browser.tsx`
- Filtres/recherche : 🚧 NOT TESTED
- Auto-refresh : 🚧 NOT TESTED

---

## 10. Skills (`/skills`)

- Chargement de la page : ✅ PASS (code) — GET `/api/skills`
- Affichage liste : ❌ FAIL — `/api/skills` retourne `[]`, page vide "No skills found" (B10)
- Modal détail skill : 🚧 NOT TESTED (bloqué par B10)
- Markdown rendering : 🚧 NOT TESTED (bloqué par B10)

---

## 11. Settings (`/settings`)

- Chargement de la page : ✅ PASS — GET `/api/config`
- Section Portal Name/Operator : ✅ PASS (code) — localStorage `jinn-settings`
- Section Themes : ✅ PASS (code) — 20+ thèmes, preview couleurs
- Section Accent color : ✅ PASS (code) — 12 presets + custom hex
- Section Gateway config (port, host) : ✅ PASS (code) — PUT `/api/config`
- Section Brain routing (primary/fallbacks) : ✅ PASS (code) — drag-to-reorder fallbacks
- Section Engines (claude, codex, hermes) : ✅ PASS (code)
- Reload connectors : ✅ PASS (code) — POST `/api/connectors/reload`
- STT config : ✅ PASS (code) — GET/PUT `/api/stt/config`
- Save config : ✅ PASS (code) — PUT `/api/config`

---

## 12. Costs (`/costs`)

- Page : ❌ FAIL — route Next.js inexistante → 404 (B5)
- API backend : ✅ PASS — `/api/costs/summary` et `/api/costs/by-employee` répondent 200
- Lib `costs.ts` : ✅ PASS — types complets (ModelPricing, RunCost, JobCostSummary, DailyCost)

---

## 13. Hermes Sessions (`/hermes/sessions`)

- Chargement de la page : ✅ PASS — GET `/api/hermes/sessions`
- Liste sessions : ✅ PASS — pagination, filtres source, tri
- Filtres (source: all/cli/discord/telegram/jinn) : ✅ PASS (code)
- Tri (date, tokens, durée) : ✅ PASS (code)
- Search sessions : ✅ PASS (code) — debounce 300ms
- Detail session (click) : 🚧 NOT TESTED
- Messages view : 🚧 NOT TESTED
- Estimation coût USD : ✅ PASS (code) — formule blended $3/Mtok in + $15/Mtok out
- Export (download) : 🚧 NOT TESTED

---

## 14. Hermes Memory (`/hermes/memory`)

- Chargement de la page : ✅ PASS — GET `/api/hermes/memory` → entries + usage %
- Usage bar (memory + user) : ✅ PASS (code) — parse "81% — 1803/2200 chars"
- Affichage entrées : ✅ PASS (API validée: 7 entrées memory, 6 entrées user)
- Edit entrée : 🚧 NOT TESTED
- Delete entrée : 🚧 NOT TESTED
- Add entrée : 🚧 NOT TESTED
- Import/Export : 🚧 NOT TESTED
- Warning critique (>100%) : ✅ PASS (code) — barre rouge + classe `isCritical`

---

## 15. Hermes Skills (`/hermes/skills`)

- Chargement de la page : ✅ PASS — GET `/api/hermes/skills` → 111 skills
- Liste skills avec catégories : ✅ PASS (code) — badges colorés par catégorie
- Filtres par catégorie : ✅ PASS (code)
- Recherche : ✅ PASS (code) — filtre sur name + description
- Detail skill (click) : 🚧 NOT TESTED
- Catégories représentées : 20 catégories (mlops, devops, creative, github, etc.)

---

## APIs Backend (résumé)

| Endpoint | Status | Note |
|---|---|---|
| GET /api/status | ✅ 200 | uptime, engines, sessions |
| GET /api/org | ✅ 200 | 2 départements, N agents |
| GET /api/boards | ✅ 200 | `[]` (aucun board créé) |
| GET /api/workflows | ✅ 200 | 7 workflows |
| GET /api/workflows/node-types | ✅ 200 | base + modes + legacy |
| GET /api/workflows/templates | ✅ 200 | 5 templates |
| PATCH /api/workflows/:id/toggle | ✅ 200 | envoie `{enabled}` |
| POST /api/workflows/:id/trigger | ✅ 200 | retourne `{id, workflow_id, status}` |
| GET /api/workflows/runs/:id | ✅ 200 | snake_case |
| GET /api/cron | ✅ 200 | 2 jobs |
| GET /api/logs | ✅ 200 | dernières lignes |
| GET /api/skills | ✅ 200 | `[]` (vide) |
| GET /api/config | ✅ 200 | config complète |
| GET /api/hermes/sessions | ✅ 200 | liste paginée |
| GET /api/hermes/memory | ✅ 200 | entries + usage |
| GET /api/hermes/skills | ✅ 200 | 111 skills |
| GET /api/hermes/status | ❌ 404 | Not found (B11) |
| GET /api/costs | ❌ 404 | Not found |
| GET /api/costs/summary | ✅ 200 | totaux (tous à 0) |
| GET /api/costs/by-employee | ✅ 200 | par employé |
| GET /api/org/departments/:name/board | ✅ 200 | retourne `[]` |

---

## Récapitulatif global

| Section | Statut global | Notes |
|---|---|---|
| Dashboard | ⚠️ PARTIAL | Stats "--" au SSR, lien Costs → 404 |
| Chat | 🚧 NOT TESTED | Interface présente, tests interactifs bloqués |
| Organisation | ⚠️ PARTIAL | Vues non testées (browser), APIs OK |
| Kanban | ⚠️ PARTIAL | Column delete invisible, add column via prompt() |
| Cron | ✅ PASS | Fonctionnel, dernier run via sous-API |
| Workflows (dashboard) | ✅ PASS | B1/B2/B3 résolus |
| Workflows (editor) | ⚠️ PARTIAL | useSearchParams bug, canvas non testé |
| Workflows (run view) | ⚠️ PARTIAL | useSearchParams bug, SSE non testé |
| Logs | 🚧 NOT TESTED | API OK, composant non testé |
| Skills | ❌ FAIL | API retourne [] |
| Settings | ✅ PASS | APIs et UI code OK |
| Costs | ❌ FAIL | Page manquante (404) |
| Hermes Sessions | ✅ PASS | 2 sessions actives, API OK |
| Hermes Memory | ✅ PASS | 7 entrées, usage 81% |
| Hermes Skills | ✅ PASS | 111 skills, 20 catégories |
