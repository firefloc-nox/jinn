'use client'

import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge, StepStatus } from './types'

function defNodeToRF(n: WorkflowNode): Node {
  return {
    id: n.id,
    type: n.type.toLowerCase(),
    position: n.position ?? { x: 0, y: 0 },
    data: { ...n.config, nodeType: n.type },
  }
}

function defEdgeToRF(e: WorkflowEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: { condition: e.condition },
  }
}

function rfNodeToDef(n: Node): WorkflowNode {
  const { nodeType, ...config } = n.data as Record<string, unknown> & { nodeType: string }
  return {
    id: n.id,
    type: nodeType as WorkflowNode['type'],
    position: n.position,
    config,
  }
}

function rfEdgeToDef(e: Edge): WorkflowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined,
    condition: (e.data as { condition?: 'true' | 'false' } | undefined)?.condition,
  }
}

export interface WorkflowEditorStore {
  nodes: Node[]
  edges: Edge[]
  definition: WorkflowDefinition | null
  isDirty: boolean
  activeRunId: string | null
  stepStates: Map<string, StepStatus>
  selectedNodeId: string | null

  // ReactFlow handlers
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Actions
  setDefinition: (def: WorkflowDefinition) => void
  addNode: (node: WorkflowNode) => void
  updateNodeConfig: (nodeId: string, config: Partial<Record<string, unknown>>) => void
  removeNode: (nodeId: string) => void
  setDirty: (dirty: boolean) => void
  setActiveRunId: (runId: string | null) => void
  setStepState: (nodeId: string, status: StepStatus) => void
  clearStepStates: () => void
  setSelectedNodeId: (id: string | null) => void

  // Serialize back to definition
  toDefinition: () => WorkflowDefinition | null
}

export const useWorkflowStore = create<WorkflowEditorStore>()((set, get) => ({
  nodes: [],
  edges: [],
  definition: null,
  isDirty: false,
  activeRunId: null,
  stepStates: new Map(),
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes), isDirty: true }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges), isDirty: true }))
  },

  onConnect: (connection) => {
    set((state) => {
      const newEdge: Edge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        data: {},
      }
      return { edges: [...state.edges, newEdge], isDirty: true }
    })
  },

  setDefinition: (def) => {
    set({
      definition: def,
      nodes: def.nodes.map(defNodeToRF),
      edges: def.edges.map(defEdgeToRF),
      isDirty: false,
      stepStates: new Map(),
    })
  },

  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, defNodeToRF(node)],
      isDirty: true,
    }))
  },

  updateNodeConfig: (nodeId, config) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...config } }
          : n
      ),
      isDirty: true,
    }))
  },

  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      isDirty: true,
    }))
  },

  setDirty: (dirty) => set({ isDirty: dirty }),

  setActiveRunId: (runId) => set({ activeRunId: runId }),

  setStepState: (nodeId, status) => {
    set((state) => {
      const next = new Map(state.stepStates)
      next.set(nodeId, status)
      return { stepStates: next }
    })
  },

  clearStepStates: () => set({ stepStates: new Map() }),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  toDefinition: () => {
    const state = get()
    if (!state.definition) return null
    return {
      ...state.definition,
      nodes: state.nodes.map(rfNodeToDef),
      edges: state.edges.map(rfEdgeToDef),
    }
  },
}))
