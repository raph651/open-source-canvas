import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { create } from 'zustand';
import { MODELS, MODEL_BY_ID, NODE_META, TEMPLATES, makeEdge } from '../data';
import { getRuntimeProvider, type Provider } from '../lib/providers';
import { mentionHandle } from '../lib/mentions';
import { STATIC_DEMO } from '../lib/staticDemo';
import { useSettingsStore } from './useSettingsStore';
import type {
  CanvasDoc,
  CanvasNode,
  CanvasAsset,
  CanvasComment,
  CanvasNodeData,
  CanvasReaction,
  CanvasStroke,
  CanvasVersion,
  CanvasTemplate,
  ModelId,
  NodeKind,
} from '../types';

const STORAGE_KEY = 'framegraph.workspace.v1';

type View = 'dashboard' | 'editor';
type Tab = 'canvases' | 'templates';

interface WorkspaceState {
  view: View;
  tab: Tab;
  docs: Record<string, CanvasDoc>;
  order: string[];
  templates: CanvasTemplate[];
  assets: CanvasAsset[];
  versions: CanvasVersion[];
  activeId: string | null;
  selectedId: string | null;
  selectedIds: string[];
  detailNodeId: string | null;
  historyPast: CanvasDoc[];
  historyFuture: CanvasDoc[];
  clipboard: { nodes: CanvasNode[]; edges: Edge[] } | null;
  running: boolean;
  runLabel: string;
  toast: string | null;
  showPromo: boolean;
  savedAt: number;
  dragging: boolean;
  createCanvas: (templateId?: string) => void;
  saveAsTemplate: (name?: string) => void;
  deleteTemplate: (id: string) => void;
  addAsset: (asset: Omit<CanvasAsset, 'id' | 'createdAt'>) => void;
  removeAsset: (id: string) => void;
  saveVersion: (label?: string, silent?: boolean, canvasId?: string) => void;
  restoreVersion: (id: string) => void;
  deleteVersion: (id: string) => void;
  duplicateCanvas: (id: string) => void;
  openCanvas: (id: string) => void;
  openPage: (nodeId: string) => void;
  goPageBack: () => void;
  goDashboard: () => void;
  deleteCanvas: (id: string) => void;
  cleanupCanvases: () => void;
  renameCanvas: (title: string) => void;
  setTab: (tab: Tab) => void;
  setSelected: (id: string | null) => void;
  setDragging: (dragging: boolean) => void;
  markNodesTouched: (ids: string[]) => void;
  /** `explicit` is the expand button: it opens the side panel even after the user dismissed it. */
  openDetails: (id: string, explicit?: boolean) => void;
  closeDetails: () => void;
  applyRemoteDoc: (doc: CanvasDoc) => void;
  addComment: (x: number, y: number, text: string, anchor?: { nodeId: string; dx: number; dy: number }) => string | undefined;
  moveComment: (id: string, patch: { x: number; y: number; nodeId?: string; dx?: number; dy?: number }) => void;
  addStroke: (stroke: CanvasStroke) => void;
  removeStroke: (id: string) => void;
  clearStrokes: () => void;
  addReaction: (x: number, y: number, emoji: string, anchor?: { nodeId: string; dx: number; dy: number }) => void;
  updateReaction: (id: string, patch: Partial<Pick<CanvasReaction, 'x' | 'y' | 'emoji' | 'nodeId' | 'dx' | 'dy'>>) => void;
  removeReaction: (id: string) => void;
  resolveComment: (id: string) => void;
  deleteComment: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  snapshotHistory: (key?: string) => void;
  undo: (keepSelection?: boolean) => void;
  redo: (keepSelection?: boolean) => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  setShowPromo: (show: boolean) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  disconnectNodes: (source: string, target: string) => void;
  addNode: (kind: NodeKind, at?: { x: number; y: number }, modelId?: ModelId, dataPatch?: Partial<CanvasNodeData>, select?: boolean) => string | undefined;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  reconcilePrompts: () => void;
  run: (target: 'all' | 'selected') => Promise<void>;
  cancelRun: () => void;
  clearOutputs: () => void;
  saveNow: () => void;
  showToast: (message: string) => void;
  resetWorkspace: () => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

// The starter canvases: three boards that each already show a finished output (generated with LTX-2.5), so a first-time
// visitor opens a board that shows what a run produces. They are deliberately different from the three featured
// templates at the top of the studio (Music Video, Marketing Studio, Recreate), so the page never shows the same cards twice.
const EXAMPLE_CANVASES: Array<{ templateId: string; id: string; title: string; hoursAgo: number }> = [
  { templateId: 'product-film', id: 'example-product-film', title: 'Product film', hoursAgo: 30 },
  { templateId: 'motion-study', id: 'example-motion-study', title: 'Motion study', hoursAgo: 52 },
  { templateId: 'character-loop', id: 'example-character-loop', title: 'Character loop', hoursAgo: 76 },
];
// ids of the earlier starter set; they duplicated the featured templates, so they are replaced when a saved workspace loads
const LEGACY_EXAMPLE_IDS = ['example-framejutsu', 'example-marketing-studio', 'example-recreate'];

function initialExampleDocs(): CanvasDoc[] {
  return EXAMPLE_CANVASES.map(({ templateId, id, title, hoursAgo }) => {
    const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
    const built = template.build();
    return { id, title, updatedAt: Date.now() - 1000 * 60 * 60 * hoursAgo, ...built };
  });
}

interface Persisted {
  docs: Record<string, CanvasDoc>;
  order: string[];
  templates: CanvasTemplate[];
  assets: CanvasAsset[];
  versions: CanvasVersion[];
  showPromo: boolean;
}

function loadPersisted(): Partial<Persisted> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed.docs || !parsed.order) return null;
    const legacyModels: Record<string, ModelId> = {
      lumen: 'sd-turbo',
      mosaic: 'sd-turbo',
      velvet: 'sd-turbo',
      kino: 'ltx-video-2b',
      echo: 'sd-turbo',
    };
    for (const doc of Object.values(parsed.docs)) {
      for (const node of doc.nodes) {
        const previous = node.data.model as string | undefined;
        if (previous && legacyModels[previous]) {
          node.data.model = legacyModels[previous];
          if (['Lumen', 'Mosaic', 'Velvet', 'Echo'].includes(node.data.title)) {
            node.data.title = 'SD-Turbo';
          }
          if (node.data.title === 'Kino') node.data.title = 'LTX-Video 2B';
        }
      }
    }
    // Boards saved while 0 was the default seed would pin every run to one cached image; make them random once.
    const seedResetKey = 'osc.seed-random.v1';
    if (!localStorage.getItem(seedResetKey)) {
      for (const doc of Object.values(parsed.docs)) for (const node of doc.nodes) delete node.data.seed;
      localStorage.setItem(seedResetKey, '1');
    }
    return parsed;
  } catch {
    return null;
  }
}

