/**
 * Session transcript export functionality.
 * Exports session messages in markdown, JSON, or plain text formats.
 */

import { getSession, getMessages, type SessionMessage } from './registry.js';
import type { Session } from '../shared/types.js';

export type ExportFormat = 'markdown' | 'json' | 'txt';

export interface ExportedTranscript {
  sessionId: string;
  title: string | null;
  model: string | null;
  engine: string;
  employee: string | null;
  totalCost: number;
  totalTurns: number;
  createdAt: string;
  lastActivity: string;
  messages: SessionMessage[];
}

/**
 * Export a session transcript in the specified format.
 * @param sessionId - The session ID to export
 * @param format - Output format: 'markdown', 'json', or 'txt'
 * @returns Formatted transcript string, or null if session not found
 */
export function exportSession(sessionId: string, format: ExportFormat): string | null {
  const session = getSession(sessionId);
  if (!session) return null;

  const messages = getMessages(sessionId);
  
  const transcript: ExportedTranscript = {
    sessionId: session.id,
    title: session.title,
    model: session.model,
    engine: session.engine,
    employee: session.employee,
    totalCost: session.totalCost,
    totalTurns: session.totalTurns,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    messages,
  };

  switch (format) {
    case 'markdown':
      return formatMarkdown(transcript);
    case 'json':
      return formatJson(transcript);
    case 'txt':
      return formatPlainText(transcript);
    default:
      // Fallback to JSON for unknown formats
      return formatJson(transcript);
  }
}

function formatTimestamp(ts: number | string): string {
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return date.toISOString();
}

function formatMarkdown(transcript: ExportedTranscript): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Session Transcript`);
  lines.push('');
  
  // Metadata section
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Session ID:** ${transcript.sessionId}`);
  if (transcript.title) {
    lines.push(`- **Title:** ${transcript.title}`);
  }
  lines.push(`- **Engine:** ${transcript.engine}`);
  if (transcript.model) {
    lines.push(`- **Model:** ${transcript.model}`);
  }
  if (transcript.employee) {
    lines.push(`- **Employee:** ${transcript.employee}`);
  }
  lines.push(`- **Created:** ${formatTimestamp(transcript.createdAt)}`);
  lines.push(`- **Last Activity:** ${formatTimestamp(transcript.lastActivity)}`);
  if (transcript.totalCost > 0) {
    lines.push(`- **Total Cost:** $${transcript.totalCost.toFixed(4)}`);
  }
  if (transcript.totalTurns > 0) {
    lines.push(`- **Total Turns:** ${transcript.totalTurns}`);
  }
  lines.push('');

  // Conversation section
  lines.push('## Conversation');
  lines.push('');

  for (const msg of transcript.messages) {
    const roleHeader = msg.role === 'user' ? '### 👤 User' : '### 🤖 Assistant';
    const timestamp = formatTimestamp(msg.timestamp);
    
    lines.push(roleHeader);
    lines.push(`*${timestamp}*`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function formatJson(transcript: ExportedTranscript): string {
  return JSON.stringify(transcript, null, 2);
}

function formatPlainText(transcript: ExportedTranscript): string {
  const lines: string[] = [];
  const separator = '='.repeat(60);

  // Header
  lines.push(separator);
  lines.push('SESSION TRANSCRIPT');
  lines.push(separator);
  lines.push('');
  
  // Metadata
  lines.push(`Session ID: ${transcript.sessionId}`);
  if (transcript.title) {
    lines.push(`Title: ${transcript.title}`);
  }
  lines.push(`Engine: ${transcript.engine}`);
  if (transcript.model) {
    lines.push(`Model: ${transcript.model}`);
  }
  if (transcript.employee) {
    lines.push(`Employee: ${transcript.employee}`);
  }
  lines.push(`Created: ${formatTimestamp(transcript.createdAt)}`);
  lines.push(`Last Activity: ${formatTimestamp(transcript.lastActivity)}`);
  if (transcript.totalCost > 0) {
    lines.push(`Total Cost: $${transcript.totalCost.toFixed(4)}`);
  }
  if (transcript.totalTurns > 0) {
    lines.push(`Total Turns: ${transcript.totalTurns}`);
  }
  lines.push('');
  lines.push(separator);
  lines.push('CONVERSATION');
  lines.push(separator);
  lines.push('');

  for (const msg of transcript.messages) {
    const role = msg.role.toUpperCase();
    const timestamp = formatTimestamp(msg.timestamp);
    
    lines.push(`[${role}] ${timestamp}`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('-'.repeat(40));
    lines.push('');
  }

  return lines.join('\n');
}
