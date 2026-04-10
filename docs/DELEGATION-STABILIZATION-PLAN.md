# Jinn Delegation Stabilization Plan

**Objectif:** Stabiliser tous les cas d'usage de délégation Jinn — routing, fallback, session continuity, queue, error handling.
**Branche:** `lain` (~/Projects/jinn-hermes-frontend/jinn)
**Priorité:** Ce matin. Chaque comportement doit être cohérent avec le plan "bus not brain".

---

## Phase 1 — Cartographie des comportements attendus

Chaque cas doit avoir un test E2E qui le couvre. Pas de mock — données réelles, gateway live.

### 1.1 Routing par Employee (runtimeRef)

**Comportement attendu:**
- Employee avec `runtimeRef: "hermes:openrouter"` → session créée avec `engine: "hermes:openrouter"`, executor résolu = `hermes`
- Employee avec `runtimeRef: "claude"` → session créée avec `engine: "claude"`, executor = `claude`
- Employee sans `runtimeRef` mais avec `engine: "codex"` → fallback sur `engine` field
- Employee sans rien → `config.routing.defaultRuntime` puis `config.engines.default`
- `runtimeRef` > `engine` > `defaultRuntime` > `default` (ordre de priorité)

**Tests E2E:**
- `e2e/delegation-routing.spec.ts` — POST /api/sessions avec employeeRef, vérifier engine dans la réponse
- Vérifier que `routingMeta.requestedRuntime` reflète le bon runtimeRef

### 1.2 Fallback chain

**Comportement attendu:**
- Hermes non disponible → fallback sur Claude (selon DEFAULT_FALLBACK_POLICY)
- Claude non disponible → fallback sur Codex
- Tous indisponibles → erreur claire, pas de crash
- `routingMeta.fallbackUsed = true` quand fallback déclenché
- `routingMeta.fallbackReason` explique pourquoi
- OpenRouter fallback chain (627a7a2) fonctionne comme attendu

**Tests E2E:**
- `e2e/delegation-fallback.spec.ts` — simuler engine down, vérifier fallback
- Vérifier routingMeta dans chaque cas

### 1.3 Engine Override (Rate Limit Switch)

**Comportement attendu:**
- Claude rate limité → switch automatique vers Codex
- Session `engine` passe à `codex`, `transportMeta.engineOverride` posé
- `engineOverride.until` = timestamp de retour prévu
- Quand `until` dépassé → prochain message route de nouveau vers Claude
- Transcript sync injecté quand Claude reprend (contexte du switch Codex)
- `engineSessions` préserve les session IDs des deux engines

**Tests E2E:**
- `e2e/delegation-override.spec.ts` — simuler rate limit, vérifier switch + revert
- Vérifier que le transcript sync est bien injecté

### 1.4 Session Continuity

**Comportement attendu:**
- Session existante reçoit un message → même engine sauf si override actif
- `engineSessionId` préservé entre les messages (resume)
- Nouvelle session créée seulement si pas de session existante pour le `sessionKey`
- `/new` supprime la session et en crée une nouvelle

**Tests E2E:**
- `e2e/delegation-continuity.spec.ts` — envoyer 2 messages, vérifier même session
- Vérifier engineSessionId persistant

### 1.5 Queue / Concurrence

**Comportement attendu:**
- 2 messages rapides sur la même session → second est queue'd, pas de double exécution
- Queue FIFO — les messages sont traités dans l'ordre
- Session status = "running" pendant exécution, "idle" après
- Clock reaction sur le second message pendant queue
- Queue emits queue:updated events (7747fd7)

**Tests E2E:**
- `e2e/delegation-queue.spec.ts` — envoyer 2 messages quasi-simultanés
- Vérifier ordre de traitement et status transitions

### 1.6 Error Handling

**Comportement attendu:**
- Engine crash → session status = "error", lastError renseigné
- Engine timeout → session status = "error" après timeout
- Message d'erreur envoyé au connector
- Session réutilisable après `/new`
- Dead session detection fonctionne (stale engineSessionId)

**Tests E2E:**
- `e2e/delegation-errors.spec.ts` — envoyer un prompt qui provoque une erreur
- Vérifier status, lastError, message d'erreur au connector

### 1.7 Hermes Enrichment (Context Service)

**Comportement attendu:**
- Employee avec `hermesHooks.enabled: true` + engine non-Hermes → contexte enrichi injecté
- Employee avec `hermesHooks.enabled: true` + engine Hermes → PAS d'enrichissement (Hermes gère en interne)
- Enrichissement inclut mémoire (Honcho), skills, MCP si configurés
- hermesHooks sync avec Honcho (56995d6)

**Tests E2E:**
- `e2e/delegation-enrichment.spec.ts` — vérifier que systemPrompt contient l'enrichissement
- Différencier Hermes vs Claude dans le comportement

### 1.8 Hermes Profiles / Model Delegation