const persisted = loadPersisted();
const seedDocs = initialExampleDocs();
const initialDocs: Record<string, CanvasDoc> = persisted?.docs
  ? { ...persisted.docs }
  : Object.fromEntries(seedDocs.map((doc) => [doc.id, doc]));
let initialOrder: string[] = persisted?.order ?? seedDocs.map((doc) => doc.id);
if (persisted?.docs) {
  for (const id of LEGACY_EXAMPLE_IDS) delete initialDocs[id];
  const missing = seedDocs.filter((doc) => !initialDocs[doc.id]);
  for (const doc of missing) initialDocs[doc.id] = doc;
  initialOrder = [...missing.map((doc) => doc.id), ...initialOrder.filter((id) => initialDocs[id] && !missing.some((doc) => doc.id === id))];
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let runToken = 0;
let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;

function cloneDoc(doc: CanvasDoc): CanvasDoc {
  return typeof structuredClone === 'function'
    ? structuredClone(doc)
    : (JSON.parse(JSON.stringify(doc)) as CanvasDoc);
}
const activeProviders = new Set<Provider>();
let runningCanvasId: string | null = null;
const MAX_PARALLEL_RUNS = 2;

function activeDoc(state: WorkspaceState): CanvasDoc | null {
  return state.activeId ? state.docs[state.activeId] ?? null : null;
}

function withDoc(
  state: WorkspaceState,
  canvasId: string,
  updater: (doc: CanvasDoc) => CanvasDoc,
): Partial<WorkspaceState> {
  const doc = state.docs[canvasId];
  if (!doc) return {};
  return {
    docs: { ...state.docs, [canvasId]: { ...updater(doc), updatedAt: Date.now() } },
    savedAt: Date.now(),
  };
}

function withActiveDoc(
  state: WorkspaceState,
  updater: (doc: CanvasDoc) => CanvasDoc,
): Partial<WorkspaceState> {
  return state.activeId ? withDoc(state, state.activeId, updater) : {};
}

function upstreamIds(doc: CanvasDoc, start: string[]): Set<string> {
  const ids = new Set(start);
  const stack = [...start];
  while (stack.length) {
    const id = stack.pop()!;
    for (const edge of doc.edges) {
      if (edge.target === id && !ids.has(edge.source)) {
        ids.add(edge.source);
        stack.push(edge.source);
      }
    }
  }
  return ids;
}

function downstreamModels(doc: CanvasDoc, start: string[]): string[] {
  const seen = new Set(start);
  const stack = [...start];
  const models: string[] = [];
  while (stack.length) {
    const id = stack.pop()!;
    const node = doc.nodes.find((n) => n.id === id);
    if (node?.data.kind === 'model') models.push(node.id);
    for (const edge of doc.edges) {
      if (edge.source === id && !seen.has(edge.target)) {
        seen.add(edge.target);
        stack.push(edge.target);
      }
    }
  }
  return [...new Set(models)];
}

function topoSort(doc: CanvasDoc, ids: Set<string>): string[] {
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const edge of doc.edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of doc.edges) {
      if (edge.source !== id || !ids.has(edge.target)) continue;
      const next = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, next);
      if (next === 0) queue.push(edge.target);
    }
  }
  return order;
}

function createsCycle(doc: CanvasDoc, source: string, target: string): boolean {
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of doc.edges) {
      if (edge.source === id) stack.push(edge.target);
    }
  }
  return false;
}

