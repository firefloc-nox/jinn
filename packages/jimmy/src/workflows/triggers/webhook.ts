import crypto from 'node:crypto';
import { workflowEngine } from '../engine.js';

// Génère un secret unique par workflow
export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Vérifie la signature HMAC si présente
export function verifyWebhookSignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature) return true; // optionnel
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Handler appelé depuis api.ts quand POST /api/workflows/webhook/:workflowId reçoit un appel
export async function handleWebhookTrigger(workflowId: string, body: unknown, signature?: string): Promise<{ runId: string } | { error: string }> {
  const wf = workflowEngine.getWorkflow(workflowId);
  if (!wf || !wf.enabled) return { error: 'Workflow not found or disabled' };
  if (wf.trigger.type !== 'webhook') return { error: 'Workflow trigger is not webhook' };

  const secret = (wf.trigger as { secret?: string }).secret;
  if (secret && !verifyWebhookSignature(secret, JSON.stringify(body), signature)) {
    return { error: 'Invalid signature' };
  }

  const run = await workflowEngine.trigger(workflowId, { type: 'webhook', data: body });
  return { runId: run.id };
}
