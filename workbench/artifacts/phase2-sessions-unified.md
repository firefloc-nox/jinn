# Phase 2 — Sessions Unifiées : Enrichissement Hermes

## Statut
DONE — typecheck clean, build propre.

## Objectif
Enrichir les réponses sessions Jinn avec les données runtime Hermes (tokens, coûts, model)
quand une session est liée à une session Hermes via `transportMeta.hermesMeta.hermesSessionId`.

---

## Fichiers modifiés

### `packages/jimmy/src/shared/types.ts`
- Ajout de l'interface `HermesSessionEnrichment` — représente les données Hermes sur une session.
- Ajout du champ optionnel `hermesData?: HermesSessionEnrichment` sur l'interface `Session`.

### `packages/jimmy/src/gateway/api.ts`
- Import `os` (pour `getHermesCostSummary` dans `costs.ts`).
- Import `HermesSessionEnrichment` depuis `types.ts`.
- Ajout du helper `enrichWithHermesData(session, hermesConnector)` :
  - Lit `hermesSessionId` depuis deux shapes de `transportMeta` :
    - `transportMeta.hermesMeta.hermesSessionId` (HermesEngine direct)
    - `transportMeta.routingMeta.hermesRuntimeMeta.hermesSessionId` (routing meta)
  - Appelle `hermesConnector.getClient().getSession(hermesSessionId)`.
  - Retourne la session enrichie avec `hermesData`, ou la session inchangée si Hermes est down.
  - Graceful : try/catch complet, jamais de throw.
- Route `GET /api/sessions/:id` — appelle maintenant `enrichWithHermesData` avant de répondre.
- **Nouvelle route** `GET /api/sessions/hermes-activity?limit=20` :
  - Insérée AVANT `/api/sessions/:id` pour éviter la capture par le pattern `:id`.
  - Récupère les N sessions Hermes les plus récentes via `hermesConnector.getClient().getSessions()`.
  - Construit un index `hermesSessionId → Session Jinn` en scannant toutes les sessions Jinn.
  - Retourne `{ items, total }` avec champs Jinn optionnels quand match trouvé.
  - Retourne 503 si `hermes-data` connector non disponible.
- Route `GET /api/costs/summary` — enrichie avec `hermes: HermesCostSummary` dans la réponse.

### `packages/jimmy/src/gateway/costs.ts`
- Ajout des imports `path`, `os`.
- Ajout de l'interface `HermesCostSummary` : `{ totalEstimatedCostUsd, sessionCount, available }`.
- Ajout de la fonction `getHermesCostSummary(period)` :
  - Lit directement depuis `~/.hermes/state.db` (ou `$HERMES_HOME/state.db`) en `readonly`.
  - Utilise `better-sqlite3` (déjà dep de jimmy).
  - Requête `SUM(estimated_cost_usd)` sur `sessions` filtrées par `started_at > cutoff`.
  - Retourne `available: false` si state.db absent ou inaccessible (graceful).

---

## Comportement runtime

### `GET /api/sessions/:id` avec hermesSessionId lié
```json
{
  "id": "jinn-session-abc",
  "engine": "hermes",
  "hermesData": {
    "hermesSessionId": "hermes-uuid-123",
    "model": "anthropic/claude-sonnet-4-5",
    "inputTokens": 12450,
    "outputTokens": 3200,
    "toolCallCount": 8,
    "messageCount": 4,
    "estimatedCostUsd": 0.0234,
    "startedAt": 1748700000.0,
    "endedAt": 1748700300.0
  },
  "messages": [...]
}
```

### `GET /api/sessions/hermes-activity?limit=5`
```json
{
  "items": [
    {
      "hermesSessionId": "hermes-uuid-123",
      "jinnSessionId": "jinn-session-abc",
      "employee": "lain",
      "source": "gateway",
      "model": "anthropic/claude-sonnet-4-5",
      "inputTokens": 12450,
      "outputTokens": 3200,
      "startedAt": 1748700000.0,
      "endedAt": 1748700300.0,
      "title": "Fix auth bug",
      "workState": "idle"
    }
  ],
  "total": 42
}
```

### `GET /api/costs/summary?period=month`
```json
{
  "total": 1.23,
  "daily": [...],
  "byEmployee": [...],
  "byDepartment": [],
  "hermes": {
    "totalEstimatedCostUsd": 4.56,
    "sessionCount": 127,
    "available": true
  }
}
```

---

## Garanties

- **Graceful degradation** : si Hermes est down, toutes les routes retournent les données Jinn sans erreur.
- **0 régression** : `GET /api/sessions` (liste) n'est pas enrichi (coût N+1 évité).
- **TypeScript strict** : typecheck 0 erreur.
- **better-sqlite3** : ouverture `readonly`, fermeture dans `finally`.
- **hermesSessionId lookup** : supporte les deux shapes de transportMeta connues.

---

## Ce qui n'est PAS fait dans cette phase
- Enrichissement de `GET /api/sessions` (liste) — N+1 intentionnellement évité.
- Enrichissement de `GET /api/costs/by-employee` avec Hermes — non demandé dans le spec.
- Écriture de données Hermes dans la DB Jinn — lecture seule uniquement.