export const useCanvasStore = create<WorkspaceState>((set, get) => ({
  view: 'dashboard',
  tab: 'canvases',
  docs: initialDocs,
  order: initialOrder,
  templates: persisted?.templates ?? [],
  assets: persisted?.assets ?? [],
  versions: persisted?.versions ?? [],
  activeId: null,
  selectedId: null,
  selectedIds: [],
  detailNodeId: null,
  historyPast: [],
  historyFuture: [],
  clipboard: null,
  running: false,
  runLabel: '',
  toast: null,
  showPromo: persisted?.showPromo ?? true,
  savedAt: Date.now(),
  dragging: false,

  createCanvas: (templateId) => {
    if (templateId === 'objects-swap' || templateId === 'marketing-studio' || templateId === 'recreate') {
      const current = get();
      const existing = Object.values(current.docs).find(
        (doc) =>
          !doc.pageParentId &&
          (doc.templateId === templateId ||
            (templateId === 'objects-swap' &&
              (doc.title === 'Music Video' || doc.title === 'FrameJutsu' || doc.title === 'Objects Swap')) ||
            (templateId === 'marketing-studio' && doc.title === 'Marketing Studio') ||
            (templateId === 'recreate' && doc.title === 'Recreate')),
      );
      if (existing) {
        set({
          activeId: existing.id,
          view: 'editor',
          selectedId: null,
          selectedIds: [],
          detailNodeId: null,
          historyPast: [],
          historyFuture: [],
        });
        return;
      }
    }
    const staticTemplate = TEMPLATES.find((item) => item.id === templateId);
    const customTemplate = get().templates.find((item) => item.id === templateId);
    let built = staticTemplate ? staticTemplate.build() : { nodes: [], edges: [] };
    let title = staticTemplate ? staticTemplate.name : 'Untitled canvas';

    if (customTemplate) {
      const idMap = new Map<string, string>();
      const nodes = customTemplate.nodes.map((node) => {
        const nextId = uid();
        idMap.set(node.id, nextId);
        return {
          ...node,
          id: nextId,
          selected: false,
          position: { ...node.position },
          data: {
            ...node.data,
            status: 'idle' as const,
            outputUrl: undefined,
            outputKind: undefined,
            error: undefined,
            lastRun: undefined,
          },
        };
      });
      const edges = customTemplate.edges
        .map((edge) => {
          const sourceId = idMap.get(edge.source);
          const targetId = idMap.get(edge.target);
          if (!sourceId || !targetId) return null;
          return { ...edge, id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId };
        })
        .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
      built = { nodes, edges };
      title = customTemplate.name;
    }

    const id = uid();
    const doc: CanvasDoc = {
      id,
      title,
      updatedAt: Date.now(),
      templateId: staticTemplate?.id ?? customTemplate?.id,
      ...built,
    };
    set((state) => ({
      docs: { ...state.docs, [id]: doc },
      order: [id, ...state.order],
      activeId: id,
      selectedId: null,
      selectedIds: [],
      historyPast: [],
      historyFuture: [],
      view: 'editor',
      savedAt: Date.now(),
    }));
  },

  saveAsTemplate: (name) => {
    const doc = activeDoc(get());
    if (!doc || doc.nodes.length === 0) {
      get().showToast('Add at least one node before saving a template');
      return;
    }
    const previewNode = doc.nodes.find((node) => node.data.outputUrl);
    const preview = previewNode?.data.outputUrl;
    const template: CanvasTemplate = {
      id: uid(),
      name: name?.trim() || doc.title,
      description: `Saved from ${doc.title}`,
      tag: 'Yours',
      accent: '#ff7a3d',
      previewSeed: doc.title,
      previewUrl: preview,
      previewKind:
        previewNode?.data.outputKind === 'video'
          ? 'video'
          : previewNode?.data.outputKind === 'image'
            ? 'image'
            : undefined,
      nodeCount: doc.nodes.length,
      createdAt: Date.now(),
      nodes: doc.nodes.map((node) => ({
        ...node,
        selected: false,
        position: { ...node.position },
        data: {
          ...node.data,
          status: 'idle',
          outputUrl: undefined,
          outputKind: undefined,
          error: undefined,
          lastRun: undefined,
        },
      })),
      edges: doc.edges.map((edge) => ({ ...edge })),
    };
    set((state) => ({ templates: [template, ...state.templates], savedAt: Date.now() }));
    get().showToast(`Template “${template.name}” saved`);
  },

  deleteTemplate: (id) => {
    set((state) => ({
      templates: state.templates.filter((template) => template.id !== id),
      savedAt: Date.now(),
    }));
    get().showToast('Template deleted');
  },

  addAsset: (asset) => {
    set((state) => {
      const withoutDuplicate = state.assets.filter((item) => item.url !== asset.url);
      const next: CanvasAsset = {
        ...asset,
        id: uid(),
        createdAt: Date.now(),
      };
      return { assets: [next, ...withoutDuplicate].slice(0, 80), savedAt: Date.now() };
    });
  },

  removeAsset: (id) => {
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== id),
      savedAt: Date.now(),
    }));
    get().showToast('Asset removed from the shelf');
  },

  saveVersion: (label = 'Manual snapshot', silent = false, canvasId) => {
    const state = get();
    const doc = canvasId === undefined ? activeDoc(state) : state.docs[canvasId];
    if (!doc) return;
    const previous = state.versions.find((version) => version.docId === doc.id);
    if (
      previous &&
      JSON.stringify(previous.nodes) === JSON.stringify(doc.nodes) &&
      JSON.stringify(previous.edges) === JSON.stringify(doc.edges)
    ) {
      if (!silent) get().showToast('No changes since the last version');
      return;
    }
    const version: CanvasVersion = {
      id: uid(),
      docId: doc.id,
      title: doc.title,
      label,
      at: Date.now(),
      nodes: structuredClone(doc.nodes),
      edges: structuredClone(doc.edges),
      comments: structuredClone(doc.comments ?? []),
    };
    const sameDoc = [version, ...state.versions.filter((item) => item.docId === doc.id)].slice(0, 8);
    let next = [...sameDoc, ...state.versions.filter((item) => item.docId !== doc.id)].slice(0, 32);
    while (JSON.stringify(next).length > 2_000_000 && next.length > 1) next.pop();
    set({ versions: next, savedAt: Date.now() });
    if (!silent) get().showToast('Version saved');
  },

  restoreVersion: (id) => {
    const version = get().versions.find((item) => item.id === id);
    if (!version) return;
    set((state) => ({
      docs: {
        ...state.docs,
        [version.docId]: {
          ...state.docs[version.docId],
          id: version.docId,
          title: version.title,
          nodes: structuredClone(version.nodes),
          edges: structuredClone(version.edges),
          comments: structuredClone(version.comments ?? []),
          updatedAt: Date.now(),
        },
      },
      order: state.order.includes(version.docId) ? state.order : [version.docId, ...state.order],
      activeId: version.docId,
      view: 'editor',
      selectedId: null,
      selectedIds: [],
      savedAt: Date.now(),
    }));
    get().showToast(`Restored “${version.label}”`);
  },

  deleteVersion: (id) => {
    set((state) => ({ versions: state.versions.filter((item) => item.id !== id) }));
    get().showToast('Version deleted');
  },

  duplicateCanvas: (id) => {
    const source = get().docs[id];
    if (!source) return;
    const idMap = new Map<string, string>();
    const nodes = source.nodes.map((node) => {
      const nextId = uid();
      idMap.set(node.id, nextId);
      return {
        ...node,
        id: nextId,
        position: { x: node.position.x + 48, y: node.position.y + 48 },
      };
    });
    const edges = source.edges
      .map((edge) => {
        const sourceId = idMap.get(edge.source);
        const targetId = idMap.get(edge.target);
        if (!sourceId || !targetId) return null;
        return { ...edge, id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
    const copy: CanvasDoc = {
      ...source,
      id: uid(),
      title: `${source.title} copy`,
      updatedAt: Date.now(),
      nodes,
      edges,
    };
    set((state) => ({
      docs: { ...state.docs, [copy.id]: copy },
      order: [copy.id, ...state.order],
      savedAt: Date.now(),
    }));
    get().showToast('Canvas duplicated');
  },

  openPage: (nodeId) => {
    const state = get();
    const parent = activeDoc(state);
    if (!parent) return;
    const node = parent.nodes.find((item) => item.id === nodeId);
    if (!node || node.data.kind !== 'page') return;
    let pageId = node.data.pageId;
    const nextDocs = { ...state.docs };
    if (pageId && !nextDocs[pageId]) {
      nextDocs[pageId] = {
        id: pageId,
        title: node.data.title || 'Page',
        updatedAt: Date.now(),
        nodes: [],
        edges: [],
        pageParentId: parent.id,
      };
    } else if (!pageId) {
      pageId = uid();
      nextDocs[pageId] = {
        id: pageId,
        title: node.data.title || 'Page',
        updatedAt: Date.now(),
        nodes: [],
        edges: [],
        pageParentId: parent.id,
      };
      nextDocs[parent.id] = {
        ...parent,
        nodes: parent.nodes.map((item) =>
          item.id === nodeId ? { ...item, data: { ...item.data, pageId } } : item,
        ),
      };
    }
    set({
      docs: nextDocs,
      order: nextDocs[pageId] ? [pageId, ...state.order.filter((id) => id !== pageId)] : state.order,
      activeId: pageId,
      view: 'editor',
      selectedId: null,
      selectedIds: [],
      detailNodeId: null,
      historyPast: [],
      historyFuture: [],
      savedAt: Date.now(),
    });
  },
  goPageBack: () => {
    const doc = activeDoc(get());
    if (!doc?.pageParentId) return;
    set({
      activeId: doc.pageParentId,
      selectedId: null,
      selectedIds: [],
      detailNodeId: null,
      historyPast: [],
      historyFuture: [],
      savedAt: Date.now(),
    });
  },
    openCanvas: (id) => {
    if (!get().docs[id]) return;
    set({ view: 'editor', activeId: id, selectedId: null, selectedIds: [], historyPast: [], historyFuture: [] });
  },

  goDashboard: () => set({ view: 'dashboard', selectedId: null }),

  cleanupCanvases: () => {
    const state = get();
    const seenTitles = new Set<string>();
    const kept: string[] = [];
    let removed = 0;
    for (const id of state.order) {
      const doc = state.docs[id];
      if (!doc) continue;
      if (doc.pageParentId) {
        kept.push(id);
        continue;
      }
      const title = doc.title.trim().toLowerCase();
      const empty = doc.nodes.length === 0;
      if (empty || (title && seenTitles.has(title))) {
        removed += 1;
        continue;
      }
      if (title) seenTitles.add(title);
      kept.push(id);
    }
    if (removed === 0) {
      state.showToast('No empty or duplicate canvases to clean up');
      return;
    }
    const docs: Record<string, CanvasDoc> = {};
    for (const id of kept) docs[id] = state.docs[id];
    const activeId = state.activeId && kept.includes(state.activeId) ? state.activeId : kept[0] ?? null;
    set({
      docs,
      order: kept,
      activeId,
      selectedId: null,
      selectedIds: [],
      detailNodeId: null,
      savedAt: Date.now(),
    });
    state.showToast(`${removed} empty or duplicate canvas${removed === 1 ? '' : 's'} removed`);
  },

  deleteCanvas: (id) => {
    set((state) => {
      const docs = { ...state.docs };
      delete docs[id];
      return {
        docs,
        order: state.order.filter((item) => item !== id),
        activeId: state.activeId === id ? null : state.activeId,
        view: state.activeId === id ? 'dashboard' : state.view,
        savedAt: Date.now(),
      };
    });
    get().showToast('Canvas deleted');
  },

  renameCanvas: (title) => {
    get().snapshotHistory('rename');
    set((state) =>
      withActiveDoc(state, (doc) => ({ ...doc, title: title.trim() || 'Untitled canvas' })),
    );
  },

  setTab: (tab) => set({ tab }),
  addStroke: (stroke) => {
    get().snapshotHistory('draw');
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        strokes: [...(doc.strokes ?? []), stroke],
        updatedAt: Date.now(),
      })),
    );
  },
  removeStroke: (id) => {
    get().snapshotHistory('erase-draw');
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        strokes: (doc.strokes ?? []).filter((stroke) => stroke.id !== id),
        updatedAt: Date.now(),
      })),
    );
  },
  clearStrokes: () => {
    get().snapshotHistory('clear-draw');
    set((state) =>
      withActiveDoc(state, (doc) => ({ ...doc, strokes: [], updatedAt: Date.now() })),
    );
    get().showToast('Drawings cleared');
  },
  addReaction: (x, y, emoji, anchor) => {
    const reaction: CanvasReaction = { id: uid(), x, y, emoji, at: Date.now(), ...anchor };
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        reactions: [...(doc.reactions ?? []), reaction],
        updatedAt: Date.now(),
      })),
    );
  },
  updateReaction: (id, patch) => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        reactions: (doc.reactions ?? []).map((reaction) => (reaction.id === id ? { ...reaction, ...patch } : reaction)),
        updatedAt: Date.now(),
      })),
    );
  },
  removeReaction: (id) => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        reactions: (doc.reactions ?? []).filter((reaction) => reaction.id !== id),
        updatedAt: Date.now(),
      })),
    );
  },
  addComment: (x, y, text, anchor) => {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const comment: CanvasComment = {
      id: uid(),
      x,
      y,
      text: trimmed.slice(0, 500),
      author: 'You',
      at: Date.now(),
      ...anchor,
    };
    set((state) =>
      withActiveDoc(state, (doc) => ({ ...doc, comments: [...(doc.comments ?? []), comment] })),
    );
    get().showToast('Comment added');
    return comment.id;
  },

  moveComment: (id, patch) => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        comments: (doc.comments ?? []).map((comment) => (comment.id === id ? { ...comment, ...patch } : comment)),
        updatedAt: Date.now(),
      })),
    );
  },

  resolveComment: (id) => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        comments: (doc.comments ?? []).map((comment) =>
          comment.id === id ? { ...comment, resolved: !comment.resolved } : comment,
        ),
      })),
    );
  },

  deleteComment: (id) => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        comments: (doc.comments ?? []).filter((comment) => comment.id !== id),
      })),
    );
    get().showToast('Comment deleted');
  },

  applyRemoteDoc: (doc) =>
    set((state) => ({
      docs: { ...state.docs, [doc.id]: doc },
      order: state.order.includes(doc.id) ? state.order : [doc.id, ...state.order],
      activeId: doc.id,
      view: 'editor',
      selectedId: null,
      selectedIds: [],
      savedAt: Date.now(),
    })),

  openDetails: (id, explicit = false) => {
    const settings = useSettingsStore.getState();
    if (explicit) settings.setDetailsAutoOpen(true);
    // After the panel was dismissed, clicking or typing in a node only selects it; the expand button brings the panel back.
    const show = explicit || settings.detailsAutoOpen;
    set({ detailNodeId: show ? id : null, selectedId: id, selectedIds: [id] });
  },
  closeDetails: () => set({ detailNodeId: null }),
  setDragging: (dragging) => set({ dragging }),
  markNodesTouched: (ids) =>
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        nodes: doc.nodes.map((node) =>
          ids.includes(node.id) && node.data.kind === 'model'
            ? { ...node, data: { ...node.data, touched: true } }
            : node,
        ),
      })),
    ),
  setSelected: (id) =>
    set((state) => {
      const next = id ? [id] : [];
      if (state.selectedId === id && state.selectedIds.length === next.length) return {};
      return { selectedId: id, selectedIds: next };
    }),
  setSelectedIds: (ids) =>
    set((state) => {
      if (
        state.selectedIds.length === ids.length &&
        state.selectedIds.every((id, index) => id === ids[index])
      ) {
        return {};
      }
      return { selectedIds: ids, selectedId: ids.length ? ids[0] : null };
    }),
  setShowPromo: (show) => set({ showPromo: show }),

  snapshotHistory: (key) => {
    const doc = activeDoc(get());
    if (!doc) return;
    const now = Date.now();
    if (key && key === lastHistoryKey && now - lastHistoryAt < 700) {
      lastHistoryAt = now;
      return;
    }
    lastHistoryKey = key ?? null;
    lastHistoryAt = now;
    set((state) => ({
      historyPast: [...state.historyPast.slice(-29), cloneDoc(doc)],
      historyFuture: [],
    }));
  },

  undo: (keepSelection = false) => {
    const state = get();
    const doc = activeDoc(state);
    const previous = state.historyPast[state.historyPast.length - 1];
    if (!doc || !previous) return;
    set({
      docs: { ...state.docs, [doc.id]: { ...cloneDoc(previous), updatedAt: Date.now() } },
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [cloneDoc(doc), ...state.historyFuture].slice(0, 30),
      selectedId: keepSelection ? state.selectedId : null,
      selectedIds: keepSelection ? state.selectedIds : [],
      detailNodeId: keepSelection ? state.detailNodeId : null,
      savedAt: Date.now(),
    });
  },

  redo: (keepSelection = false) => {
    const state = get();
    const doc = activeDoc(state);
    const next = state.historyFuture[0];
    if (!doc || !next) return;
    set({
      docs: { ...state.docs, [doc.id]: { ...cloneDoc(next), updatedAt: Date.now() } },
      historyPast: [...state.historyPast, cloneDoc(doc)].slice(-30),
      historyFuture: state.historyFuture.slice(1),
      selectedId: keepSelection ? state.selectedId : null,
      selectedIds: keepSelection ? state.selectedIds : [],
      detailNodeId: keepSelection ? state.detailNodeId : null,
      savedAt: Date.now(),
    });
  },

  copySelection: () => {
    const state = get();
    const doc = activeDoc(state);
    if (!doc) return;
    const ids = state.selectedIds.length
      ? state.selectedIds
      : state.selectedId
        ? [state.selectedId]
        : [];
    if (!ids.length) {
      state.showToast('Select a node to copy');
      return;
    }
    const nodes = doc.nodes.filter((node) => ids.includes(node.id)).map((node) => cloneDoc({ ...doc, nodes: [node], edges: [] }).nodes[0]);
    const edges = doc.edges.filter((edge) => ids.includes(edge.source) && ids.includes(edge.target));
    set({ clipboard: { nodes, edges } });
    state.showToast(`${nodes.length} node${nodes.length === 1 ? '' : 's'} copied`);
  },

  pasteClipboard: () => {
    const state = get();
    const doc = activeDoc(state);
    if (!doc || !state.clipboard?.nodes.length) return;
    state.snapshotHistory();
    const idMap = new Map<string, string>();
    const nodes = state.clipboard.nodes.map((node) => {
      const nextId = uid();
      idMap.set(node.id, nextId);
      return {
        ...cloneDoc({ ...doc, nodes: [node], edges: [] }).nodes[0],
        id: nextId,
        selected: true,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
      };
    });
    const edges = state.clipboard.edges
      .map((edge) => {
        const sourceId = idMap.get(edge.source);
        const targetId = idMap.get(edge.target);
        if (!sourceId || !targetId) return null;
        return { ...edge, id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId };
      })
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
    set((current) => ({
      docs: {
        ...current.docs,
        [doc.id]: {
          ...doc,
          nodes: [...doc.nodes, ...nodes],
          edges: [...doc.edges, ...edges],
          updatedAt: Date.now(),
        },
      },
      selectedId: nodes[0]?.id ?? null,
      selectedIds: nodes.map((node) => node.id),
      savedAt: Date.now(),
    }));
    state.showToast(`${nodes.length} node${nodes.length === 1 ? '' : 's'} pasted`);
  },

  onNodesChange: (changes) => {
    if (changes.some((change) => change.type === 'remove')) get().snapshotHistory();
    set((state) => {
      const doc = activeDoc(state);
      if (!doc) return {};
      const nodes = applyNodeChanges(changes, doc.nodes) as CanvasNode[];
      const selectedId =
        state.selectedId && !nodes.some((node) => node.id === state.selectedId)
          ? null
          : state.selectedId;
      return {
        docs: {
          ...state.docs,
          [doc.id]: { ...doc, nodes, updatedAt: Date.now() },
        },
        selectedId,
        savedAt: Date.now(),
      };
    });
  },

  onEdgesChange: (changes) => {
    if (changes.some((change) => change.type === 'remove')) get().snapshotHistory();
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        edges: applyEdgeChanges(changes, doc.edges),
      })),
    );
  },

  onConnect: (connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    if (source === target) {
      get().showToast('A node cannot feed itself');
      return;
    }
    const doc = activeDoc(get());
    if (!doc) return;
    if (doc.edges.some((edge) => edge.source === source && edge.target === target)) {
      get().showToast('These nodes are already connected');
      return;
    }
    if (createsCycle(doc, source, target)) {
      get().showToast('That connection would create a cycle');
      return;
    }
    get().snapshotHistory();
    const edge = {
      ...makeEdge(source, target),
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    };
    set((state) =>
      withActiveDoc(state, (current) => ({
        ...current,
        edges: addEdge(edge, current.edges),
      })),
    );
  },

  disconnectNodes: (source, target) => {
    const doc = activeDoc(get());
    if (!doc) return;
    const matches = doc.edges.filter((edge) => edge.source === source && edge.target === target);
    if (!matches.length) return;
    get().snapshotHistory('disconnect');
    set((state) =>
      withActiveDoc(state, (current) => ({
        ...current,
        edges: current.edges.filter(
          (edge) => !(edge.source === source && edge.target === target),
        ),
      })),
    );
  },

  addNode: (kind, at, modelId, dataPatch, select) => {
    get().snapshotHistory();
    const state = get();
    const doc = activeDoc(state);
    if (!doc) return;
    const meta = NODE_META[kind];
    const id = uid();
    const offset = doc.nodes.length;
    const model = modelId ? MODEL_BY_ID[modelId] : MODELS[0];
    const data: CanvasNodeData = {
      kind,
      title: kind === 'model' ? model.name : kind === 'reference' ? 'Image' : meta.label,
      status: 'idle',
      ...dataPatch,
    };
    if (kind === 'prompt') data.prompt = '';
    if (kind === 'model') {
      data.model = model.id;
      data.aspect = '1:1';
      data.duration = 4;
      data.resolution = data.resolution ?? model.resolutions?.[0] ?? (model.family === 'video' ? '720p' : '1k');
      data.batch = data.batch ?? 1;
      data.generateAudio = data.generateAudio ?? (model.family === 'video');
      data.touched = false;
    }
    if (kind === 'reference') data.label = dataPatch?.label ?? 'ANCHOR / 01';
    if (kind === 'note') data.note = dataPatch?.note ?? '';
    if (kind === 'shape') data.shape = dataPatch?.shape ?? 'rect';
    if (kind === 'page') data.title = data.title ?? 'Page';
    if (kind === 'table' && !data.table) {
      data.table = {
        columns: ['Beat', 'Shot', 'Note'],
        rows: [
          ['01', 'Wide', ''],
          ['02', 'Close', ''],
          ['03', 'Cutaway', ''],
        ],
      };
    }
    const position = at ?? {
      x: 280 + (offset % 4) * 64,
      y: 180 + (offset % 3) * 84,
    };
    const node: CanvasNode = {
      id,
      type: 'canvas',
      position,
      data,
    };
    set((current) =>
      withActiveDoc(current, (currentDoc) => ({
        ...currentDoc,
        nodes: [...currentDoc.nodes, node],
      })),
    );
    if (select !== false) set({ selectedId: id });
    return id;
  },

  duplicateNode: (id) => {
    get().snapshotHistory();
    const doc = activeDoc(get());
    const source = doc?.nodes.find((node) => node.id === id);
    if (!doc || !source) return;
    const copy: CanvasNode = {
      ...source,
      id: uid(),
      position: { x: source.position.x + 48, y: source.position.y + 48 },
      data: { ...source.data, status: source.data.status === 'running' ? 'idle' : source.data.status },
    };
    set((state) =>
      withActiveDoc(state, (current) => ({
        ...current,
        nodes: [...current.nodes, copy],
      })),
    );
    set({ selectedId: copy.id });
  },

  deleteNode: (id) => {
    get().snapshotHistory();
    const doc = activeDoc(get());
    const childIds = new Set(
      doc?.nodes.filter((node) => node.parentId === id).map((node) => node.id) ?? [],
    );
    set((state) =>
      withActiveDoc(state, (current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id && !childIds.has(node.id)),
        edges: current.edges.filter(
          (edge) =>
            edge.source !== id &&
            edge.target !== id &&
            !childIds.has(edge.source) &&
            !childIds.has(edge.target),
        ),
      })),
    );
    set((state) => ({
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedIds: state.selectedIds.filter((item) => item !== id),
    }));
  },

  groupSelection: () => {
    const state = get();
    const doc = activeDoc(state);
    if (!doc) return;
    const members = doc.nodes.filter(
      (node) => state.selectedIds.includes(node.id) && node.data.kind !== 'group',
    );
    if (members.length < 2) {
      state.showToast('Select at least two nodes to group');
      return;
    }
    state.snapshotHistory();
    const paddingX = 42;
    const paddingY = 66;
    const minX = Math.min(...members.map((node) => node.position.x));
    const minY = Math.min(...members.map((node) => node.position.y));
    const maxX = Math.max(
      ...members.map((node) => node.position.x + (node.measured?.width ?? 282)),
    );
    const maxY = Math.max(
      ...members.map((node) => node.position.y + (node.measured?.height ?? 320)),
    );
    const groupX = minX - paddingX;
    const groupY = minY - paddingY;
    const groupId = uid();
    const groupNode: CanvasNode = {
      id: groupId,
      type: 'canvas',
      position: { x: groupX, y: groupY },
      data: { kind: 'group', title: 'Group', status: 'idle' },
      style: {
        width: maxX - minX + paddingX * 2,
        height: maxY - minY + paddingY + 34,
      },
      zIndex: -1,
      selectable: true,
      draggable: true,
    };
    const memberIds = new Set(members.map((node) => node.id));
    const nodes = doc.nodes.map((node) =>
      memberIds.has(node.id)
        ? {
            ...node,
            parentId: groupId,
            extent: 'parent' as const,
            position: { x: node.position.x - groupX, y: node.position.y - groupY },
          }
        : node,
    );
    set((current) => ({
      docs: {
        ...current.docs,
        [doc.id]: {
          ...doc,
          nodes: [groupNode, ...nodes],
          updatedAt: Date.now(),
        },
      },
      selectedIds: members.map((node) => node.id),
      selectedId: members[0]?.id ?? null,
      savedAt: Date.now(),
    }));
    state.showToast(`Grouped ${members.length} nodes`);
  },

  ungroupSelection: () => {
    const state = get();
    const doc = activeDoc(state);
    if (!doc) return;
    const groups = doc.nodes.filter(
      (node) => state.selectedIds.includes(node.id) && node.data.kind === 'group',
    );
    if (!groups.length) {
      state.showToast('Select a group to ungroup');
      return;
    }
    state.snapshotHistory();
    let nodes = [...doc.nodes];
    const childIds: string[] = [];
    for (const group of groups) {
      const children = nodes.filter((node) => node.parentId === group.id);
      childIds.push(...children.map((child) => child.id));
      nodes = nodes
        .map((node) =>
          node.parentId === group.id
            ? {
                ...node,
                parentId: undefined,
                extent: undefined,
                position: {
                  x: group.position.x + node.position.x,
                  y: group.position.y + node.position.y,
                },
              }
            : node,
        )
        .filter((node) => node.id !== group.id);
    }
    set((current) => ({
      docs: {
        ...current.docs,
        [doc.id]: { ...doc, nodes, updatedAt: Date.now() },
      },
      selectedIds: childIds,
      selectedId: childIds[0] ?? null,
      savedAt: Date.now(),
    }));
    state.showToast('Ungrouped');
  },

  updateNodeData: (id, patch) => {
    get().snapshotHistory(
      patch.prompt !== undefined ? undefined : `data:${id}:${Object.keys(patch).join(',')}`,
    );
    set((state) =>
      withActiveDoc(state, (doc) => {
        const current = doc.nodes.find((node) => node.id === id);
        const rename =
          current?.data.kind === 'reference' && patch.label !== undefined
            ? {
                from: mentionHandle(current.data.label ?? current.data.title ?? ''),
                to: mentionHandle(patch.label),
              }
            : null;
        return {
          ...doc,
          nodes: doc.nodes.map((node) => {
            if (node.id === id) {
              const next = { ...node.data, ...patch };
              if (node.data.kind === 'reference' && patch.label !== undefined) {
                const previous = mentionHandle(node.data.label ?? node.data.title ?? '');
                next.mentionAliases = [...new Set([...(node.data.mentionAliases ?? []), previous])];
              }
              if (node.data.kind === 'model') next.touched = true;
              return { ...node, data: next };
            }
            if (rename && rename.from !== rename.to && node.data.kind === 'model' && node.data.prompt) {
              const aliases = [...new Set([...(current?.data.mentionAliases ?? []), rename.from])];
              let prompt = node.data.prompt;
              for (const alias of aliases) {
                if (!alias || alias === rename.to) continue;
                prompt = prompt.replace(new RegExp(`@${escapeRegExp(alias)}(?![\\w-])`, 'gi'), `@${rename.to}`);
              }
              if (prompt !== node.data.prompt) {
                return { ...node, data: { ...node.data, prompt } };
              }
            }
            return node;
          }),
        };
      }),
    );
  },

  reconcilePrompts: () => {
    const state = get();
    const doc = activeDoc(state);
    if (!doc) return;
    const assetNames = new Map(
      state.assets.map((asset) => [asset.url, asset.name.replace(/\.[^.]+$/, '')]),
    );
    const replacements = new Map<string, string>();
    for (const node of doc.nodes) {
      if (node.data.kind !== 'reference') continue;
      const current = mentionHandle(node.data.label ?? node.data.title ?? '');
      const aliases = new Set<string>(node.data.mentionAliases ?? []);
      const assetName = node.data.previewUrl ? assetNames.get(node.data.previewUrl) : undefined;
      if (assetName && !/^(image|video|thumbnail|asset)$/i.test(assetName)) aliases.add(mentionHandle(assetName));
      for (const alias of aliases) {
        if (alias && alias !== current) replacements.set(alias, current);
      }
    }
    if (!replacements.size) return;
    let changed = false;
    const nodes = doc.nodes.map((node) => {
      if (node.data.kind !== 'model' || !node.data.prompt) return node;
      let prompt = node.data.prompt;
      for (const [alias, current] of replacements) {
        prompt = prompt.replace(new RegExp(`@${escapeRegExp(alias)}(?![\\w-])`, 'gi'), `@${current}`);
      }
      if (prompt === node.data.prompt) return node;
      changed = true;
      return { ...node, data: { ...node.data, prompt } };
    });
    if (!changed) return;
    set((currentState) =>
      withActiveDoc(currentState, (active) => ({ ...active, nodes })),
    );
  },

  run: async (target) => {
    const state = get();
    if (state.running) {
      state.showToast('A run is already in progress');
      return;
    }
    const doc = activeDoc(state);
    if (!doc) return;
    let starts: string[] = [];
    if (target === 'all') {
      starts = doc.nodes.filter((node) => node.data.kind === 'model').map((node) => node.id);
    } else if (state.selectedId) {
      const selected = doc.nodes.find((node) => node.id === state.selectedId);
      if (!selected) return;
      starts = selected.data.kind === 'model' ? [selected.id] : downstreamModels(doc, [selected.id]);
    }
    if (!starts.length) {
      state.showToast(target === 'selected' ? 'Select a model node to run' : 'Add a model node first');
      return;
    }
    const ids = upstreamIds(doc, starts);
    const order = topoSort(doc, ids);
    if (order.length !== ids.size) {
      state.showToast('This graph has a cycle. Break the loop first.');
      return;
    }
    const modelNodes = order
      .map((id) => doc.nodes.find((node) => node.id === id))
      .filter((node): node is CanvasNode => Boolean(node) && node!.data.kind === 'model');
    const settings = useSettingsStore.getState();
    if (STATIC_DEMO) state.showToast('Demo only: this draws placeholder artwork. Run locally for real generations.');
    if (settings.useComfy && settings.connection !== 'online') {
      state.showToast('ComfyUI is not connected. Open the connection panel or switch to demo mode.');
      settings.openConnection();
      return;
    }
    const canvasId = doc.id;
    const updateRunNode = (id: string, patch: Partial<CanvasNodeData>) =>
      set((state) => withDoc(state, canvasId, (currentDoc) => ({
        ...currentDoc,
        nodes: currentDoc.nodes.map((node) => node.id === id
          ? { ...node, data: { ...node.data, ...patch, ...(node.data.kind === 'model' ? { touched: true } : {}) } }
          : node),
      })));
    const provider = getRuntimeProvider();
    activeProviders.add(provider);
    runningCanvasId = canvasId;
    const token = ++runToken;
    set({ running: true, runLabel: `0 / ${modelNodes.length} renders` });
    for (const node of modelNodes) {
      const modelId = node.data.model;
      if (!modelId) continue;
      set((current) =>
        withDoc(current, canvasId, (currentDoc) => ({
          ...currentDoc,
          nodes: currentDoc.nodes.map((item) =>
            item.id === node.id
              ? { ...item, data: { ...item.data, status: 'queued', error: undefined } }
              : item,
          ),
        })),
      );
    }

    let completed = 0;
    let lastError: string | null = null;
    const modelIds = new Set(modelNodes.map((node) => node.id));
    const dependencies = new Map<string, Set<string>>();
    for (const node of modelNodes) {
      dependencies.set(
        node.id,
        new Set(
          doc.edges
            .filter((edge) => edge.target === node.id && modelIds.has(edge.source))
            .map((edge) => edge.source),
        ),
      );
    }
    const completedIds = new Set<string>();
    const failedIds = new Set<string>();
    const pending = new Map(modelNodes.map((node) => [node.id, node]));

    const executeNode = async (nodeId: string): Promise<boolean> => {
      if (token !== runToken) return false;
      const live = get().docs[canvasId];
      if (!live) return false;
      const current = live.nodes.find((item) => item.id === nodeId);
      if (!current) return false;
      const deps = dependencies.get(nodeId) ?? new Set<string>();
      if ([...deps].some((dep) => failedIds.has(dep))) {
        lastError = 'An upstream node failed.';
        updateRunNode(nodeId, { status: 'error', error: lastError });
        get().showToast(lastError);
        return false;
      }
      const model = MODEL_BY_ID[current.data.model ?? 'sd-turbo'] ?? MODELS[0];
      // A local model whose files ComfyUI cannot see is not enabled yet: say what to install instead of failing mid-run.
      if (model.install && !STATIC_DEMO && useSettingsStore.getState().installed[model.id] === false) {
        lastError = `${model.name} is not installed yet.`;
        updateRunNode(current.id, { status: 'error', error: lastError });
        useSettingsStore.getState().openInstall(model.id);
        return false;
      }
      const incoming = live.edges
        .filter((edge) => edge.target === current.id)
        .map((edge) => live.nodes.find((item) => item.id === edge.source))
        .filter((item): item is CanvasNode => Boolean(item));
      const incomingText = incoming
        .filter((item) => item.data.kind === 'prompt')
        .map((item) => item.data.prompt?.trim())
        .filter(Boolean)
        .join('\n\n');
      const prompt = [current.data.prompt?.trim(), incomingText].filter(Boolean).join('\n\n');
      const hasReference = incoming.some(
        (item) => item.data.kind === 'reference' || item.data.kind === 'model',
      );
      const inputImageUrl =
        incoming.find(
          (item) => item.data.outputKind === 'image' && item.data.outputUrl,
        )?.data.outputUrl ??
        incoming.find(
          (item) =>
            item.data.kind === 'reference' &&
            item.data.previewUrl &&
            item.data.mediaKind !== 'video',
        )?.data.previewUrl;
      if (!prompt && !hasReference) {
        lastError = 'Connect a prompt or reference first.';
        updateRunNode(current.id, { status: 'error', error: lastError });
        return false;
      }

      updateRunNode(current.id, { status: 'running', error: undefined });
      let result;
      try {
        result = await provider.generate({
          model,
          prompt: prompt || current.data.title,
          strength: current.data.strength,
          seed: current.data.seed,   // unset means a fresh random seed per run; a fixed seed would make ComfyUI return its cached image
          aspect: current.data.aspect,
          duration: current.data.duration,
          resolution: current.data.resolution,
          batch: current.data.batch,
          generateAudio: current.data.generateAudio,
          referenceCount: incoming.length,
          inputImageUrl,
          runIndex: modelNodes.findIndex((node) => node.id === nodeId),
          onProgress: (progress) => {
            if (token !== runToken) return;
            set({ runLabel: `${completed} / ${modelNodes.length} · ${progress.detail ?? progress.stage}` });
          },
        });
      } catch (error) {
        if (token !== runToken) return false;
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        updateRunNode(current.id, { status: 'error', error: message });
        get().showToast(message);
        return false;
      }
      if (token !== runToken) return false;

      const completedNode = get().docs[canvasId]?.nodes.find((node) => node.id === current.id);
      if (!completedNode) return false;

      // Every render stays in the strip, newest first, including selections made while rendering.
      const seenUrls = new Set<string>();
      const renderHistory = [
        { url: result.url, kind: result.kind, at: Date.now(), seed: result.seed },
        ...(result.alternates ?? []).map((item) => ({ url: item.url, kind: item.kind, at: Date.now() - 1, seed: item.seed })),
        ...(completedNode.data.outputUrl
          ? [{ url: completedNode.data.outputUrl, kind: completedNode.data.outputKind ?? result.kind, at: completedNode.data.lastRun ?? Date.now(), seed: completedNode.data.outputSeed }]
          : []),
        ...(completedNode.data.outputHistory ?? []),
      ]
        .filter((item) => !seenUrls.has(item.url) && seenUrls.add(item.url))
        .slice(0, 12);
      updateRunNode(current.id, {
        status: 'done',
        outputUrl: result.url,
        outputKind: result.kind,
        lastRun: Date.now(),
        outputHistory: renderHistory,
        outputSeed: result.seed,
        error: undefined,
      });
      get().addAsset({
        url: result.url,
        kind: result.kind === 'video' ? 'video' : 'image',
        name: `${model.name} · ${completedNode.data.title}`,
        source: 'generated',
      });
      // the run time of a real render, shown on the Generate button and the Models page
      if (result.provider !== 'mock') {
        useSettingsStore.getState().recordRunTime(model.id, result.latencyMs / 1000 / (1 + (result.alternates?.length ?? 0)));
      }
      completed += 1;
      set({ runLabel: `${completed} / ${modelNodes.length} renders` });
      return true;
    };

    while (pending.size) {
      if (token !== runToken) return;
      const ready = [...pending.values()].filter((node) =>
        [...(dependencies.get(node.id) ?? [])].every(
          (dep) => completedIds.has(dep) || failedIds.has(dep),
        ),
      );
      if (!ready.length) {
        lastError = 'Could not resolve the graph order.';
        break;
      }
      const batch = ready.slice(0, MAX_PARALLEL_RUNS);
      for (const node of batch) pending.delete(node.id);
      const results = await Promise.all(batch.map((node) => executeNode(node.id)));
      batch.forEach((node, index) => {
        if (results[index]) completedIds.add(node.id);
        else failedIds.add(node.id);
      });
    }

    activeProviders.delete(provider);
    if (token !== runToken) return;
    runningCanvasId = null;
    set({ running: false, runLabel: '' });
    if (completed > 0) get().saveVersion('Render complete', true, canvasId);
    get().showToast(
      completed === 0
        ? lastError ?? 'Nothing rendered — check your prompts'
        : `${completed} render${completed === 1 ? '' : 's'} complete${failedIds.size ? ` · ${failedIds.size} failed` : ''}`,
    );
  },

  cancelRun: () => {
    const canvasId = runningCanvasId;
    runningCanvasId = null;
    for (const active of activeProviders) {
      void active.cancel?.().catch(() => undefined);
    }
    activeProviders.clear();
    runToken += 1;
    if (canvasId) set((state) =>
      withDoc(state, canvasId, (doc) => ({
        ...doc,
        nodes: doc.nodes.map((node) =>
          node.data.status === 'running' || node.data.status === 'queued'
            ? { ...node, data: { ...node.data, status: 'idle' } }
            : node,
        ),
      })),
    );
    set({ running: false, runLabel: '' });
    get().showToast('Run cancelled');
  },

  clearOutputs: () => {
    set((state) =>
      withActiveDoc(state, (doc) => ({
        ...doc,
        nodes: doc.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            outputUrl: undefined,
            outputKind: undefined,
            status: 'idle',
            error: undefined,
            lastRun: undefined,
            outputHistory: undefined,
          },
        })),
      })),
    );
    get().showToast('Outputs cleared');
  },

  saveNow: () => {
    set({ savedAt: Date.now() });
    get().showToast('Saved to this browser');
  },

  showToast: (message) => {
    set({ toast: message });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },

  resetWorkspace: () => {
    const fresh = initialExampleDocs();
    set({
      docs: Object.fromEntries(fresh.map((doc) => [doc.id, doc])),
      order: fresh.map((doc) => doc.id),
      templates: [],
      assets: [],
      versions: [],
      activeId: null,
      selectedId: null,
      selectedIds: [],
      historyPast: [],
      historyFuture: [],
      view: 'dashboard',
      tab: 'canvases',
      showPromo: true,
      savedAt: Date.now(),
    });
    get().showToast('Workspace reset');
  },
}));

export function selectActiveDoc(state: WorkspaceState): CanvasDoc | null {
  return activeDoc(state);
}

export { STORAGE_KEY };
