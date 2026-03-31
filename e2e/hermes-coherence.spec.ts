import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'

const HERMES_API = 'http://127.0.0.1:8642'
const JINN_API = 'http://127.0.0.1:7778'

// Ces tests comparent directement les réponses des deux APIs
// Hermes WebAPI :8642 vs Jinn API :7778/api/hermes/*
// Aucun mock — données réelles en live.

test.describe('Cohérence Hermes WebAPI vs Jinn proxy', () => {

  test('sessions count cohérent', async () => {
    // Note: les tests peuvent créer des sessions en parallèle — tolérance ±5
    // On snapshote les deux APIs dans le même intervalle de 500ms
    const [hermesResp, jinnResp] = await Promise.all([
      fetch(`${HERMES_API}/api/sessions?limit=100`),
      fetch(`${JINN_API}/api/hermes/sessions?limit=100`)
    ])
    expect(hermesResp.ok).toBe(true)
    expect(jinnResp.ok).toBe(true)
    const hermesData = await hermesResp.json()
    const jinnData = await jinnResp.json()

    // Le proxy Jinn reflète Hermes avec une tolérance légère (race conditions)
    const diff = Math.abs(jinnData.total - hermesData.total)
    expect(diff).toBeLessThanOrEqual(5)
  })

  test('sessions items retournent les mêmes IDs', async () => {
    const hermesResp = await fetch(`${HERMES_API}/api/sessions?limit=5`)
    const hermesData = await hermesResp.json()
    const jinnResp = await fetch(`${JINN_API}/api/hermes/sessions?limit=5`)
    const jinnData = await jinnResp.json()

    const hermesIds = new Set(hermesData.items?.map((s: { id: string }) => s.id) ?? [])
    const jinnIds = new Set(jinnData.items?.map((s: { id: string }) => s.id) ?? [])

    // Chaque ID Jinn doit exister dans Hermes
    for (const id of jinnIds) {
      expect(hermesIds.has(id)).toBe(true)
    }
  })

  test('memory entries cohérentes — target memory', async () => {
    const hermesResp = await fetch(`${HERMES_API}/api/memory`)
    expect(hermesResp.ok).toBe(true)
    const hermesData = await hermesResp.json()

    const jinnResp = await fetch(`${JINN_API}/api/hermes/memory`)
    expect(jinnResp.ok).toBe(true)
    const jinnData = await jinnResp.json()

    const hermesMemoryTarget = hermesData.targets?.find(
      (t: { target: string }) => t.target === 'memory'
    )
    const hermesCount = hermesMemoryTarget?.entries?.length ?? 0
    const jinnCount = jinnData.memory?.entries?.length ?? 0

    expect(jinnCount).toBe(hermesCount)
  })

  test('memory entries cohérentes — target user', async () => {
    const hermesResp = await fetch(`${HERMES_API}/api/memory`)
    const hermesData = await hermesResp.json()
    const jinnResp = await fetch(`${JINN_API}/api/hermes/memory`)
    const jinnData = await jinnResp.json()

    const hermesUserTarget = hermesData.targets?.find(
      (t: { target: string }) => t.target === 'user'
    )
    const hermesCount = hermesUserTarget?.entries?.length ?? 0
    const jinnCount = jinnData.user?.entries?.length ?? 0

    expect(jinnCount).toBe(hermesCount)
  })

  test('cron jobs Hermes apparaissent dans Jinn avec préfixe hermes-', async () => {
    // Source de vérité: jobs.json Hermes
    const hermesJobsPath = os.homedir() + '/.hermes/cron/jobs.json'
    if (!fs.existsSync(hermesJobsPath)) {
      console.log('jobs.json Hermes introuvable — skip')
      return
    }
    const hermesJobsRaw = JSON.parse(fs.readFileSync(hermesJobsPath, 'utf-8'))
    const hermesIds: string[] = hermesJobsRaw.jobs?.map((j: { id: string }) => j.id) ?? []

    const jinnResp = await fetch(`${JINN_API}/api/cron`)
    expect(jinnResp.ok).toBe(true)
    const jinnJobs = await jinnResp.json()

    // Les jobs Hermes doivent apparaître dans Jinn avec engine=hermes
    const jinnHermesJobs = jinnJobs.filter(
      (j: { engine?: string }) => j.engine === 'hermes'
    )

    // Chaque ID Hermes doit être tracé dans Jinn (soit id=hermes-{short} ou _hermesId)
    for (const hId of hermesIds) {
      const shortId = hId.replace(/-/g, '').substring(0, 12)
      const found = jinnHermesJobs.some(
        (j: { id: string; _hermesId?: string }) =>
          j.id === `hermes-${shortId}` ||
          j._hermesId === shortId ||
          j.id.includes(hId.substring(0, 8))
      )
      expect(found).toBe(true)
    }
  })

  test('health status cohérent Hermes vs Jinn', async () => {
    const hermesHealth = await (await fetch(`${HERMES_API}/health`)).json()
    // Jinn proxy expose /api/hermes/health (peut différer du format)
    const jinnHermesHealth = await (await fetch(`${JINN_API}/api/hermes/health`)).json()

    // Les deux doivent indiquer "ok"
    expect(hermesHealth.status).toBe('ok')
    expect(jinnHermesHealth.status).toBe('ok')
  })

  test('session detail cohérent — même ID via les deux APIs', async () => {
    // Prendre la dernière session Hermes
    const listResp = await fetch(`${HERMES_API}/api/sessions?limit=1`)
    const listData = await listResp.json()

    if (!listData.items?.length) {
      console.log('Aucune session Hermes — skip')
      return
    }
    const sessionId = listData.items[0].id

    const hermesDetail = await (
      await fetch(`${HERMES_API}/api/sessions/${sessionId}`)
    ).json()

    const jinnDetail = await (
      await fetch(`${JINN_API}/api/hermes/sessions/${sessionId}`)
    ).json()

    // Cohérence des champs clés
    expect(jinnDetail.id).toBe(hermesDetail.session.id)
    expect(jinnDetail.messageCount).toBe(hermesDetail.session.message_count)
    expect(jinnDetail.inputTokens).toBe(hermesDetail.session.input_tokens)
    expect(jinnDetail.source).toBe(hermesDetail.session.source)
  })

  test('skills count cohérent entre Hermes et Jinn', async () => {
    const hermesResp = await fetch(`${HERMES_API}/api/skills`)
    const jinnResp = await fetch(`${JINN_API}/api/hermes/skills`)

    expect(hermesResp.ok).toBe(true)
    expect(jinnResp.ok).toBe(true)

    const hermesData = await hermesResp.json()
    const jinnData = await jinnResp.json()

    // Les deux doivent retourner le même nombre de skills
    const hermesCount = hermesData.count ?? hermesData.skills?.length ?? 0
    const jinnCount = jinnData.count ?? jinnData.skills?.length ?? 0

    expect(jinnCount).toBe(hermesCount)
  })

  test('Jinn /api/status confirme Hermes comme brain primaire', async () => {
    const jinnStatus = await (await fetch(`${JINN_API}/api/status`)).json()
    const primaryBrain = jinnStatus.brain?.primary ?? jinnStatus.engines?.defaultBrain
    expect(primaryBrain).toBe('hermes')
  })
})
