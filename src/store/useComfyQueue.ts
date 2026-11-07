import { useEffect } from 'react';
import { create } from 'zustand';
import { ComfyClient, type ComfyQueueJob } from '../lib/comfy';
import { connectLive, isLiveConnected, onLiveChange } from '../lib/comfyLive';
import type { ProviderProgress } from '../lib/providers';
import { useSettingsStore } from './useSettingsStore';

/** What a canvas node shows while it renders. Kept out of the document so it is never saved or synced. */
export interface NodeProgress extends ProviderProgress {
  startedAt: number;
}

interface ComfyQueueState {
  /** everything ComfyUI is running or holding, from any client */
  jobs: ComfyQueueJob[];
  /** ok: queue read; private: the server answered but will not list its queue (the shared-server proxy); offline: no answer */
  access: 'ok' | 'private' | 'offline';
  /** the progress socket is open (step counts available) */
  live: boolean;
  /** bumps on every socket message so views re-read live progress */
  tick: number;
  nodeProgress: Record<string, NodeProgress>;
  setNodeProgress: (nodeId: string, progress: ProviderProgress | null) => void;
  refresh: () => Promise<void>;
  cancelJob: (promptId: string) => Promise<void>;
  cancelNode: (nodeId: string) => void;
  cancelAll: () => Promise<void>;
}

/** One controller per node that is rendering, so a single node can be cancelled without stopping the rest of the run. */
const controllers = new Map<string, AbortController>();

export function beginNodeRun(nodeId: string): AbortSignal {
  controllers.get(nodeId)?.abort();
  const controller = new AbortController();
  controllers.set(nodeId, controller);
  return controller.signal;
}

export function endNodeRun(nodeId: string) {
  controllers.delete(nodeId);
  useComfyQueue.getState().setNodeProgress(nodeId, null);
}

export function abortAllNodeRuns() {
  for (const controller of controllers.values()) controller.abort();
}

function client() {
  const { baseUrl, apiKey } = useSettingsStore.getState();
  return new ComfyClient({ baseUrl, apiKey });
}

export const useComfyQueue = create<ComfyQueueState>((set, get) => ({
  jobs: [],
  access: 'offline',
  live: false,
  tick: 0,
  nodeProgress: {},

  setNodeProgress: (nodeId, progress) =>
    set((state) => {
      const next = { ...state.nodeProgress };
      if (progress) next[nodeId] = { ...progress, startedAt: state.nodeProgress[nodeId]?.startedAt ?? Date.now() };
      else delete next[nodeId];
      return { nodeProgress: next };
    }),

  refresh: async () => {
    try {
      const jobs = await client().getQueue();
      set({ jobs, access: 'ok' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      set({ jobs: [], access: message.startsWith('Cannot reach') ? 'offline' : 'private' });
    }
  },

  cancelJob: async (promptId) => {
    // A job this tab is waiting on is cancelled through its node, so the node resets instead of showing an error.
    const job = get().jobs.find((item) => item.promptId === promptId);
    const nodeId = job?.meta?.nodeId;
    const controller = nodeId ? controllers.get(nodeId) : undefined;
    if (controller && get().nodeProgress[nodeId!]?.promptId === promptId) controller.abort();
    else await client().cancelPrompt(promptId).catch(() => undefined);
    set((state) => ({ jobs: state.jobs.filter((item) => item.promptId !== promptId) }));
    void get().refresh();
  },

  cancelNode: (nodeId) => {
    controllers.get(nodeId)?.abort();
  },

  cancelAll: async () => {
    const jobs = get().jobs;
    abortAllNodeRuns();
    const comfy = client();
    // waiting jobs first, so ComfyUI does not start the next one when the running one stops
    for (const job of [...jobs].reverse()) await comfy.cancelPrompt(job.promptId).catch(() => undefined);
    void get().refresh();
  },
}));

/**
 * Keeps the queue and the progress socket current while ComfyUI is connected. Mount once, in the editor.
 * Reads the queue every 1.5 s: it is a small local request, and it also catches jobs queued from the ComfyUI page.
 */
export function useComfyQueueSync() {
  const useComfy = useSettingsStore((state) => state.useComfy);
  const connection = useSettingsStore((state) => state.connection);
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const active = useComfy && connection === 'online';

  useEffect(() => {
    if (!active) {
      useComfyQueue.setState({ jobs: [], access: 'offline' });
      return;
    }
    connectLive(baseUrl, apiKey);
    const stop = onLiveChange(() => useComfyQueue.setState((state) => ({ tick: state.tick + 1, live: isLiveConnected() })));
    void useComfyQueue.getState().refresh();
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      // a server that keeps its queue private is asked again every 30 s, not every 1.5 s
      if (useComfyQueue.getState().access === 'private' && ticks % 20 !== 0) return;
      void useComfyQueue.getState().refresh();
    }, 1500);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [active, baseUrl, apiKey]);
}
