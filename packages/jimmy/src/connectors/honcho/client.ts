/**
 * HonchoClient — HTTP client for the Honcho API (port 8000).
 */

import http from "node:http";

export interface HonchoConclusion {
  id: string;
  content: string;
  observer_id: string;
  observed_id: string;
  session_id: string | null;
  created_at: string;
}

export interface HonchoConclusionList {
  items: HonchoConclusion[];
  total: number;
}

export interface HonchoWorkspace {
  id: string;
  name?: string;
}

export class HonchoClient {
  private readonly hostname: string;
  private readonly port: number;
  private _healthy: boolean = false;

  constructor(port = 8000, host = "127.0.0.1") {
    this.hostname = host;
    this.port = port;
  }

  get healthy(): boolean {
    return this._healthy;
  }

  private request<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body != null ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: this.hostname,
        port: this.port,
        path: urlPath,
        method,
        headers: {
          "Accept": "application/json",
          ...(bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode === 204 || raw.trim() === "") {
            resolve(undefined as unknown as T);
            return;
          }
          try {
            const parsed = JSON.parse(raw) as T;
            if (res.statusCode != null && res.statusCode >= 400) {
              const errMsg = (parsed as Record<string, unknown>)?.["detail"] ?? `HTTP ${res.statusCode}`;
              reject(new Error(String(errMsg)));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Honcho API: invalid JSON response (status ${res.statusCode})`));
          }
        });
        res.on("error", reject);
      });

      req.on("error", reject);
      req.setTimeout(10_000, () => req.destroy(new Error("Honcho API request timeout")));
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.request<unknown>("POST", "/v3/workspaces/list", {});
      this._healthy = true;
      return true;
    } catch {
      this._healthy = false;
      return false;
    }
  }

  async listWorkspaces(): Promise<HonchoWorkspace[]> {
    return (await this.request<HonchoWorkspace[]>("POST", "/v3/workspaces/list", {})) ?? [];
  }

  async listConclusions(workspaceId: string, opts?: { limit?: number; offset?: number }): Promise<HonchoConclusionList> {
    const body: Record<string, unknown> = {};
    if (opts?.limit != null) body.page_size = opts.limit;
    if (opts?.offset != null) body.page = Math.floor(opts.offset / (opts.limit ?? 20)) + 1;
    const res = await this.request<HonchoConclusion[]>(
      "POST",
      `/v3/workspaces/${encodeURIComponent(workspaceId)}/conclusions/list`,
      body,
    );
    return { items: res ?? [], total: (res ?? []).length };
  }

  async queryConclusions(workspaceId: string, query: string, topK = 10): Promise<HonchoConclusion[]> {
    return (await this.request<HonchoConclusion[]>(
      "POST",
      `/v3/workspaces/${encodeURIComponent(workspaceId)}/conclusions/query`,
      { query, top_k: topK },
    )) ?? [];
  }

  async deleteConclusion(workspaceId: string, conclusionId: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/v3/workspaces/${encodeURIComponent(workspaceId)}/conclusions/${encodeURIComponent(conclusionId)}`,
    );
  }

  async createConclusions(
    workspaceId: string,
    conclusions: Array<{ content: string; observer_id: string; observed_id: string; session_id?: string }>,
  ): Promise<HonchoConclusion[]> {
    return (await this.request<HonchoConclusion[]>(
      "POST",
      `/v3/workspaces/${encodeURIComponent(workspaceId)}/conclusions`,
      { conclusions },
    )) ?? [];
  }
}

export function resolveHonchoUrl(): { host: string; port: number } {
  const url = process.env.HONCHO_URL ?? "http://127.0.0.1:8000";
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port, 10) || 8000 };
  } catch {
    return { host: "127.0.0.1", port: 8000 };
  }
}
