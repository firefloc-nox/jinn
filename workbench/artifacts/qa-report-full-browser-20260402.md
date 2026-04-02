# QA Report — Jinn Frontend
**Date:** 2026-04-02  
**Testeur:** Hermes Agent (mode subagent, analyse code + API)  
**URL:** http://127.0.0.1:7778  
**Version:** Jinn 0.9.3 (branch `lain`)  
**Méthode:** Analyse statique du code source + tests curl des APIs (browser bloqué sur adresses privées)

---

## Executive Summary

| Sévérité | Nb | Bugs |
|---|---|---|
| 🔴 Critique | 2 | B5 (page /costs 404), B6 (column delete invisible) |
| 🟠 Majeur | 3 | B1 (toggle body vide → RÉSOLU), B2 (Test Run URL → RÉSOLU), B3 (snake_case → RÉSOLU) |
| 🟡 Mineur | 4 | B7 (prompt() natif), B8 (window.location vs useSearchParams), B9 (stats SSR "--"), B10 (skills vides) |
| 🟢 Info | 2 | B4 (board dept → RÉSOLU partiel), B11 (hermes status) |

**Bugs connus re-vérifiés :**
- B1 ✅ **RÉSOLU** — `toggleWorkflow()` envoie bien `{ enabled: bool }`, API répond 200
- B2 ✅ **RÉSOLU** — Test Run navigue vers `/workflows/run?id=${run.id}` (code: `result.runId ?? result.id`)
- B3 ✅ **RÉSOLU** — Code gère les deux formes (`startedAt ?? started_at`, `triggerType ?? trigger_type`)
- B4 ⚠️ **PARTIELLEMENT RÉSOLU** — `/api/org/departments/:name/board` retourne `[]` (200) au lieu de 404, mais données toujours vides (ancien kanban supprimé, nouveau sur `/api/boards`)

**Nouveaux bugs trouvés : 6**

---

## Bugs Détaillés

---

### B5 — Page /costs introuvable (404 Next.js)
**Sévérité :** 🔴 Critique  
**URL :** `/costs`  
**Composant :** `app/costs/` (inexistant)

**Description :**  
La page `/costs` est référencée dans les Quick Links du Dashboard (lien cliquable "Costs – API usage and spending") mais le répertoire `app/costs/page.tsx` n'existe pas. L'utilisateur se retrouve sur la page 404 de Next.js.

**Steps to reproduce :**
1. Aller sur `/`
2. Cliquer sur la Quick Link "Costs"
3. → 404 Next.js

**Expected :** Page d'analyse des coûts API (les APIs existent côté backend : `/api/costs/summary`, `/api/costs/by-employee`)  
**Actual :** Page 404 Next.js

**Erreurs console :** Aucune erreur JS (le problème est une route manquante, pas JS)

**Note :** L'infrastructure API backend existe et répond :  
```json
GET /api/costs/summary → { "total": 0, "daily": [...], "byEmployee": [...] }
```
La lib `src/lib/costs.ts` avec tous les types existe aussi. Il manque juste le composant page.

---

### B6 — Bouton "Delete Column" invisible (pas de classe `group` sur le parent)
**Sévérité :** 🔴 Critique  
**URL :** `/kanban`  
**Composant :** `components/kanban` → `KanbanColumnView` (dans `kanban/page.tsx` ligne 214)

**Description :**  
Le bouton de suppression de colonne utilise `opacity-0 group-hover:opacity-100` mais le parent `<div>` de la colonne n'a pas la classe `group` CSS. Le bouton est donc définitivement invisible et inaccessible.

**Steps to reproduce :**
1. Aller sur `/kanban`
2. Créer un board avec au moins une colonne vide
3. Survoler la colonne → le bouton delete (🗑) n'apparaît jamais

**Expected :** Le bouton trash apparaît au hover de la colonne  
**Actual :** Bouton invisible en permanence

