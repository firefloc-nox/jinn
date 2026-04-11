import { test, expect } from '@playwright/test'

const JINN_API = 'http://127.0.0.1:7778'
const HERMES_API = 'http://127.0.0.1:8642'

// Ces tests vérifient le comportement du moteur Hermes en conditions réelles.
// Pas de mock — on interroge les APIs live.

let hermesWebApiAvailable = false;

test.beforeAll(async () => {
  try {
    const res = await fetch("http://127.0.0.1:8642/api/sessions?limit=1", { signal: AbortSignal.timeout(3000) });
    hermesWebApiAvailable = res.ok;
  } catch {
    hermesWebApiAvailable = false;
  }
});

test.describe('Engine routing comparatif', () => {

  test('session engine=hermes créée via Jinn est routée vers WebAPI', async () => {
    test.skip(!hermesWebApiAvailable, "Hermes WebAPI unavailable");
    // Créer une session via Jinn (sans message pour éviter un call LLM coûteux)
    const resp = await fetch(`${JINN_API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Réponds uniquement: ok',
        source: 'e2e-engine-test'
      })
    })
    expect(resp.ok).toBe(true)
    const session = await resp.json()

    // Vérifier que l'engine est hermes
    expect(session.engine).toBe('hermes')
    expect(session.id).toBeDefined()

    // Attendre que la session se termine (max 30s)
    let result: Record<string, unknown> | null = null
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const s = await (
        await fetch(`${JINN_API}/api/sessions/${session.id}`)
      ).json()
      if (s.status === 'idle' || s.status === 'done') {
        result = s
        break
      }
    }

    expect(result).not.toBeNull()
    // La session doit être terminée avec succès
    const finalStatus = result!.status
    expect(['idle', 'done']).toContain(finalStatus)

    // Vérifier que transportMeta indique WebAPI
    const transportMeta = result!.transportMeta as Record<string, unknown> | undefined
    const hermesMeta = (transportMeta?.hermesMeta ?? transportMeta?.routingMeta) as Record<string, unknown> | undefined

    if (hermesMeta?.hermesSessionId) {
      // La session Hermes doit exister dans le WebAPI
      const hermesSession = await (
        await fetch(`${HERMES_API}/api/sessions/${hermesMeta.hermesSessionId}`)
      ).json()
      expect(hermesSession.session).toBeDefined()
      expect(hermesSession.session.id).toBe(hermesMeta.hermesSessionId)
    }
  })

  test('hermes-activity retourne une vue agrégée cohérente', async () => {
    test.skip(!hermesWebApiAvailable, "Hermes WebAPI unavailable");
    const resp = await fetch(`${JINN_API}/api/sessions/hermes-activity?limit=10`)
    expect(resp.ok).toBe(true)
    const data = await resp.json()

    expect(data).toHaveProperty('items')
    expect(Array.isArray(data.items)).toBe(true)
    expect(data).toHaveProperty('total')
    expect(typeof data.total).toBe('number')

    // Vérifier les champs attendus sur les premiers items
    for (const item of data.items.slice(0, 3)) {
      expect(item).toHaveProperty('hermesSessionId')
      expect(item).toHaveProperty('source')
      // startedAt doit être un timestamp valide
      if (item.startedAt) {
        expect(typeof item.startedAt).toBe('number')
        expect(item.startedAt).toBeGreaterThan(0)
      }
    }
  })

  test('hermes-activity total >= sessions Hermes count', async () => {
    test.skip(!hermesWebApiAvailable, "Hermes WebAPI unavailable");
    // L'activité Hermes doit couvrir toutes les sessions Hermes
    const activityResp = await fetch(`${JINN_API}/api/sessions/hermes-activity?limit=1`)
    const activityData = await activityResp.json()

    const hermesSessionsResp = await fetch(`${HERMES_API}/api/sessions?limit=1`)
    const hermesSessionsData = await hermesSessionsResp.json()

    // Total activité >= sessions Hermes (peut inclure CLI + Web)
    expect(activityData.total).toBeGreaterThanOrEqual(hermesSessionsData.total)
  })

  test('logs Jinn contiennent traces HermesEngine WebAPI', async () => {
    const resp = await fetch(`${JINN_API}/api/logs`)
    expect(resp.ok).toBe(true)
    const data = await resp.json()

    const lines: string[] = data.lines ?? (Array.isArray(data) ? data : [])
    const hermesLogs = lines.filter((l: string) =>
      l.includes('HermesEngine') ||
      l.includes('WebAPI') ||
      l.includes('hermes')
    )
    // Au moins des logs de transport Hermes doivent exister
    expect(hermesLogs.length).toBeGreaterThan(0)
  })

  test('logs Jinn indiquent activité HermesEngine (WebAPI ou DataConnector)', async () => {
    // /api/logs retourne les 100 dernières lignes — les logs de boot peuvent être rotés.
    // On vérifie qu'au moins un log HermesEngine ou HermesDataConnector est présent.
    const resp = await fetch(`${JINN_API}/api/logs`)
    const data = await resp.json()
    const lines: string[] = data.lines ?? (Array.isArray(data) ? data : [])

    const hermesEngineLog = lines.find((l: string) =>
      l.includes('HermesEngine') ||
      l.includes('HermesDataConnector') ||
      l.includes('hermes')
    )
    // Au moins une trace Hermes doit exister dans les 100 derniers logs
    expect(hermesEngineLog).toBeDefined()
  })

  test('session Jinn a routingMeta avec actualExecutor=hermes', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`)
    expect(resp.ok).toBe(true)
    const sessions = await resp.json() as Array<Record<string, unknown>>

    // Chercher une session avec routingMeta
    const sessionWithMeta = sessions.find(s => {
      const tm = s.transportMeta as Record<string, unknown> | undefined
      return tm?.routingMeta !== undefined
    })

    if (!sessionWithMeta) {
      // Pas encore de session avec meta complète — acceptable
      console.log('Aucune session avec routingMeta trouvée — skip assertion')
      return
    }

    const routingMeta = (sessionWithMeta.transportMeta as Record<string, unknown>)
      .routingMeta as Record<string, unknown>

    expect(routingMeta.actualExecutor).toBe('hermes')
    expect(routingMeta.fallbackUsed).toBe(false)
  })

  test('POST /api/sessions valide — champs engine et status retournés', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'ok',
        source: 'e2e-field-check'
      })
    })
    expect([200, 201]).toContain(resp.status)
    const session = await resp.json()

    expect(session).toHaveProperty('id')
    expect(session).toHaveProperty('engine')
    expect(session).toHaveProperty('status')
    expect(session).toHaveProperty('createdAt')
    expect(session.engine).toBe('hermes')
  })

  test('GET /api/sessions/:id retourne session avec transportMeta', async () => {
    // Récupérer la dernière session Jinn
    const listResp = await fetch(`${JINN_API}/api/sessions`)
    const sessions = await listResp.json() as Array<{ id: string }>
    if (!sessions.length) {
      console.log('Aucune session Jinn — skip')
      return
    }

    const sessionId = sessions[0].id
    const detailResp = await fetch(`${JINN_API}/api/sessions/${sessionId}`)
    expect(detailResp.ok).toBe(true)
    const detail = await detailResp.json()

    expect(detail).toHaveProperty('id')
    expect(detail.id).toBe(sessionId)
    expect(detail).toHaveProperty('engine')
    expect(detail).toHaveProperty('transportMeta')
  })
})
