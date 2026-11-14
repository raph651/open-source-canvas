import { getClientId } from './clientId';
import { connectLive, liveFor, markStarted, phaseLabel, SESSION_CLIENT_ID } from './comfyLive';

export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
  format?: string;
}

export interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyImageRef[]; gifs?: ComfyImageRef[]; videos?: ComfyImageRef[]; audio?: ComfyImageRef[] }>;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
}

export interface ComfyRunResult {
  promptId: string;
  outputs: ComfyImageRef[];
}

export interface ComfyProgress {
  stage: 'queued' | 'running' | 'downloading' | 'done';
  promptId?: string;
  detail?: string;
  percent?: number;
}

/** What the app attaches to each job it queues, so the queue can name it. Kept in ComfyUI's extra_data. */
export interface ComfyJobMeta {
  title?: string;
  model?: string;
  nodeId?: string;
}

export interface ComfyQueueJob {
  promptId: string;
  number: number;
  status: 'running' | 'pending';
  /** queued by this app (any tab), not by the ComfyUI page or another tool */
  fromApp: boolean;
  meta?: ComfyJobMeta;
  /** ComfyUI node id -> class name, to name the node that is running */
  classes: Record<string, string>;
}

/** Thrown when a job was cancelled from the app or from ComfyUI. */
export class ComfyCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'AbortError';
  }
}

type QueueRow = [number, string, Record<string, { class_type?: string }>, { client_id?: string; osc?: ComfyJobMeta }?];

function toJob(row: QueueRow, status: ComfyQueueJob['status']): ComfyQueueJob {
  const [number, promptId, graph, extra] = row;
  const classes: Record<string, string> = {};
  for (const [id, node] of Object.entries(graph ?? {})) if (node?.class_type) classes[id] = node.class_type;
  return { promptId, number, status, fromApp: Boolean(extra?.osc), meta: extra?.osc, classes };
}

/** Pulls the node error ComfyUI stored for a failed job, so the app can say what broke instead of "check the console". */
function failureOf(entry: ComfyHistoryEntry): { interrupted: boolean; message?: string } {
  let interrupted = false;
  let message: string | undefined;
  for (const item of entry.status?.messages ?? []) {
    if (!Array.isArray(item)) continue;
    const [type, data] = item as [string, Record<string, unknown>];
    if (type === 'execution_interrupted') interrupted = true;
    if (type === 'execution_error') {
      const node = data?.node_type ? `${String(data.node_type)}: ` : '';
      message = `${node}${String(data?.exception_message ?? 'unknown error').trim()}`.slice(0, 400);
    }
  }
  return { interrupted, message };
}

export interface ComfyConfig {
  baseUrl: string;
  apiKey?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * The per-visitor id header is for our own gateway (hosted demos), which scopes outputs by it. A stock ComfyUI started
 * with --enable-cors-header rejects unknown request headers in its CORS preflight, so it must not be sent there:
 * a cross-origin loopback address is a plain local ComfyUI.
 */
function sendsClientId(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl, window.location.href);
    if (url.origin === window.location.origin) return true;
    return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return true;
  }
}

export class ComfyClient {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly clientIdHeader: boolean;

