export interface TranscriptContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  text?: string
  name?: string
  input?: Record<string, unknown>
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system'
  content: TranscriptContentBlock[]
}

export interface QueueItem {
  id: string;
  sessionId: string;
  prompt: string;
  status: 'pending' | 'running' | 'cancelled' | 'completed';
  position: number;
  createdAt: string;
}

export interface Employee {
  name: string;
  displayName: string;
  department: string;
  rank: "executive" | "manager" | "senior" | "employee";
  engine: string;
  model?: string;
  persona: string;
  emoji?: string;
  alwaysNotify?: boolean;
  reportsTo?: string | string[];
  parentName?: string | null;
  directReports?: string[];
  depth?: number;
  chain?: string[];
  hermesProfile?: string;
  hermesProvider?: string;
  fallbackEngine?: string;
  mcp?: boolean;
  honcho?: boolean;
}

export interface CreateEmployeeRequest {
  name: string;
  displayName: string;
  department?: string;
  rank: "executive" | "manager" | "senior" | "employee";
  engine?: string;
  persona?: string;
  reportsTo?: string;
  hermesProfile?: string;
  hermesProvider?: string;
  fallbackEngine?: string;
  mcp?: boolean;
  honcho?: boolean;
}

export interface HermesProfileDetail {
  name: string;
  exists: boolean;
  config: {
    model: string;
    provider: string;
    reasoning_effort: string;
    max_turns: number;
  };
  soul: string;
  agent: string;
  role_soul?: string;
}

export interface HermesProfilePatch {
  soul?: string;
  agent?: string;
  config?: Partial<HermesProfileDetail["config"]>;
}

export interface OrgWarning {
  employee: string;
  type: string;
  message: string;
  ref?: string;
}

export interface OrgHierarchy {
  root: string | null;
  sorted: string[];
  warnings: OrgWarning[];
}

export interface OrgData {
  departments: string[];
  employees: Employee[];
  hierarchy: OrgHierarchy;
  coo?: Employee;
}

export interface HermesRuntimeMeta {
  hermesSessionId?: string
  profile?: string
  activeProfile?: string
  provider?: string
  providerUsed?: string
  model?: string
  modelUsed?: string
  honcho?: boolean
  honchoActive?: boolean
  mcp?: boolean
  fallbackExecutor?: string
  fallbackReason?: string
}

export interface BrainRoutingMeta {
  requestedBrain: string
  actualExecutor: string
  fallbackUsed?: boolean
  fallbackReason?: string
  hermesRuntimeMeta?: HermesRuntimeMeta
}

export interface SessionTransportMeta {
  hermesMeta?: HermesRuntimeMeta
  hermesRuntimeMeta?: HermesRuntimeMeta
  routingMeta?: BrainRoutingMeta
  engineOverride?: Record<string, unknown>
  engineSessions?: Record<string, unknown>
  [key: string]: unknown
}

export interface SessionRecord {
  id: string
  engine: string
  engineSessionId: string | null
  source: string
  sourceRef: string
  connector: string | null
  sessionKey: string
  replyContext: Record<string, unknown> | null
  transportMeta?: SessionTransportMeta | null
  messageId: string | null
  employee: string | null
  model: string | null
  title: string | null
  parentSessionId: string | null
  status: 'idle' | 'running' | 'error' | 'waiting' | 'paused' | 'interrupted'
  transportState?: 'idle' | 'queued' | 'running' | 'error' | 'waiting' | 'paused' | 'interrupted'
  queueDepth?: number
  createdAt: string
  lastActivity: string
  lastError: string | null
  messages?: Array<Record<string, unknown>>
  history?: Array<Record<string, unknown>>
  paused?: boolean
  [key: string]: unknown
}

export interface StatusResponse {
  status?: string
  uptime?: number
  port?: number
  defaultBrain?: string
  registeredEngines?: string[]
  fallbackPolicy?: { primary?: string; fallbacks?: string[] } | null
  engines?: {
    default?: string
    defaultBrain?: string
    registered?: Record<string, { model?: string; available?: boolean }>
    [key: string]: unknown
  }
  brain?: {
    primary?: string
    fallbacks?: string[]
    fallbackPolicy?: { primary?: string; fallbacks?: string[] } | null
  }
  sessions?: { active?: number; running?: number; total?: number }
  connectors?: Record<string, unknown>
  [key: string]: unknown
}

const BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://127.0.0.1:7777";

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body.error) return String(body.error);
    if (body.message) return String(body.message);
  } catch {
    // Response wasn't JSON — fall through
  }
  return `API error: ${res.status}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return res.json();
}

interface UploadedFile {
  id: string
  filename: string
  size: number
  mimetype: string | null
}

export const api = {
  getStatus: () => get<StatusResponse>("/api/status"),
  getSessions: () => get<SessionRecord[]>("/api/sessions"),
  getSession: (id: string) => get<SessionRecord>(`/api/sessions/${id}`),
  getSessionChildren: (id: string) => get<SessionRecord[]>(`/api/sessions/${id}/children`),
  updateSession: (id: string, data: { title?: string }) =>
    put<SessionRecord>(`/api/sessions/${id}`, data),
  deleteSession: (id: string) => del<Record<string, unknown>>(`/api/sessions/${id}`),
  duplicateSession: (id: string) =>
    post<Record<string, unknown>>(`/api/sessions/${id}/duplicate`, {}),
  bulkDeleteSessions: (ids: string[]) =>
    post<{ status: string; count: number }>("/api/sessions/bulk-delete", { ids }),
  createSession: (data: Record<string, unknown>) =>
    post<Record<string, unknown>>("/api/sessions", data),
  createStubSession: (data: Record<string, unknown>) =>
    post<Record<string, unknown>>("/api/sessions/stub", data),
  sendMessage: (id: string, data: Record<string, unknown>) =>
    post<Record<string, unknown>>(`/api/sessions/${id}/message`, data),
  stopSession: (id: string) =>
    post<{ status: string; sessionId: string }>(`/api/sessions/${id}/stop`, {}),
  resetSession: (id: string) =>
    post<{ status: string; sessionId: string }>(`/api/sessions/${id}/reset`, {}),
  getCronJobs: () => get<Record<string, unknown>[]>("/api/cron"),
  getCronRuns: (id: string) => get<Record<string, unknown>[]>(`/api/cron/${id}/runs`),
  updateCronJob: (id: string, data: Record<string, unknown>) =>
    put<Record<string, unknown>>(`/api/cron/${id}`, data),
  triggerCronJob: (id: string) =>
    post<Record<string, unknown>>(`/api/cron/${id}/trigger`, {}),
  getOrg: () => get<OrgData>("/api/org"),
  getEmployee: (name: string) => get<Employee>(`/api/org/employees/${name}`),
  createEmployee: (data: CreateEmployeeRequest) =>
    post<Employee>("/api/org/employees", data),
  updateEmployee: (name: string, data: Partial<Employee> & { alwaysNotify?: boolean }) =>
    patch<{ status: string }>(`/api/org/employees/${name}`, data),
  deleteEmployee: (name: string, deleteHermesProfile?: boolean) =>
    del<{ status: string }>(`/api/org/employees/${name}${deleteHermesProfile ? "?deleteHermesProfile=true" : ""}`),
  getHermesProfileDetail: (name: string) =>
    get<HermesProfileDetail>(`/api/hermes/profiles/${name}`),
  updateHermesProfile: (name: string, data: HermesProfilePatch) =>
    patch<{ status: string }>(`/api/hermes/profiles/${name}`, data),
  createHermesProfile: (name: string, cloneFrom?: string) =>
    post<{ status: string }>(`/api/hermes/profiles`, { name, cloneFrom }),
  listHermesProfiles: () =>
    get<{ profiles: string[] }>("/api/hermes/profiles"),
  getDepartmentBoard: (name: string) =>
    get<Record<string, unknown>>(`/api/org/departments/${name}/board`),
  getSkills: () => get<Record<string, unknown>[]>("/api/skills"),
  getSkill: (name: string) => get<Record<string, unknown>>(`/api/skills/${name}`),
  getConfig: () => get<Record<string, unknown>>("/api/config"),
  reloadConnectors: () =>
    post<{ started: string[]; stopped: string[]; errors: string[] }>("/api/connectors/reload", {}),
  updateConfig: (data: Record<string, unknown>) =>
    put<Record<string, unknown>>("/api/config", data),
  getLogs: (n?: number) =>
    get<{ lines: string[] }>(`/api/logs${n ? `?n=${n}` : ""}`),
  getOnboarding: () =>
    get<{ needed: boolean; onboarded: boolean; sessionsCount: number; hasEmployees: boolean; portalName: string | null; operatorName: string | null }>("/api/onboarding"),
  completeOnboarding: (data: { portalName?: string; operatorName?: string; language?: string }) =>
    post<{ status: string; portal: { portalName?: string; operatorName?: string; language?: string } }>("/api/onboarding", data),
  getActivity: () =>
    get<Array<{ event: string; payload: unknown; ts: number }>>("/api/activity"),
  updateDepartmentBoard: (name: string, data: unknown) =>
    put<Record<string, unknown>>(`/api/org/departments/${name}/board`, data),
  sttStatus: () =>
    get<{ available: boolean; model: string | null; downloading: boolean; progress: number; languages: string[] }>("/api/stt/status"),
  sttDownload: () =>
    post<{ status: string; model: string }>("/api/stt/download", {}),
  sttTranscribe: async (audioBlob: Blob, language?: string): Promise<{ text: string }> => {
    const params = language ? `?language=${encodeURIComponent(language)}` : "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60_000); // 5 min timeout
    try {
      const res = await fetch(`${BASE}/api/stt/transcribe${params}`, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type || "audio/webm" },
        body: audioBlob,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Transcription timed out (5 min)");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
  sttUpdateConfig: (languages: string[]) =>
    put<{ status: string; languages: string[] }>("/api/stt/config", { languages }),
  getSessionQueue: (id: string) =>
    get<QueueItem[]>(`/api/sessions/${id}/queue`),
  cancelQueueItem: (sessionId: string, itemId: string) =>
    del<{ status: string }>(`/api/sessions/${sessionId}/queue/${itemId}`),
  clearSessionQueue: (sessionId: string) =>
    del<{ status: string; cancelled: number }>(`/api/sessions/${sessionId}/queue`),
  pauseSessionQueue: (sessionId: string) =>
    post<{ status: string }>(`/api/sessions/${sessionId}/queue/pause`, {}),
  resumeSessionQueue: (sessionId: string) =>
    post<{ status: string }>(`/api/sessions/${sessionId}/queue/resume`, {}),
  getSessionTranscript: (id: string) =>
    get<TranscriptEntry[]>(`/api/sessions/${id}/transcript`),
  uploadFile: async (file: File): Promise<UploadedFile> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/api/files`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(await extractErrorMessage(res))
    return res.json()
  },
};