**Comportement attendu (NOUVEAU — eddd297):**
- Employee avec Hermes profile → model/provider délégué au profile Hermes
- Settings UI permet de configurer les profiles
- Model override par employee fonctionne

**Tests E2E:**
- `e2e/delegation-hermes-profiles.spec.ts` — vérifier que le model est délégué correctement

### 1.9 Transcript Export

**Comportement attendu (NOUVEAU — 645c9a7):**
- API transcript export fonctionne
- Transcript contient tous les messages de la session

**Tests E2E:**
- Test dans delegation-continuity ou test séparé

### 1.10 Budget Alerts

**Comportement attendu (NOUVEAU — 41e8a03):**
- Budget threshold alerts se déclenchent
- Session bloquée si budget dépassé (déjà dans manager.ts)

**Tests E2E:**
- Test dans delegation-errors ou test séparé

---

## Phase 2 — Tests E2E à écrire

### Structure des fichiers

```
e2e/
├── smoke.spec.ts                          (existe)
├── agent-engine.spec.ts                   (existe)
├── hermes-coherence.spec.ts               (existe)
├── delegation-routing.spec.ts             (NOUVEAU)
├── delegation-fallback.spec.ts            (NOUVEAU)
├── delegation-override.spec.ts            (NOUVEAU)
├── delegation-continuity.spec.ts          (NOUVEAU)
├── delegation-queue.spec.ts               (NOUVEAU)
├── delegation-errors.spec.ts              (NOUVEAU)
├── delegation-enrichment.spec.ts          (NOUVEAU)
├── delegation-hermes-profiles.spec.ts     (NOUVEAU)
└── delegation-helpers.ts                  (NOUVEAU — fixtures partagées)
```

### Helpers partagés (`delegation-helpers.ts`)

- `waitForSessionIdle(sessionId, timeout)` — poll /api/sessions/:id jusqu'à status=idle
- `createSessionWithEmployee(employeeName)` — POST avec employeeRef
- `getRoutingMeta(sessionId)` — extrait transportMeta.routingMeta
- `makeTestEmployee(overrides)` — fabrique un employee config temporaire
- `deleteSession(sessionId)` — cleanup après test

---

## Phase 3 — Fixes identifiés (à compléter pendant l'écriture des tests)

### Probables zones de tension

1. **runtimeRef vs engine priority** — Le code dans `route()` fait `opts.engine ?? opts.employee?.runtimeRef ?? opts.employee?.engine` mais `runtimeRef` devrait primer sur `engine` pour les employees. À vérifier.

2. **Engine override revert timing** — `maybeRevertEngineOverride()` ne se déclenche qu'au prochain `route()`. Si aucun message n'arrive après `until`, la session reste sur Codex indéfiniment. Pas un bug, mais un edge case à documenter.

3. **Queue + engine switch** — Si un message est queue'd pendant qu'un rate limit switch se produit, le message queue'd va utiliser le nouvel engine (Codex). Est-ce le comportement voulu ?

4. **Hermes enrichment condition** — La condition `employee?.hermesHooks?.enabled && resolvedEngine !== "hermes"` est correcte, mais `resolvedEngine` peut être "hermes" même si `runtimeRef` est "hermes:openrouter". Le enrichissement est donc skipped. Est-ce intentionnel ?

5. **Session key collision** — Si deux connectors envoient le même `sessionKey`, ils partagent la session. Est-ce un problème pour Discord + Slack sur le même user ?

6. **Honcho hermesHooks sync** — Le fix 56995d6 corrige la sync, mais est-ce que les toggles dans l'UI reflètent l'état réel ?

---

## Phase 4 — Ordre d'exécution

1. Écrire `delegation-helpers.ts` (fixtures)
2. Écrire `delegation-routing.spec.ts` (priorité haute — routing de base)
3. Écrire `delegation-continuity.spec.ts` (priorité haute — session reuse)
4. Écrire `delegation-fallback.spec.ts` (priorité haute — fallback chain)
5. Écrire `delegation-queue.spec.ts` (priorité moyenne — concurrence)
6. Écrire `delegation-errors.spec.ts` (priorité moyenne — error handling)
7. Écrire `delegation-override.spec.ts` (priorité moyenne — rate limit switch)
8. Écrire `delegation-enrichment.spec.ts` (priorité basse — enrichment)
9. Écrire `delegation-hermes-profiles.spec.ts` (priorité basse — profiles)
10. Lancer tous les tests, identifier les failures
11. Fixer chaque failure, commit par fix
12. Re-lancer pour validation finale

---

## Phase 5 — Validation

- [ ] Tous les tests E2E passent (nouveaux + existants)
- [ ] Tous les unit tests passent (routing, fallback, etc.)
- [ ] Pas de régression sur smoke/hermes-coherence
- [ ] Chaque cas de délégation documenté avec le comportement attendu
- [ ] Un commit par fix avec message conventionnel (fix: scope)
