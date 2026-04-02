import type { IncomingMessage as HttpRequest, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { workflowEngine } from './engine.js';
import type { WorkflowDefinition, TriggerPayload } from './types.js';
import { nodeRegistry } from './registry.js';
import { handleWebhookTrigger } from './triggers/webhook.js';
import { NodeType } from './types.js';
import { logger } from '../shared/logger.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

function badRequest(res: ServerResponse, message: string): void {
  json(res, { error: message }, 400);
}

function serverError(res: ServerResponse, message: string): void {
  json(res, { error: message }, 500);
}

function readBody(req: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function readJsonBody(
  req: HttpRequest,
  res: ServerResponse,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const raw = await readBody(req);
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    badRequest(res, 'Invalid JSON in request body');
    return { ok: false };
  }
}

function matchRoute(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function handleWorkflowsRequest(
  req: HttpRequest,
  res: ServerResponse,
  config?: Record<string, unknown>,
  hermesConnector?: import('../connectors/hermes/index.js').HermesDataConnector | null,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  const pathname = url.split('?')[0];

  let params: Record<string, string> | null;

  try {
    // GET /api/workflows/node-types
    if (method === 'GET' && pathname === '/api/workflows/node-types') {
      const { modeRegistry } = await import('./modes/registry.js')
      const modeNodes = modeRegistry.getAvailableNodes(config ?? {})
      const baseTypes = Object.values(NodeType)
      return json(res, { base: baseTypes, modes: modeNodes, legacy: nodeRegistry.listTypes() }), true;
    }

    // GET /api/workflows/templates
    if (method === 'GET' && pathname === '/api/workflows/templates') {
      const { modeRegistry } = await import('./modes/registry.js')
      const templates = modeRegistry.getTemplates()
      return json(res, templates), true;
    }

    // GET /api/workflows/runs/:runId/stream  (SSE)
    params = matchRoute('/api/workflows/runs/:runId/stream', pathname);
    if (method === 'GET' && params) {
      const { runId } = params;
      const run = workflowEngine.getRun(runId);
      if (!run) return notFound(res), true;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Send current state
      send('run', run);

      const onRunEvent = (data: unknown) => send('run.update', data);
      const onStepEvent = (data: unknown) => send('step', data);

      workflowEngine.on('run.completed', onRunEvent);
      workflowEngine.on('run.error', onRunEvent);
      workflowEngine.on('step.completed', onStepEvent);
      workflowEngine.on('step.failed', onStepEvent);

      req.on('close', () => {
        workflowEngine.off('run.completed', onRunEvent as (...args: unknown[]) => void);
        workflowEngine.off('run.error', onRunEvent as (...args: unknown[]) => void);
        workflowEngine.off('step.completed', onStepEvent as (...args: unknown[]) => void);
        workflowEngine.off('step.failed', onStepEvent as (...args: unknown[]) => void);
      });

      return true;
    }

    // GET /api/workflows/runs/:runId/steps
    params = matchRoute('/api/workflows/runs/:runId/steps', pathname);
    if (method === 'GET' && params) {
      const steps = workflowEngine.getSteps(params.runId);
      return json(res, steps), true;
    }

    // POST /api/workflows/runs/:runId/approve
    params = matchRoute('/api/workflows/runs/:runId/approve', pathname);
    if (method === 'POST' && params) {
      const { runId } = params;
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;

      const run = workflowEngine.getRun(runId);
      if (!run) return notFound(res), true;

      try {
        await workflowEngine.resume(runId, (parsed.body as Record<string, unknown>) ?? {});
        return json(res, { ok: true, runId }), true;
      } catch (err) {
        return serverError(res, err instanceof Error ? err.message : String(err)), true;
      }
    }

    // DELETE /api/workflows/runs/:runId
    params = matchRoute('/api/workflows/runs/:runId', pathname);
    if (method === 'DELETE' && params) {
      const { runId } = params;
      const run = workflowEngine.getRun(runId);
      if (!run) return notFound(res), true;

      try {
        workflowEngine.cancel(runId);
        return json(res, { ok: true }), true;
      } catch (err) {
        return serverError(res, err instanceof Error ? err.message : String(err)), true;
      }
    }

    // GET /api/workflows/runs/:runId
    params = matchRoute('/api/workflows/runs/:runId', pathname);
    if (method === 'GET' && params) {
      const run = workflowEngine.getRun(params.runId);
      if (!run) return notFound(res), true;
      return json(res, run), true;
    }

    // GET /api/workflows
    if (method === 'GET' && pathname === '/api/workflows') {
      return json(res, workflowEngine.listWorkflows()), true;
    }

    // POST /api/workflows
    if (method === 'POST' && pathname === '/api/workflows') {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;

      const body = parsed.body as Partial<WorkflowDefinition>;
      if (!body.name) return badRequest(res, 'name is required'), true;

      const id = body.id || body.name!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

      const def: WorkflowDefinition = {
        id,
        name: body.name,
        description: body.description,
        version: body.version ?? 1,
        enabled: body.enabled ?? false,
        trigger: body.trigger ?? { type: 'manual' as unknown as import('./types.js').TriggerType },
        nodes: body.nodes ?? [],
        edges: body.edges ?? [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      workflowEngine.saveWorkflow(def);
      return json(res, def, 201), true;
    }

    // GET /api/workflows/:id
    params = matchRoute('/api/workflows/:id', pathname);
    if (method === 'GET' && params) {
      const def = workflowEngine.getWorkflow(params.id);
      if (!def) return notFound(res), true;
      return json(res, def), true;
    }

    // PUT /api/workflows/:id
    params = matchRoute('/api/workflows/:id', pathname);
    if (method === 'PUT' && params) {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;

      const body = parsed.body as Partial<WorkflowDefinition>;
      const existing = workflowEngine.getWorkflow(params.id);
      const def: WorkflowDefinition = {
        ...(existing ?? {}),
        ...body,
        id: params.id,
        updated_at: new Date().toISOString(),
      } as WorkflowDefinition;

      workflowEngine.saveWorkflow(def);
      return json(res, def), true;
    }

    // DELETE /api/workflows/:id
    params = matchRoute('/api/workflows/:id', pathname);
    if (method === 'DELETE' && params) {
      try {
        workflowEngine.deleteWorkflow(params.id);
        return json(res, { ok: true }), true;
      } catch (err) {
        return notFound(res), true;
      }
    }

    // PATCH /api/workflows/:id/toggle — toggle enabled sans body requis
    params = matchRoute('/api/workflows/:id/toggle', pathname);
    if (method === 'PATCH' && params) {
      const existing = workflowEngine.getWorkflow(params.id);
      if (!existing) return notFound(res), true;
      try {
        const def = workflowEngine.toggleWorkflow(params.id, !existing.enabled);
        return json(res, def), true;
      } catch (err) {
        return notFound(res), true;
      }
    }

    // GET /api/workflows/:id/runs
    params = matchRoute('/api/workflows/:id/runs', pathname);
    if (method === 'GET' && params) {
      const runs = workflowEngine.getRunsByWorkflow(params.id);
      return json(res, runs), true;
    }

    // POST /api/workflows/webhook/:workflowId — external webhook trigger
    params = matchRoute('/api/workflows/webhook/:workflowId', pathname);
    if (method === 'POST' && params) {
      const rawBody = await readBody(req);
      const signature = req.headers['x-hub-signature-256'] as string | undefined
        ?? req.headers['x-signature'] as string | undefined;
      let body: unknown = {};
      try { body = rawBody.trim() ? JSON.parse(rawBody) : {}; } catch { body = rawBody; }
      const result = await handleWebhookTrigger(params.workflowId, body, signature);
      if ('error' in result) {
        return json(res, result, 400), true;
      }
      return json(res, result, 202), true;
    }

    // POST /api/workflows/:id/trigger
    params = matchRoute('/api/workflows/:id/trigger', pathname);
    if (method === 'POST' && params) {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;

      const body = (parsed.body ?? {}) as Partial<TriggerPayload>;
      const payload: TriggerPayload = {
        type: body.type ?? 'manual',
        ...body,
      };

      try {
        const run = await workflowEngine.trigger(params.id, payload);
        return json(res, run, 202), true;
      } catch (err) {
        return serverError(res, err instanceof Error ? err.message : String(err)), true;
      }
    }

    // POST /api/workflows/assist — AI assistant for workflow design
    if (method === 'POST' && pathname === '/api/workflows/assist') {
      const parsed = await readJsonBody(req, res);
      if (!parsed.ok) return true;

      const body = parsed.body as {
        message?: string;
        context?: {
          workflow?: unknown;
          employees?: unknown[];
          boards?: unknown[];
        };
      };

      if (!body.message) return badRequest(res, 'message is required'), true;

      if (!hermesConnector || !hermesConnector.isHealthy()) {
        return json(res, { error: 'Hermes WebAPI unavailable', reply: 'L\'assistant n\'est pas disponible pour le moment.' }, 503), true;
      }

      // Build context-aware message
      const contextParts: string[] = [];
      if (body.context?.workflow) {
        contextParts.push(`Current workflow:\n${JSON.stringify(body.context.workflow, null, 2)}`);
      }
      if (body.context?.employees?.length) {
        const empList = (body.context.employees as Array<{name: string; displayName?: string; role?: string}>)
          .map(e => `- ${e.name} (${e.displayName ?? e.name}${e.role ? ', ' + e.role : ''})`)
          .join('\n');
        contextParts.push(`Available employees:\n${empList}`);
      }
      if (body.context?.boards?.length) {
        const boardList = (body.context.boards as Array<{id: string; name: string}>)
          .map(b => `- ${b.id}: ${b.name}`).join('\n');
        contextParts.push(`Available boards:\n${boardList}`);
      }

      const fullMessage = contextParts.length
        ? `${contextParts.join('\n\n')}\n\n---\n\nUser request: ${body.message}`
        : body.message;

      // Resolve workflow-architect employee and their Hermes profile system prompt
      const FALLBACK_SYSTEM_PROMPT = 'Tu es un expert en conception de workflows Jinn. Tu connais tous les node types (TRIGGER, AGENT, CONDITION, NOTIFY, MOVE_CARD, HTTP, SET_VAR, TRANSFORM, LOG, WAIT, DONE, ERROR), leurs configurations, et les bonnes pratiques. Quand tu génères un workflow complet, réponds TOUJOURS avec un bloc JSON valide. Quand tu suggères un seul node, utilise {\"node\": {...}}.';

      let resolvedSystemPrompt: string | undefined;
      let resolvedSource = 'jinn-workflow-architect';

      try {
        const { scanOrg } = await import('../gateway/org.js');
        const orgRegistry = scanOrg();
        const waEmployee = orgRegistry.get('workflow-architect');
        if (waEmployee?.hermesProfile) {
          const claudeMdPath = path.join(os.homedir(), '.hermes', 'profiles', waEmployee.hermesProfile, 'CLAUDE.md');
          if (fs.existsSync(claudeMdPath)) {
            resolvedSystemPrompt = fs.readFileSync(claudeMdPath, 'utf-8');
            resolvedSource = `jinn-${waEmployee.hermesProfile}`;
            logger.info(`[workflows/assist] Using workflow-architect hermesProfile "${waEmployee.hermesProfile}" system prompt`);
          }
        }
      } catch (orgErr) {
        logger.warn(`[workflows/assist] Could not load workflow-architect org profile, using fallback: ${orgErr}`);
      }

      if (!resolvedSystemPrompt) {
        resolvedSystemPrompt = FALLBACK_SYSTEM_PROMPT;
      }

      try {
        const client = hermesConnector.getClient();
        // Create a session for the workflow-architect profile
        const hermesSession = await client.createSession({
          source: resolvedSource,
          systemPrompt: resolvedSystemPrompt,
        });

        // Stream the chat and collect the reply
        let reply = '';
        const stream = await client.chatStream(hermesSession.id, fullMessage);
        for await (const event of stream) {
          // Hermes WebAPI emits 'assistant.delta' (not 'run.delta')
          if ((event.event === 'assistant.delta' || event.event === 'run.delta') && event.data.delta) {
            reply += event.data.delta;
          }
        }

        if (!reply) reply = 'Aucune réponse reçue de l\'assistant.';

        // Try to extract JSON from the reply
        let workflow: unknown = undefined;
        let node: unknown = undefined;
        const jsonMatch = reply.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          try {
            const parsed2 = JSON.parse(jsonMatch[1]);
            if (parsed2.node) node = parsed2.node;
            else if (parsed2.nodes) workflow = parsed2;
          } catch { /* not valid JSON */ }
        }

        return json(res, { reply, workflow, node }), true;
      } catch (err) {
        logger.error(`[workflows/assist] ${err}`);
        return json(res, { error: 'Assistant unavailable', reply: 'L\'assistant n\'est pas disponible pour le moment.' }, 503), true;
      }
    }

  } catch (err) {
    serverError(res, err instanceof Error ? err.message : String(err));
    return true;
  }

  return false;
}