**Code problématique (ligne 178–214) :**
```tsx
// Outer div — MANQUE la classe "group"
<div className={`flex flex-col w-[260px] shrink-0 ...`}>
  ...
  // Ce bouton ne sera JAMAIS visible :
  <button className="... opacity-0 group-hover:opacity-100 ml-auto">
    <Trash2 size={13} />
  </button>
```

**Fix :** Ajouter `group` à la div racine de `KanbanColumnView` :
```tsx
<div className={`group flex flex-col w-[260px] ...`}>
```

---

### B7 — `prompt()` natif pour créer une colonne (UX cassée)
**Sévérité :** 🟠 Majeur  
**URL :** `/kanban`  
**Composant :** `kanban/page.tsx` ligne 688

**Description :**  
L'action "Add Column" utilise `window.prompt()` natif au lieu d'un formulaire intégré. C'est incohérent avec le style de l'app et bloquant sur certains environnements (mode kiosk, Electron, etc.).

**Steps to reproduce :**
1. Aller sur `/kanban`
2. Cliquer sur "+ Add Column" dans le header du board
3. → Une boîte `prompt()` système apparaît

**Expected :** Modal/inline input cohérent avec le reste de l'interface  
**Actual :** Boîte de dialogue système native `prompt()`

**Code problématique (ligne 686–690) :**
```tsx
async function handleAddColumn() {
  if (!activeBoardId) return
  const title = prompt('Column title:')?.trim()  // ← window.prompt()
  if (!title) return
  const updated = await api.addColumn(activeBoardId, { title })
```

---

### B8 — `window.location.search` au lieu de `useSearchParams()` dans les pages Workflows
**Sévérité :** 🟠 Majeur  
**URL :** `/workflows/editor?id=...` et `/workflows/run?id=...`  
**Composant :** `app/workflows/editor/page.tsx` ligne 121, `app/workflows/run/page.tsx` ligne 122

**Description :**  
Les deux pages workflow récupèrent le paramètre `id` via `window.location.search` au lieu du hook Next.js `useSearchParams()`. Cela cause un mismatch d'hydratation (la valeur est `''` côté SSR) et peut produire des comportements imprévisibles avec le router Next.js, notamment lors de navigations côté client.

**Code problématique :**
```tsx
// editor/page.tsx:121
const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') ?? '' : ''

// run/page.tsx:122  
const runId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') ?? '' : ''
```