  constructor(config: ComfyConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl || 'http://127.0.0.1:8188');
    this.apiKey = config.apiKey?.trim() || undefined;
    this.clientIdHeader = sendsClientId(this.baseUrl);
  }

  private headers(json = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    const headers = new Headers(init.headers);
    if (this.clientIdHeader) headers.set('x-osc-client', getClientId());
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot reach ComfyUI at ${this.baseUrl}. Start it with --enable-cors-header. (${message})`,
      );
    }
    if (response.status === 401) {
      throw new Error('This ComfyUI is private. Add the access key in the ComfyUI panel (API key field).');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ComfyUI ${path} failed (${response.status}): ${body.slice(0, 400)}`);
    }
    return response;
  }

  async health(timeoutMs = 9000): Promise<{ version?: string; device?: string; ramTotal?: number; locked?: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.request('/system_stats', { signal: controller.signal });
      const data = await response.json();
      return {
        version: data?.system?.comfyui_version,
        device: data?.devices?.[0]?.name,
        ramTotal: data?.system?.ram_total,
        // a gateway with an access key says so when it answered without one
        locked: response.headers.get('x-osc-locked') === '1',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** The file names a loader node offers (e.g. UNETLoader / unet_name), i.e. what is installed. null when ComfyUI will not say. */
  async listChoices(node: string, field: string): Promise<string[] | null> {
    try {
      const response = await this.request(`/object_info/${encodeURIComponent(node)}`);
      const info = await response.json();
      const spec = info?.[node]?.input?.required?.[field] ?? info?.[node]?.input?.optional?.[field];
      if (!Array.isArray(spec)) return null;
      // older ComfyUI: [[...names]]; newer: ['COMBO', { options: [...names] }]
      const list = Array.isArray(spec[0]) ? spec[0] : spec[0] === 'COMBO' ? spec[1]?.options : null;
      return Array.isArray(list) ? list.map(String) : null;
    } catch {
      return null;
    }
  }

  async queue(workflow: Record<string, unknown>, meta?: ComfyJobMeta): Promise<{ promptId: string; number?: number }> {
    const response = await this.request('/prompt', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ prompt: workflow, client_id: SESSION_CLIENT_ID, extra_data: { osc: meta ?? {} } }),
    });
    const data = await response.json();
    if (!data?.prompt_id) throw new Error('ComfyUI did not return a prompt_id');
    if (data.node_errors && Object.keys(data.node_errors).length) {
      throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(data.node_errors).slice(0, 500)}`);
    }
    return { promptId: data.prompt_id, number: data.number };
  }

  async history(promptId: string): Promise<Record<string, ComfyHistoryEntry>> {
    const response = await this.request(`/history/${encodeURIComponent(promptId)}`, { headers: this.headers(false) });
    return response.json();
  }

  /** What ComfyUI is running and what is waiting, from every client (this app, the ComfyUI page, other tools). */
  async getQueue(): Promise<ComfyQueueJob[]> {
    const response = await this.request('/queue', { headers: this.headers(false) });
    const data = (await response.json()) as { queue_running?: QueueRow[]; queue_pending?: QueueRow[] };
    const pending = (data.queue_pending ?? []).map((row) => toJob(row, 'pending')).sort((a, b) => a.number - b.number);
    return [...(data.queue_running ?? []).map((row) => toJob(row, 'running')), ...pending];
  }

  /**
   * Stops one job: takes it off the queue if it is waiting, interrupts it if it is running.
   * The shared-server proxy (server/app.mjs) refuses POST /queue, so a failed delete must not skip the interrupt.
   */
  async cancelPrompt(promptId: string): Promise<void> {
    await this.request('/queue', { method: 'POST', headers: this.headers(), body: JSON.stringify({ delete: [promptId] }) }).catch(() => undefined);
    await this.interrupt(promptId);
  }

  async run(
    workflow: Record<string, unknown>,
    options: {
      onProgress?: (progress: ComfyProgress) => void;
      timeoutMs?: number;
      signal?: AbortSignal;
      meta?: ComfyJobMeta;
    } = {},
  ): Promise<ComfyRunResult> {
    if (options.signal?.aborted) throw new ComfyCancelledError();
    connectLive(this.baseUrl, this.apiKey);
    const { promptId } = await this.queue(workflow, options.meta);
    options.onProgress?.({ stage: 'queued', promptId, detail: 'Waiting in queue' });
    const started = Date.now();
    // Big models (MiniMax H3 at 768p) can take a long time; a dead ComfyUI is caught below instead.
    const timeout = options.timeoutMs ?? 90 * 60 * 1000;
    const classOf = (node?: string) =>
      node ? (workflow[node] as { class_type?: string } | undefined)?.class_type : undefined;
    let unreachableSince = 0;
    let missingChecks = 0;
    let loop = 0;

    while (Date.now() - started < timeout) {
      if (options.signal?.aborted) {
        await this.cancelPrompt(promptId).catch(() => undefined);
        throw new ComfyCancelledError();
      }
      await sleep(800);
      loop += 1;
      let entry: ComfyHistoryEntry | undefined;
      try {
        const history = await this.history(promptId);
        entry = history[promptId];
        unreachableSince = 0;
      } catch (error) {
        // A private gateway refusing the key will never succeed on retry; surface it instead of polling forever.
        if (error instanceof Error && error.message.includes('is private')) throw error;
        if (error instanceof Error && error.message.startsWith('Cannot reach')) {
          unreachableSince ||= Date.now();
          if (Date.now() - unreachableSince > 20_000) {
            throw new Error('Lost the connection to ComfyUI during the render. It may have closed or crashed: check its window, start it again and rerun.');
          }
        }
        // The history endpoint can 404 while the job is still queued.
        continue;
      }
      if (entry) {
        if (entry.status?.status_str === 'error') {
          const failure = failureOf(entry);
          if (failure.interrupted || liveFor(promptId)?.interrupted) throw new ComfyCancelledError();
          throw new Error(failure.message ? `ComfyUI error: ${failure.message}` : 'ComfyUI execution failed. Check the ComfyUI console for the node error.');
        }
        const outputs = this.extractOutputs(entry);
        if (outputs.length) {
          options.onProgress?.({ stage: 'done', promptId });
          return { promptId, outputs };
        }
        if (entry.status?.completed) {
          throw new Error('ComfyUI completed without an image/video output. Add a SaveImage or SaveVideo node.');
        }
        continue;
      }

      // Not finished: say where it is. The queue is read every few loops; step progress comes from the socket.
      const live = liveFor(promptId);
      if (live?.startedAt) {
        const phase = phaseLabel(classOf(live.node));
        const steps = live.max && live.max > 1 ? live.max : 0;
        options.onProgress?.({
          stage: 'running',
          promptId,
          percent: steps ? Math.min(1, (live.value ?? 0) / steps) : undefined,
          detail: steps ? `${phase} · step ${live.value ?? 0} of ${steps}` : phase,
        });
      }
      if (loop % 3 !== 0) continue;
      let queue: ComfyQueueJob[];
      try {
        queue = await this.getQueue();
      } catch {
        continue;
      }
      const index = queue.findIndex((job) => job.promptId === promptId);
      if (index === -1) {
        // Gone from the queue and not in history: deleted elsewhere, or ComfyUI restarted and forgot it.
        missingChecks += 1;
        if (missingChecks >= 3) throw new Error('ComfyUI no longer has this job. It was removed from the queue or ComfyUI restarted.');
        continue;
      }
      missingChecks = 0;
      const job = queue[index];
      if (job.status === 'pending') {
        options.onProgress?.({ stage: 'queued', promptId, detail: index === 0 ? 'Next in queue' : `Waiting in queue · ${index} ahead` });
      } else if (!live?.startedAt) {
        // No socket (gateway) or we joined late: still say it is running.
        markStarted(promptId);
        options.onProgress?.({ stage: 'running', promptId, detail: 'Rendering' });
      }
    }
    throw new Error(`ComfyUI run timed out after ${Math.round(timeout / 60000)} min`);
  }

  extractOutputs(entry: ComfyHistoryEntry): ComfyImageRef[] {
    const outputs: ComfyImageRef[] = [];
    for (const node of Object.values(entry.outputs ?? {})) {
      for (const key of ['images', 'gifs', 'videos', 'audio'] as const) {
        const list = node[key];
        if (Array.isArray(list)) outputs.push(...list);
      }
    }
    return outputs.filter((item) => Boolean(item?.filename));
  }

  viewUrl(image: ComfyImageRef): string {
    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder || '',
      type: image.type || 'output',
    });
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  async uploadImage(file: File, filename = file.name): Promise<{ name: string; subfolder: string; type: string }> {
    const form = new FormData();
    form.append('image', file, filename);
    form.append('overwrite', 'true');
    const response = await this.request('/upload/image', {
      method: 'POST',
      headers: this.headers(false),
      body: form,
    });
    return response.json();
  }

  /** Stops what ComfyUI is running; with a prompt id, only if that job is the one running. */
  async interrupt(promptId?: string): Promise<void> {
    await this.request('/interrupt', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(promptId ? { prompt_id: promptId } : {}),
    });
  }
}
