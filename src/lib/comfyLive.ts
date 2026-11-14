/**
 * Live progress from ComfyUI's WebSocket (/ws): which job is running, which node it is on and its step count.
 * The same feed the ComfyUI web page uses for its progress bar. No React here: the client and the queue store read it.
 */

/** One id per page load. Jobs are queued with it, so ComfyUI sends their step progress to this socket. */
export const SESSION_CLIENT_ID = `osc-${crypto.randomUUID()}`;

export interface LiveJob {
  /** ComfyUI node id that is executing */
  node?: string;
  value?: number;
  max?: number;
  startedAt?: number;
  /** set when ComfyUI says the job stopped because it was interrupted */
  interrupted?: boolean;
}

const jobs = new Map<string, LiveJob>();
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let socketKey = '';
let socketOpen = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let gaveUp = false;
let notifyQueued = false;

function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const listener of listeners) listener();
  });
}

function update(promptId: string, patch: Partial<LiveJob>) {
  jobs.set(promptId, { ...jobs.get(promptId), ...patch });
  notify();
}

function socketUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws`;
    url.search = `?clientId=${encodeURIComponent(SESSION_CLIENT_ID)}`;
    return url.toString();
  } catch {
    return null;
  }
}

function handle(message: { type?: string; data?: Record<string, unknown> }) {
  const data = message.data ?? {};
  const promptId = typeof data.prompt_id === 'string' ? data.prompt_id : undefined;
  if (!promptId) return;
  switch (message.type) {
    case 'execution_start':
      update(promptId, { startedAt: Date.now(), node: undefined, value: undefined, max: undefined });
      break;
    case 'executing':
      // node null means the job is finished
      if (data.node == null) update(promptId, { node: undefined });
      else update(promptId, { node: String(data.node), value: undefined, max: undefined });
      break;
    case 'progress':
      update(promptId, { node: data.node != null ? String(data.node) : jobs.get(promptId)?.node, value: Number(data.value), max: Number(data.max) });
      break;
    case 'execution_interrupted':
      update(promptId, { interrupted: true });
      break;
    default:
      break;
  }
}

/**
 * Opens the socket once per ComfyUI address and keeps it open, reconnecting after a drop.
 * A ComfyUI behind an access key (our gateway) gets no socket: browsers cannot send the key there, so it falls back to polling.
 */
export function connectLive(baseUrl: string, apiKey?: string) {
  const url = apiKey ? null : socketUrl(baseUrl);
  if (!url) return;
  if (socket && socketKey === url && !gaveUp) return;
  socket?.close();
  clearTimeout(retryTimer);
  socketKey = url;
  gaveUp = false;
  let everOpened = false;
  let failures = 0;
  const open = () => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    socket = ws;
    ws.onopen = () => {
      everOpened = true;
      failures = 0;
      socketOpen = true;
      notify();
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return; // binary frames are preview images
      try {
        handle(JSON.parse(event.data));
      } catch {
        /* not JSON */
      }
    };
    ws.onclose = () => {
      socketOpen = false;
      notify();
      failures += 1;
      // A server that never accepted the socket (the shared-server proxy blocks it) is left alone; the app polls instead.
      if (!everOpened && failures >= 3) {
        gaveUp = true; // the next connectLive() (next render, or ComfyUI coming back online) tries again
        return;
      }
      if (socket === ws && socketKey === url) retryTimer = setTimeout(open, everOpened ? 3000 : 5000);
    };
  };
  open();
}

export function isLiveConnected() {
  return socketOpen;
}

export function liveFor(promptId: string): LiveJob | undefined {
  return jobs.get(promptId);
}

export function onLiveChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notes the moment a job was first seen running, for jobs whose execution_start we missed (other clients, reloads). */
export function markStarted(promptId: string) {
  if (!jobs.get(promptId)?.startedAt) update(promptId, { startedAt: Date.now() });
}

const PHASES: Array<[RegExp, string]> = [
  [/Sampler|KSampler|Guider/i, 'Rendering'],
  [/Decode/i, 'Decoding'],
  [/Save|CreateVideo|Preview/i, 'Saving'],
  [/Loader|LoadImage/i, 'Loading models'],
  [/TextEncode|ToVideo|ImgToVideo|Conditioning|Edit/i, 'Reading the prompt'],
  [/Upscale|Scale/i, 'Upscaling'],
];

/** A short human name for what a node does, from its class name. */
export function phaseLabel(classType?: string): string {
  if (!classType) return 'Rendering';
  for (const [pattern, label] of PHASES) if (pattern.test(classType)) return label;
  return classType.replace(/([a-z])([A-Z])/g, '$1 $2');
}