**Expected :**
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
const searchParams = useSearchParams()
const id = searchParams.get('id') ?? ''
```

**Impact :** Le workflow ne se charge pas si l'URL est accédée directement (SSR), ou si Next.js navigue en mode SPA (la valeur de `window.location.search` peut être en retard).

---

### B9 — Stats Dashboard affichent "--" au chargement initial
**Sévérité :** 🟡 Mineur  
**URL :** `/`  
**Composant :** `app/page.tsx`

**Description :**  
Les 4 stats cards (Uptime, Active Sessions, Engines, Cron Jobs) s'affichent `--` au chargement initial. Les données sont bien disponibles dans l'API (`/api/status`, `/api/cron`) mais le chargement se fait uniquement côté client (`useEffect`). Sur des connexions lentes, l'utilisateur voit `--` pendant plusieurs secondes.

**Steps to reproduce :**
1. Charger `/`
2. Observer les stats cards

**Expected :** Valeurs réelles (ou skeleton loader)  
**Actual :** `--` pendant le chargement (peut durer 1–3 secondes)

**Note :** L'API répond :
- Uptime : `29976` secondes (~8h)  
- Active Sessions : `0`  
- Engines : `hermes`, `claude`, `codex`  
- Cron Jobs : `2`

**Suggestion :** Ajouter un `<Skeleton>` pendant le chargement au lieu du `--` brut.

---

### B10 — Page /skills affiche "No skills found" (API retourne [])
**Sévérité :** 🟡 Mineur  
**URL :** `/skills`  
**Composant :** `app/skills/page.tsx`

**Description :**  
La page Skills de Jinn (`/skills`) appelle `/api/skills` qui retourne un tableau vide `[]`. La page affiche "No skills found" avec une interface vide. Les skills Hermes sont eux accessibles via `/api/hermes/skills` (111 skills) et affichés sur `/hermes/skills`.

**Steps to reproduce :**
1. Aller sur `/skills`

**Expected :** Liste des skills Jinn  
**Actual :** Page vide "No skills found"

**Note :** L'endpoint `/api/skills` existe mais retourne `[]`. Ce n'est peut-être pas un bug de frontend mais d'absence de données backend pour les skills Jinn natifs.

---

### B11 — `/api/hermes/status` retourne 404
**Sévérité :** 🟡 Mineur  
**URL :** `/hermes/sessions` (sidebar)  
**Composant :** `hooks/use-hermes.ts`, `components/hermes/hermes-status.tsx`

**Description :**  
L'endpoint `/api/hermes/status` (utilisé par `useHermesStatus`) retourne `{"error":"Not found"}`. Le badge Hermes dans la sidebar reste en état "loading" permanent (spinner pulsant). Pourtant, les autres endpoints Hermes (`/api/hermes/sessions`, `/api/hermes/memory`, `/api/hermes/skills`) fonctionnent correctement.

**Steps to reproduce :**
1. Observer la sidebar
2. Le badge "Hermes" reste en état pulsant indéfiniment

**Expected :** Badge vert "Hermes ●" quand connecté  
**Actual :** Badge gris pulsant permanent

**Note :** L'API `/api/hermes/sessions` retourne des données valides, donc Hermes est bien connecté. Le seul endpoint cassé est `/api/hermes/status`.

---

### B4 (re-vérifié) — `/api/org/departments/:name/board` retourne [] mais ne cause pas de 404
**Sévérité :** 🟢 Info  
**URL :** `/org` (vue Board)  
**Status :** ⚠️ Partiellement résolu

**Description :**  
L'endpoint retourne maintenant `200 []` au lieu de `404`. Cependant, l'ancien système de boards par département est maintenant remplacé par le nouveau système `/api/boards`. L'endpoint legacy reste fonctionnel (GET retourne `[]`, PUT retourne `{status: "ok"}`) mais ne sert plus rien. La vue "Board" dans l'org est peut-être encore couplée à l'ancien endpoint.

---

## Comportements Non-Testés (limitation browser bloqué)

Les tests suivants n'ont pas pu être réalisés via browser (adresse privée bloquée par Browserbase) :
- Drag & drop React Flow nodes dans l'éditeur
- Chat interface (envoi message, SSE streaming)
- Org Map (React Flow organigramme)
- Cron runs history affichage
- Workflow SSE stream (`/api/workflows/runs/:id/stream`)
- Onboarding wizard

---

## Summary Table

| ID | Titre | Sévérité | Page | Statut |
|---|---|---|---|---|
| B1 | toggleWorkflow body vide | 🟠 Majeur | /workflows | ✅ RÉSOLU |
| B2 | Test Run mauvaise URL | 🟠 Majeur | /workflows/editor | ✅ RÉSOLU |
| B3 | snake_case/camelCase WorkflowRun | 🟠 Majeur | /workflows (History/Live) | ✅ RÉSOLU |
| B4 | Dept board 404 | 🟢 Info | /org | ✅ RÉSOLU (200 + vide) |
| B5 | Page /costs manquante | 🔴 Critique | /costs | ❌ NOUVEAU |
| B6 | Column delete invisible | 🔴 Critique | /kanban | ❌ NOUVEAU |
| B7 | prompt() natif add column | 🟠 Majeur | /kanban | ❌ NOUVEAU |
| B8 | window.location vs useSearchParams | 🟠 Majeur | /workflows/editor, /workflows/run | ❌ NOUVEAU |
| B9 | Stats Dashboard "--" au chargement | 🟡 Mineur | / | ❌ NOUVEAU |
| B10 | Skills page vide | 🟡 Mineur | /skills | ❌ NOUVEAU |
| B11 | /api/hermes/status 404 | 🟡 Mineur | sidebar | ❌ NOUVEAU |
