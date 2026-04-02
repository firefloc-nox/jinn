'use client'

import { useRef, useState, useEffect } from 'react'
import { MessageSquare, X, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { useWorkflowStore } from '@/lib/workflows/store'
import { t, detectLang, type Lang } from '@/lib/workflows/i18n'
import type { WorkflowDefinition, WorkflowNode } from '@/lib/workflows/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  workflow?: WorkflowDefinition
  node?: WorkflowNode
}

function makeNodeId() {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function WorkflowAssistant({
  workflowId,
  welcomeMessage,
}: {
  workflowId?: string
  welcomeMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const onboardedRef = useRef(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lang] = useState<Lang>(() => detectLang())
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { definition, nodes, addNode, setDefinition } = useWorkflowStore()

  // Onboarding: show welcome message on first open
  useEffect(() => {
    if (!open) return
    if (onboardedRef.current) return
    if (messages.length > 0) return
    if (!welcomeMessage) return

    // Check localStorage to avoid re-showing after page reload
    const lsKey = `jinn-wa-onboarded-${workflowId ?? 'default'}`
    if (typeof window !== 'undefined' && localStorage.getItem(lsKey)) return

    onboardedRef.current = true
    if (typeof window !== 'undefined') localStorage.setItem(lsKey, '1')
    setMessages([{ role: 'assistant', content: welcomeMessage }])
  }, [open, welcomeMessage, workflowId, messages.length])

  async function handleSend() {
    const msg = input.trim()
    if (!msg || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const context = {
        workflowId,
        workflow: definition,
        nodeCount: nodes.length,
      }
      const result = await api.assistWorkflow(msg, context)
      const reply = typeof result === 'object' && result !== null ? (result as { reply?: string; workflow?: unknown; node?: unknown }) : {}
      const replyText = String(reply.reply ?? t('assistant.error', lang))

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: replyText,
          workflow: reply.workflow as WorkflowDefinition | undefined,
          node: reply.node as WorkflowNode | undefined,
        },
      ])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('assistant.error', lang) }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleApplyWorkflow(wf: WorkflowDefinition) {
    setDefinition(wf)
  }

  function handleInsertNode(node: WorkflowNode) {
    addNode({
      ...node,
      id: makeNodeId(),
      position: node.position ?? { x: 300, y: 300 },
    })
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            right: 20,
            width: 320,
            height: 400,
            background: 'var(--bg)',
            border: '1px solid var(--separator)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--separator)',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              {t('assistant.title', lang)}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                {t('placeholder.assistant', lang)}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--fill-secondary)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
                {m.workflow && (
                  <button
                    onClick={() => handleApplyWorkflow(m.workflow!)}
                    style={{
                      marginTop: 6,
                      padding: '5px 10px',
                      background: 'var(--system-green)',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ✓ {t('btn.apply', lang)}
                  </button>
                )}
                {m.node && (
                  <button
                    onClick={() => handleInsertNode(m.node!)}
                    style={{
                      marginTop: 6,
                      padding: '5px 10px',
                      background: 'var(--system-blue)',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + {t('btn.insert', lang)}
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontStyle: 'italic' }}>
                {t('assistant.thinking', lang)}
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--separator)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
              flexShrink: 0,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={t('placeholder.assistant', lang)}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--separator)',
                background: 'var(--fill-secondary)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                opacity: input.trim() && !loading ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 1001,
          color: '#fff',
        }}
        title={t('assistant.title', lang)}
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </>
  )
}
