import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { anchoredPoint, nodeAt, nodeBoxes, perimeterSlot, reactionPoint } from '../lib/anchors';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  ViewportPortal,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FolderOpen,
  Frame,
  History as HistoryIcon,
  ImagePlus,
  LayoutTemplate,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageCircle,
  Minus,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Redo2,
  Trash2,
  Ungroup,
  Undo2,
  X,
  GripHorizontal,
  Lightbulb,
} from 'lucide-react';
import { Logo } from './Logo';
import { AddNodePanel } from './AddNodePanel';
import { AssetsPanel } from './AssetsPanel';
import { VersionPanel } from './VersionPanel';
import { PromptGuide } from './PromptGuide';
import { Inspector } from './Inspector';
import { GenerationPanel } from './GenerationPanel';
import { CanvasNodeView } from './CanvasNodeView';
import { CanvasDock, type DockTool } from './CanvasDock';
import { ConnectMenu, type ConnectOptionId } from './ConnectMenu';
import { CanvasContextMenu, type ContextCreateId } from './CanvasContextMenu';
import { ProviderBadge } from './ProviderBadge';
import { useCanvasStore } from '../store/useCanvasStore';
import { useRoomStore } from '../store/useRoomStore';
import { useThemeStore } from '../store/useThemeStore';
import { THEME_LABEL, ThemeIcon } from './ThemeToggle';
import { useSettingsStore } from '../store/useSettingsStore';
import { ACCENTS, getAccent } from '../lib/theme';
import { fileToNodeMedia } from '../lib/media';
import type { CanvasAsset, CanvasNodeData, CanvasStroke, ModelId, NodeKind, ShapeKind } from '../types';

const nodeTypes: NodeTypes = { canvas: CanvasNodeView };

/** Hearts in every colour, plus the quick reactions. */
const REACTION_EMOJI = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🔥', '👍', '👏', '😂', '😮', '✨', '👀', '💯'];

const defaultEdgeOptions = {
  type: 'default',
  style: { stroke: 'rgba(167,139,250,.72)', strokeWidth: 1.5 },
};

function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(60, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function strokePath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  return points.reduce(
    (path, point, index) => `${path}${index === 0 ? 'M' : 'L'} ${point.x} ${point.y} `,
    '',
  );
}



interface ChatMessage {
  id: string;
  author: string;
  text: string;
  self?: boolean;
}

function EditorCanvas() {
  const doc = useCanvasStore((state) => (state.activeId ? state.docs[state.activeId] : null));
  const selectedId = useCanvasStore((state) => state.selectedId);
  const setSelected = useCanvasStore((state) => state.setSelected);
  const setSelectedIds = useCanvasStore((state) => state.setSelectedIds);
  const detailNodeId = useCanvasStore((state) => state.detailNodeId);
  const openDetails = useCanvasStore((state) => state.openDetails);
  const dragging = useCanvasStore((state) => state.dragging);
  const setDragging = useCanvasStore((state) => state.setDragging);
  const markNodesTouched = useCanvasStore((state) => state.markNodesTouched);
  const closeDetails = useCanvasStore((state) => state.closeDetails);
  const goPageBack = useCanvasStore((state) => state.goPageBack);
  const pageParentTitle = useCanvasStore((state) => {
    const active = state.activeId ? state.docs[state.activeId] : null;
    return active?.pageParentId ? state.docs[active.pageParentId]?.title ?? 'Canvas' : null;
  });
  const snapshotHistory = useCanvasStore((state) => state.snapshotHistory);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const copySelection = useCanvasStore((state) => state.copySelection);
  const pasteClipboard = useCanvasStore((state) => state.pasteClipboard);
  const canUndo = useCanvasStore((state) => state.historyPast.length > 0);
  const canRedo = useCanvasStore((state) => state.historyFuture.length > 0);
  const selectedIds = useCanvasStore((state) => state.selectedIds);
  const groupSelection = useCanvasStore((state) => state.groupSelection);
  const ungroupSelection = useCanvasStore((state) => state.ungroupSelection);
  const goDashboard = useCanvasStore((state) => state.goDashboard);
  const renameCanvas = useCanvasStore((state) => state.renameCanvas);
  const duplicateCanvas = useCanvasStore((state) => state.duplicateCanvas);
  const deleteCanvas = useCanvasStore((state) => state.deleteCanvas);
  const saveAsTemplate = useCanvasStore((state) => state.saveAsTemplate);
  const onNodesChange = useCanvasStore((state) => state.onNodesChange);
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const addNode = useCanvasStore((state) => state.addNode);
  const addAsset = useCanvasStore((state) => state.addAsset);
  const run = useCanvasStore((state) => state.run);
  const cancelRun = useCanvasStore((state) => state.cancelRun);
  const running = useCanvasStore((state) => state.running);
  const roomId = useRoomStore((state) => state.roomId);
  const peers = useRoomStore((state) => state.peers);
  const roomConnected = useRoomStore((state) => state.connected);
  const joinRoom = useRoomStore((state) => state.join);
  const roomMessages = useRoomStore((state) => state.messages);
  const sendRoomChat = useRoomStore((state) => state.sendChat);
  const addComment = useCanvasStore((state) => state.addComment);
  const addStroke = useCanvasStore((state) => state.addStroke);
  const clearStrokes = useCanvasStore((state) => state.clearStrokes);
  const removeStroke = useCanvasStore((state) => state.removeStroke);
  const addReaction = useCanvasStore((state) => state.addReaction);
  const removeReaction = useCanvasStore((state) => state.removeReaction);
  const updateReaction = useCanvasStore((state) => state.updateReaction);
  const moveComment = useCanvasStore((state) => state.moveComment);
  const resolveComment = useCanvasStore((state) => state.resolveComment);
  const deleteComment = useCanvasStore((state) => state.deleteComment);
  const saveNow = useCanvasStore((state) => state.saveNow);
  const showToast = useCanvasStore((state) => state.showToast);

  const stageRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, setCenter, screenToFlowPosition } = useReactFlow();
  const { x: viewX, y: viewY, zoom } = useViewport();
  const accentId = useSettingsStore((state) => state.accent);
  const accent = getAccent(accentId);
  const setAccent = useSettingsStore((state) => state.setAccent);
  const connection = useSettingsStore((state) => state.connection);
  const useComfy = useSettingsStore((state) => state.useComfy);
  const openConnection = useSettingsStore((state) => state.openConnection);
  const themePreference = useThemeStore((state) => state.preference);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const ignoreSelectionRef = useRef(false);
  const renderedEdges = useMemo(
    () =>
      (doc?.edges ?? []).map((edge) => ({
        ...edge,
        type: 'default',
        animated: false,
        style: { stroke: accent.soft, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: accent.soft, width: 16, height: 16 },
      })),
    [doc?.edges, accent],
  );

  // Clearing selection from a drop/add can be undone by React Flow emitting a
  // stale selection change for the node that was selected before. Ignore those
  // events briefly while the canvas settles (the timer is a fallback for when
  // no further selection event arrives).
  const clearSelection = () => {
    ignoreSelectionRef.current = true;
    const current = useCanvasStore.getState();
    const ids = current.selectedIds.length
      ? current.selectedIds
      : current.selectedId
        ? [current.selectedId]
        : [];
    if (ids.length) {
      onNodesChange(ids.map((id) => ({ type: 'select' as const, id, selected: false })));
    }
    setSelected(null);
    closeDetails();
    window.setTimeout(() => {
      ignoreSelectionRef.current = false;
    }, 250);
  };

  const selectTool = (next: DockTool) => {
    const resolved = next === tool && next !== 'select' ? 'select' : next;
    if (resolved === 'reaction') {
      // Opens the palette: pick an emoji and it goes on the selected nodes, or arms the tool for a click on the canvas.
      setTool('reaction');
      setCommentMode(false);
      setCommentDraft(null);
      setShapeMenuOpen(false);
      setReactionPaletteOpen(true);
      return;
    }
    setReactionPaletteOpen(false);
    setTool(resolved);
    setCommentMode(resolved === 'comment');
    if (resolved !== 'comment') setCommentDraft(null);
    setShapeMenuOpen(false);
  };

  const pickReaction = (emoji: string) => {
    setReactionEmoji(emoji);
    setReactionPaletteOpen(false);
    const live = useCanvasStore.getState();
    const liveDoc = live.activeId ? live.docs[live.activeId] : null;
    const ids = [...new Set([...live.selectedIds, ...(live.selectedId ? [live.selectedId] : [])])];
    const boxes = liveDoc ? nodeBoxes(liveDoc.nodes) : null;
    let placed = 0;
    for (const id of ids) {
      const box = boxes?.get(id);
      if (!liveDoc || !box) continue;
      const taken = (liveDoc.reactions ?? []).filter((reaction) => reaction.nodeId === id).length;
      const slot = perimeterSlot(box, taken);
      addReaction(box.x + slot.dx, box.y + slot.dy, emoji, { nodeId: id, ...slot });
      placed += 1;
    }
    if (placed) setTool('select');
  };

  const insertAnnotation = (
    kind: NodeKind,
    patch: Partial<CanvasNodeData>,
    message: string,
  ) => {
    const liveDoc = (() => {
      const live = useCanvasStore.getState();
      return live.activeId ? live.docs[live.activeId] ?? null : null;
    })();
    const rect = stageRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 420, y: 320 };
    const halfWidth = kind === 'table' ? 186 : 130;
    const bounds = rect
      ? {
          left: screenToFlowPosition({ x: rect.left + 72, y: rect.top + 96 }).x,
          top: screenToFlowPosition({ x: rect.left + 72, y: rect.top + 96 }).y,
          right: screenToFlowPosition({ x: rect.right - 72, y: rect.bottom - 128 }).x,
          bottom: screenToFlowPosition({ x: rect.right - 72, y: rect.bottom - 128 }).y,
        }
      : { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    const offsets = [
      [0, 0],
      [420, 0],
      [-470, 0],
      [0, -190],
      [420, -190],
      [-470, -190],
      [0, 210],
      [760, 0],
    ];
    let spot = center;
    for (const [dx, dy] of offsets) {
      const candidate = { x: center.x + dx, y: center.y + dy };
      const fits =
        candidate.x - halfWidth >= bounds.left &&
        candidate.x + halfWidth <= bounds.right &&
        candidate.y - 100 >= bounds.top &&
        candidate.y + 150 <= bounds.bottom;
      if (!fits) continue;
      const occupied = (liveDoc?.nodes ?? []).some(
        (node) =>
          Math.abs(node.position.x - (candidate.x - 140)) < 330 &&
          Math.abs(node.position.y - (candidate.y - 110)) < 240,
      );
      if (!occupied) {
        spot = candidate;
        break;
      }
    }
    const at = { x: spot.x - halfWidth, y: spot.y - 100 };
    clearSelection();
    addNode(kind, at, undefined, patch, false);
    clearSelection();
    setShapeMenuOpen(false);
    setTool('select');
    setCommentMode(false);
    showToast(message);
  };

  const addStickyNote = () =>
    insertAnnotation('note', { title: 'Sticky note', variant: 'sticky', note: '' }, 'Sticky note added');
  const addTextCard = () =>
    insertAnnotation('note', { title: 'Text', variant: 'text', note: '' }, 'Text added');
  const addTableCard = () => insertAnnotation('table', { title: 'Table' }, 'Table added');
  const addPageCard = () => insertAnnotation('page', { title: 'Page' }, 'Page added');
  const addShapeCard = (shape: ShapeKind) => {
    const label = shape === 'rect' ? 'Rectangle' : shape === 'ellipse' ? 'Ellipse' : 'Diamond';
    insertAnnotation('shape', { title: label, shape }, `${label} added`);
  };

  const beginStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    drawingRef.current = true;
    setDraftStroke({
      id: `stroke-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
      points: [point],
      color: accent.soft,
      width: 2.5,
    });
  };

  const extendStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setDraftStroke((current) => {
      if (!current) return current;
      const last = current.points[current.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return current;
      return { ...current, points: [...current.points, point] };
    });
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draftStroke?.points.length) {
      const points =
        draftStroke.points.length === 1
          ? [draftStroke.points[0], { x: draftStroke.points[0].x + 0.5, y: draftStroke.points[0].y + 0.5 }]
          : draftStroke.points;
      addStroke({ ...draftStroke, points });
    }
    setDraftStroke(null);
  };

  const [tool, setTool] = useState<DockTool>('select');
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [draftStroke, setDraftStroke] = useState<CanvasStroke | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [connectMenu, setConnectMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
    fromX: number;
    fromY: number;
    fromNodeId: string;
    fromHandleId: string | null;
    sourceLabel: string;
    sourceKind: NodeKind;
  } | null>(null);
  const drawingRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'comments'>('chat');
  const [commentMode, setCommentMode] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [reactionEmoji, setReactionEmoji] = useState('💜');
  const [reactionPaletteOpen, setReactionPaletteOpen] = useState(false);
  const [reactionMenuId, setReactionMenuId] = useState<string | null>(null);
  // Where the armed reaction rides along with the pointer (null when the pointer is off the canvas or over the dock).
  const [reactionGhost, setReactionGhost] = useState<{ x: number; y: number } | null>(null);
  // Live position of a reaction / comment pin / new-comment box while it is being dragged (committed on release).
  const [pinDrag, setPinDrag] = useState<{ kind: 'reaction' | 'comment' | 'draft'; id: string; x: number; y: number } | null>(null);
  const pinGesture = useRef<{
    kind: 'reaction' | 'comment' | 'draft';
    id: string;
    grab: { x: number; y: number };
    startX: number;
    startY: number;
    moved: boolean;
    last: { x: number; y: number };
  } | null>(null);
  const pinMovedRef = useRef(false);
  const [titleMenu, setTitleMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const dragDepth = useRef(0);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      author: 'Open Source Canvas',
      text: 'Local chat preview. Create a share room to chat live with collaborators.',
    },
  ]);

  const createFromCanvasMenu = (id: ContextCreateId) => {
    const menu = canvasMenu;
    if (!menu) return;
    setCanvasMenu(null);
    closeDetails();
    const at = { x: menu.flowX - 134, y: menu.flowY - 52 };
    if (id === 'image') {
      addNode('model', at, 'sd-turbo', { title: 'Image Generation' }, true);
    } else if (id === 'video') {
      addNode('model', at, 'ltx-video-2b', { title: 'Video Generation' }, true);
    } else if (id === 'prompt') {
      addNode('prompt', at, undefined, { title: 'Prompt' }, true);
    } else if (id === 'reference') {
      addNode('reference', at, undefined, { title: 'Image' }, true);
    } else if (id === 'output') {
      addNode('output', at, undefined, { title: 'Output' }, true);
    } else if (id === 'sticky') {
      addNode('note', at, undefined, { title: 'Sticky note', variant: 'sticky', note: '' }, true);
    } else if (id === 'table') {
      addNode('table', at, undefined, { title: 'Table' }, true);
    } else if (id === 'page') {
      addNode('page', at, undefined, { title: 'Page' }, true);
    }
  };

  const createFromConnectMenu = (optionId: ConnectOptionId) => {
    const menu = connectMenu;
    if (!menu) return;
    setConnectMenu(null);
    const live = useCanvasStore.getState();
    const source = live.activeId ? live.docs[live.activeId]?.nodes.find((node) => node.id === menu.fromNodeId) : null;
    const sourceWidth = source?.measured?.width ?? 268;
    const sourceHeight = source?.measured?.height ?? 280;
    let x = menu.flowX - 134;
    let y = menu.flowY - 96;
    if (source) {
      const overlaps =
        x < source.position.x + sourceWidth + 48 &&
        x + 268 > source.position.x - 48 &&
        y < source.position.y + sourceHeight + 48 &&
        y + 280 > source.position.y - 48;
      if (overlaps) x = source.position.x + sourceWidth + 88;
    }
    const at = { x, y };
    let id: string | undefined;
    if (optionId === 'image') {
      id = addNode('model', at, 'sd-turbo', { title: 'Image Generation' }, false);
    } else if (optionId === 'video') {
      id = addNode('model', at, 'ltx-video-2b', { title: 'Video Generation' }, false);
    } else if (optionId === 'output') {
      id = addNode('output', at, undefined, { title: 'Output' }, false);
    } else if (optionId === 'sticky') {
      id = addNode('note', at, undefined, { title: 'Sticky note', variant: 'sticky', note: '' }, false);
    } else if (optionId === 'table') {
      id = addNode('table', at, undefined, { title: 'Table' }, false);
    }
    if (!id) return;
    if (optionId === 'image' || optionId === 'video' || optionId === 'output') {
      onConnect({ source: menu.fromNodeId, target: id, sourceHandle: menu.fromHandleId, targetHandle: null });
    }
    clearSelection();
    showToast(
      optionId === 'image'
        ? 'Image generator connected'
        : optionId === 'video'
          ? 'Video generator connected'
          : optionId === 'output'
            ? 'Output connected'
            : optionId === 'sticky'
              ? 'Sticky note added'
              : 'Table added',
    );
  };

  useEffect(() => {
    if (!connectMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.connect-menu')) return;
      setConnectMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [connectMenu]);


  useEffect(() => {
    if (!paletteOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        (event.target.closest('.add-node-panel') || event.target.closest('.dock-btn--add'))
      ) {
        return;
      }
      setPaletteOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [paletteOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.canvas-account')) return;
      setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.16, duration: 450 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [doc?.id, fitView]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const editing =
        target !== null &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (mod && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c' && !editing) {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v' && !editing) {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && event.key.toLowerCase() === 'g' && !editing) {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault();
        void run('all');
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow();
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSelected(null);
        setPaletteOpen(false);
        setSearchOpen(false);
        setTitleMenu(false);
        setShapeMenuOpen(false);
        setConnectMenu(null);
        setCanvasMenu(null);
        closeDetails();
        setTool('select');
        setCommentMode(false);
        setCommentDraft(null);
        setActiveCommentId(null);
        setReactionMenuId(null);
        setReactionPaletteOpen(false);
        return;
      }
      if (!mod && !editing) {
        const key = event.key.toLowerCase();
        if (key === 'v') { selectTool('select'); return; }
        if (key === 'h') { selectTool('pan'); return; }
        if (key === 'p') { selectTool('draw'); return; }
        if (key === 'e') { selectTool('erase'); return; }
        if (key === 't') { addTextCard(); return; }
        if (key === 's') { addStickyNote(); return; }
        if (key === 'c') { selectTool('comment'); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, saveNow, setSelected, undo, redo, copySelection, pasteClipboard, groupSelection, ungroupSelection, tool]);

  const addAssetToCanvas = (asset: CanvasAsset, at?: { x: number; y: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const base = at ?? (rect
      ? screenToFlowPosition({
          x: rect.left + rect.width / 2 - 140,
          y: rect.top + rect.height / 2 - 110,
        })
      : { x: 280, y: 180 });
    addNode('reference', base, undefined, {
      previewUrl: asset.url,
      mediaKind: asset.kind,
      title: asset.kind === 'video' ? 'Video' : 'Image',
      label: asset.name.replace(/\.[^.]+$/, '').slice(0, 22).toUpperCase(),
    });
    setAssetsOpen(false);
    clearSelection();
    showToast('Asset added to canvas');
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const assetId = event.dataTransfer.getData('application/x-framegraph-asset');
    const asset = assetId
      ? useCanvasStore.getState().assets.find((item) => item.id === assetId)
      : undefined;
    if (asset) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addAssetToCanvas(asset, at);
      }
      return;
    }
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );
    if (!files.length) {
      showToast('Drop an image or video file');
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const base = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    clearSelection();
    const results = await Promise.all(
      files.slice(0, 4).map(async (file, index) => {
        let media;
        try {
          media = await fileToNodeMedia(file);
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
          return 0;
        }
        addNode('reference', { x: base.x + index * 34, y: base.y + index * 24 }, undefined, {
          previewUrl: media.url,
          mediaKind: media.kind,
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 22).toUpperCase(),
          title: media.kind === 'video' ? 'Video' : 'Image',
        }, false);
        addAsset({ url: media.url, kind: media.kind, name: file.name, source: 'upload' });
        return 1;
      }),
    );
    const added = results.reduce<number>((sum, value) => sum + value, 0);
    if (added > 0) {
      showToast(`${added} media node${added === 1 ? '' : 's'} added`);
    } else {
      showToast('No media was added — try an image or a shorter video');
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const base = screenToFlowPosition({
      x: rect.left + rect.width / 2 - 140,
      y: rect.top + rect.height / 2 - 110,
    });
    clearSelection();
    const results = await Promise.all(
      files.slice(0, 4).map(async (file, index) => {
        try {
          const media = await fileToNodeMedia(file);
          addNode('reference', { x: base.x + index * 34, y: base.y + index * 24 }, undefined, {
            previewUrl: media.url,
            mediaKind: media.kind,
            label: file.name.replace(/\.[^.]+$/, '').slice(0, 22).toUpperCase(),
            title: media.kind === 'video' ? 'Video' : 'Image',
          }, false);
          addAsset({ url: media.url, kind: media.kind, name: file.name, source: 'upload' });
          return 1;
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
          return 0;
        }
      }),
    );
    setPaletteOpen(false);
    const added = results.reduce<number>((sum, value) => sum + value, 0);
    if (added > 0) showToast(`${added} media node${added === 1 ? '' : 's'} added`);
  };

  const handleAdd = useCallback(
    (kind: NodeKind, modelId?: ModelId, title?: string) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) {
        addNode(kind, undefined, modelId, title ? { title } : undefined, true);
        return;
      }
      const base = screenToFlowPosition({
        x: rect.left + rect.width / 2 - 140,
        y: rect.top + rect.height / 2 - 110,
      });
      const offsets = [
        [0, 0],
        [330, 0],
        [0, 230],
        [330, 230],
        [-330, 0],
        [-330, 230],
        [0, -230],
        [330, -230],
      ];
      let at = base;
      for (const [dx, dy] of offsets) {
        const candidate = { x: base.x + dx, y: base.y + dy };
        const occupied = doc?.nodes.some(
          (node) =>
            Math.abs(node.position.x - candidate.x) < 160 &&
            Math.abs(node.position.y - candidate.y) < 140,
        );
        if (!occupied) {
          at = candidate;
          break;
        }
      }
      addNode(kind, at, modelId, title ? { title } : undefined, true);
      showToast('Node added');
    },
    [addNode, screenToFlowPosition, doc],
  );

  const exportDoc = () => {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'open-source-canvas'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Canvas exported as JSON');
  };

  const copyShare = async () => {
    const id = roomId ?? `room-${crypto.randomUUID().slice(0, 8)}`;
    joinRoom(id, doc);
    window.history.replaceState(null, '', `#room=${id}`);
    const url = `${window.location.origin}${window.location.pathname}#room=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Room link copied — share it with a teammate');
    } catch {
      showToast('Room link ready — start the room server with npm run room');
    }
  };

  const selectSearchResult = (nodeId: string) => {
    const node = doc?.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelected(nodeId);
    setSearchOpen(false);
    setSearchQuery('');
    setCenter(node.position.x + 130, node.position.y + 100, { zoom: 1, duration: 450 });
  };

  const sendChat = () => {
    const text = chatDraft.trim();
    if (!text) return;
    if (roomConnected) {
      sendRoomChat(text);
    } else {
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), author: 'You', text, self: true },
      ]);
    }
    setChatDraft('');
  };

  const comments = doc?.comments ?? [];
  const openComments = comments.filter((comment) => !comment.resolved);

  const minimapColor = (node: Node) => {
    const kind = (node.data as CanvasNodeData).kind;
    if (kind === 'prompt' || kind === 'reference') return accent.soft;
    if (kind === 'output') return '#f3f1e8';
    if (kind === 'note') return '#ffe27a';
    return '#8bd3ff';
  };

  if (!doc) {
    return (
      <div className="editor editor--missing">
        <p>This canvas no longer exists.</p>
        <button className="button button--lime" onClick={goDashboard}>Back to studio</button>
      </div>
    );
  }

  const selectedNode = doc.nodes.find((node) => node.id === selectedId);
  const modelCount = doc.nodes.filter((node) => node.data.kind === 'model').length;
  const filteredNodes = doc.nodes.filter((node) => {
    const query = searchQuery.toLowerCase();
    return (
      node.data.title.toLowerCase().includes(query) ||
      node.data.kind.toLowerCase().includes(query) ||
      (node.data.prompt ?? '').toLowerCase().includes(query)
    );
  });

  const boxes = nodeBoxes(doc.nodes);

  // Reactions, comment pins and the new-comment box all drag the same way: grab, move past 4px, drop.
  const beginPinDrag = (
    event: ReactPointerEvent<HTMLElement>,
    kind: 'reaction' | 'comment' | 'draft',
    id: string,
    origin: { x: number; y: number },
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps the drag alive outside the pin; without it the drag still works.
    }
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    pinGesture.current = {
      kind,
      id,
      grab: { x: start.x - origin.x, y: start.y - origin.y },
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      last: origin,
    };
  };
  const movePinDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = pinGesture.current;
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 4) return;
    gesture.moved = true;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    gesture.last = { x: point.x - gesture.grab.x, y: point.y - gesture.grab.y };
    setPinDrag({ kind: gesture.kind, id: gesture.id, ...gesture.last });
  };
  const endPinDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = pinGesture.current;
    pinGesture.current = null;
    if (!gesture) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPinDrag(null);
    if (!gesture.moved) return;
    pinMovedRef.current = true;
    window.setTimeout(() => { pinMovedRef.current = false; }, 80);
    const { x, y } = gesture.last;
    if (gesture.kind === 'comment') {
      // A comment dropped on a node pins to it (and follows it); dropped on empty canvas it floats free.
      const target = nodeAt({ x, y }, boxes, 0);
      moveComment(gesture.id, target ? { x, y, nodeId: target.id, dx: x - target.x, dy: y - target.y } : { x, y, nodeId: undefined, dx: undefined, dy: undefined });
    }
    else if (gesture.kind === 'draft') setCommentDraft({ x, y });
    else {
      // A reaction dropped on a node pins to it (and follows it); dropped on empty canvas it floats free.
      const target = nodeAt({ x, y }, boxes, 20);
      if (target) updateReaction(gesture.id, { x, y, nodeId: target.id, dx: x - target.x, dy: y - target.y });
      else updateReaction(gesture.id, { x, y, nodeId: undefined, dx: undefined, dy: undefined });
    }
  };
  const dragHandlers = {
    onPointerMove: movePinDrag,
    onPointerUp: endPinDrag,
    onPointerCancel: endPinDrag,
  };
  const pinAt = (kind: 'reaction' | 'comment' | 'draft', id: string, fallback: { x: number; y: number }) =>
    pinDrag && pinDrag.kind === kind && pinDrag.id === id ? { x: pinDrag.x, y: pinDrag.y } : fallback;
  const activeComment = openComments.find((comment) => comment.id === activeCommentId) ?? null;

  return (
    <div className={`editor editor--canvas ${dragging ? 'is-node-dragging' : ''}`}>
      <div
        className={`canvas-stage ${dragActive ? 'is-drag-active' : ''} ${tool === 'erase' ? 'is-erasing' : ''} ${tool === 'reaction' ? 'is-placing-reaction' : ''}`}
        onPointerMove={(event) => {
          if (tool !== 'reaction') return;
          const overChrome = (event.target as Element | null)?.closest?.('.reaction-palette, .canvas-dock');
          setReactionGhost(overChrome ? null : { x: event.clientX, y: event.clientY });
        }}
        onPointerLeave={() => setReactionGhost(null)}
        onClickCapture={(event) => {
          if (!(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return;
          if (!selectedId && !canvasMenu) return;
          setCanvasMenu(null);
          setSelected(null);
          closeDetails();
        }}
        ref={stageRef}
        onPointerDownCapture={() => {
          ignoreSelectionRef.current = false;
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) {
            dragDepth.current += 1;
            setDragActive(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragActive(false);
          }
        }}
        onDrop={(event) => void handleDrop(event)}
      >
        <ReactFlow
          nodes={doc.nodes}
          edges={renderedEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            setCanvasMenu({ x: event.clientX, y: event.clientY, flowX: position.x, flowY: position.y });
          }}
          onPaneClick={(event) => {
            setCanvasMenu(null);
            setSelected(null);
            closeDetails();
            setTitleMenu(false);
            setShapeMenuOpen(false);
            setConnectMenu(null);
            setActiveCommentId(null);
            setReactionMenuId(null);
            setReactionPaletteOpen(false);
            const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            if (tool === 'reaction') {
              addReaction(position.x, position.y, reactionEmoji);
              selectTool('select');
              return;
            }
            if (commentMode) {
              setCommentDraft(position);
              setCommentMode(false);
              setTool('select');
              setChatOpen(false);
            }
          }}
          onNodeClick={(event, node) => {
            if (tool === 'reaction' || commentMode) {
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              if (tool === 'reaction') {
                const box = nodeBoxes(doc.nodes).get(node.id);
                addReaction(position.x, position.y, reactionEmoji, box ? { nodeId: node.id, dx: position.x - box.x, dy: position.y - box.y } : undefined);
                selectTool('select');
              } else {
                setCommentDraft(position);
                setCommentMode(false);
                setTool('select');
                setChatOpen(false);
              }
              return;
            }
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            if ((event.target as Element | null)?.closest?.('textarea, input, [contenteditable="true"]')) return;
            if (node.data.kind === 'model') {
              openDetails(node.id);
            } else {
              setSelected(node.id);
              closeDetails();
            }
          }}
          onConnectStart={() => setConnectMenu(null)}
          onConnectEnd={(event, state) => {
            if (state.toNode) return;
            if (!state.fromNode || state.fromHandle?.type !== 'source') return;
            const point =
              'clientX' in event
                ? { x: event.clientX, y: event.clientY }
                : {
                    x: event.changedTouches[0]?.clientX ?? 0,
                    y: event.changedTouches[0]?.clientY ?? 0,
                  };
            // Dropping anywhere on a node links to it, not only on the small handle.
            const under = document.elementFromPoint(point.x, point.y);
            const nodeElement = under instanceof Element ? under.closest<HTMLElement>('.react-flow__node') : null;
            const targetId = nodeElement?.getAttribute('data-id');
            if (targetId) {
              if (targetId === state.fromNode.id) return;
              const live = useCanvasStore.getState();
              const target = live.activeId
                ? live.docs[live.activeId]?.nodes.find((node) => node.id === targetId)
                : null;
              if (target && (target.data.kind === 'model' || target.data.kind === 'output')) {
                onConnect({
                  source: state.fromNode.id,
                  target: targetId,
                  sourceHandle: state.fromHandle?.id ?? null,
                  targetHandle: null,
                });
                setConnectMenu(null);
                return;
              }
              showToast('That node can’t receive a link');
              return;
            }
            const flow = screenToFlowPosition(point);
            setConnectMenu({
              x: point.x,
              y: point.y,
              flowX: flow.x,
              flowY: flow.y,
              fromX: state.from.x,
              fromY: state.from.y,
              fromNodeId: state.fromNode.id,
              fromHandleId: state.fromHandle?.id ?? null,
              sourceLabel: String(state.fromNode.data?.title ?? 'this node'),
              sourceKind: (state.fromNode.data?.kind as NodeKind) ?? 'prompt',
            });
          }}
          onSelectionChange={(params) => {
            if (ignoreSelectionRef.current) return;
            if (typeof document !== 'undefined' && document.activeElement?.closest?.('textarea, input, [contenteditable="true"]')) return;
            if (params.nodes.length) setSelectedIds(params.nodes.map((node) => node.id));
          }}
          onNodeDragStart={(_event, node, nodes) => {
            snapshotHistory('drag');
            setDragging(true);
            markNodesTouched((nodes ?? [node]).map((item) => item.id));
          }}
          onNodeDragStop={() => setDragging(false)}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: accent.soft, strokeWidth: 1.5, strokeDasharray: '5 5' }}
          fitView
          fitViewOptions={{ padding: 0.16, minZoom: 0.35, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          panOnDrag={tool === 'pan'}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          panOnScrollSpeed={0.9}
          zoomOnScroll={false}
          zoomOnPinch
          selectionOnDrag={tool === 'select'}
          nodesDraggable={tool === 'select'}
          autoPanOnNodeFocus={false}
          elementsSelectable
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
          className="flow"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.15}
            color="var(--grid-dot)"
          />
          <ViewportPortal>
            <svg className="ink-layer" width={1} height={1} aria-hidden="true">
              <defs>
                <marker id="connect-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={accent.soft} />
                </marker>
              </defs>
              {connectMenu && (
                <path
                  className="connect-preview"
                  d={curvePath(connectMenu.fromX, connectMenu.fromY, connectMenu.flowX, connectMenu.flowY)}
                  fill="none"
                  stroke={accent.soft}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  markerEnd="url(#connect-arrow)"
                />
              )}
              {(doc.strokes ?? []).map((stroke) => (
                <path
                  key={stroke.id}
                  className="ink-stroke"
                  d={strokePath(stroke.points)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {tool === 'erase' &&
                (doc.strokes ?? []).map((stroke) => (
                  <path
                    key={`${stroke.id}-erase`}
                    d={strokePath(stroke.points)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(20, stroke.width + 16)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeStroke(stroke.id);
                    }}
                  />
                ))}
              {draftStroke && (
                <path
                  d={strokePath(draftStroke.points)}
                  fill="none"
                  stroke={draftStroke.color}
                  strokeWidth={draftStroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            {(doc.reactions ?? []).map((reaction) => {
              const at = pinAt('reaction', reaction.id, reactionPoint(reaction, boxes));
              return (
                <button
                  key={reaction.id}
                  type="button"
                  className={`canvas-reaction nodrag nopan ${pinDrag?.id === reaction.id ? 'is-dragging' : ''}`}
                  style={{ left: at.x, top: at.y }}
                  title="Drag to move · click to change · double-click to remove"
                  onPointerDown={(event) => beginPinDrag(event, 'reaction', reaction.id, at)}
                  {...dragHandlers}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pinMovedRef.current) return;
                    setReactionMenuId((current) => (current === reaction.id ? null : reaction.id));
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setReactionMenuId(null);
                    removeReaction(reaction.id);
                  }}
                >
                  {reaction.emoji}
                </button>
              );
            })}
            {openComments.map((comment, index) => {
              const at = pinAt('comment', comment.id, anchoredPoint(comment, boxes));
              return (
                <button
                  key={comment.id}
                  type="button"
                  className={`comment-pin nodrag nopan ${pinDrag?.id === comment.id ? 'is-dragging' : ''} ${activeCommentId === comment.id ? 'is-active' : ''}`}
                  style={{ left: at.x, top: at.y }}
                  title="Drag to move · click to open"
                  onPointerDown={(event) => beginPinDrag(event, 'comment', comment.id, at)}
                  {...dragHandlers}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (pinMovedRef.current) return;
                    setActiveCommentId((current) => (current === comment.id ? null : comment.id));
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
            {commentDraft && (
              <form
                className={`comment-composer nodrag nopan ${pinDrag?.kind === 'draft' ? 'is-dragging' : ''}`}
                style={{ left: pinAt('draft', 'draft', commentDraft).x, top: pinAt('draft', 'draft', commentDraft).y }}
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!commentText.trim()) return;
                  // a comment left on a node belongs to that node and moves with it
                  const target = nodeAt(commentDraft, boxes, 0);
                  const id = addComment(commentDraft.x, commentDraft.y, commentText, target ? { nodeId: target.id, dx: commentDraft.x - target.x, dy: commentDraft.y - target.y } : undefined);
                  setCommentDraft(null);
                  setCommentText('');
                  setActiveCommentId(id ?? null);
                }}
              >
                <div
                  className="comment-composer__handle"
                  title="Drag to move"
                  onPointerDown={(event) => beginPinDrag(event, 'draft', 'draft', commentDraft)}
                  {...dragHandlers}
                >
                  <GripHorizontal size={12} />
                  <span className="eyebrow">NEW COMMENT</span>
                </div>
                <textarea
                  autoFocus
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Leave feedback for the team…"
                  rows={3}
                />
                <div>
                  <button type="button" onClick={() => { setCommentDraft(null); setCommentText(''); }}>Cancel</button>
                  <button type="submit" className="is-primary">Comment</button>
                </div>
              </form>
            )}
          </ViewportPortal>
          {minimapOpen && (
            <MiniMap
              pannable
              zoomable
              nodeColor={minimapColor}
              maskColor="rgba(3,6,9,.74)"
              position="bottom-left"
              style={{ width: 158, height: 98, left: 16, bottom: 66 }}
            />
          )}
        </ReactFlow>
        {tool === 'reaction' && reactionGhost && (
          <div className="reaction-cursor" style={{ left: reactionGhost.x, top: reactionGhost.y }} aria-hidden="true">{reactionEmoji}</div>
        )}
        {reactionPaletteOpen && (
          <div className="reaction-palette" role="dialog" aria-label="Reactions" onClick={(event) => event.stopPropagation()}>
            <div className="reaction-palette__grid">
              {REACTION_EMOJI.map((emoji) => (
                <button key={emoji} type="button" className={emoji === reactionEmoji ? 'is-active' : ''} onClick={() => pickReaction(emoji)} aria-label={`React ${emoji}`}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        {(() => {
          const target = (doc.reactions ?? []).find((reaction) => reaction.id === reactionMenuId);
          if (!target) return null;
          const at = pinAt('reaction', target.id, reactionPoint(target, boxes));
          const stage = stageRef.current?.getBoundingClientRect();
          const width = 232;
          const height = 112;
          const stageW = stage?.width ?? 1200;
          const stageH = stage?.height ?? 800;
          const px = at.x * zoom + viewX;
          const py = at.y * zoom + viewY;
          const gap = 22; // keeps the clicked reaction (and the ones stacked next to it) uncovered, so it can still be double-clicked
          const box = target.nodeId ? boxes.get(target.nodeId) : undefined;
          let left: number;
          let top: number;
          if (box) {
            // Pinned to a node: open on the side away from the node, level with the reaction.
            const outwardRight = at.x >= box.x + box.w / 2;
            left = outwardRight ? px + gap : px - gap - width;
            top = py - height / 2;
          } else {
            // Floating: open just above it.
            left = px - width / 2;
            top = py - height - gap;
          }
          left = Math.min(Math.max(left, 12), Math.max(12, stageW - width - 12));
          top = Math.min(Math.max(top, 12), Math.max(12, stageH - height - 12));
          return (
            <div className="reaction-menu" style={{ left, top, width }} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Change reaction">
              <div className="reaction-palette__grid">
                {REACTION_EMOJI.map((emoji) => (
                  <button key={emoji} type="button" className={emoji === target.emoji ? 'is-active' : ''} onClick={() => { updateReaction(target.id, { emoji }); setReactionMenuId(null); }} aria-label={`Change to ${emoji}`}>
                    {emoji}
                  </button>
                ))}
              </div>
              <button type="button" className="reaction-menu__remove" onClick={() => { removeReaction(target.id); setReactionMenuId(null); }}>
                <Trash2 size={11} /> Remove
              </button>
            </div>
          );
        })()}
        {activeComment && (() => {
          // Comment card next to its pin (screen space, so it stays readable at any zoom and follows pan/zoom/drag).
          const at = pinAt('comment', activeComment.id, anchoredPoint(activeComment, boxes));
          const stage = stageRef.current?.getBoundingClientRect();
          const width = 248;
          const px = at.x * zoom + viewX;
          const py = at.y * zoom + viewY;
          const stageW = stage?.width ?? 1200;
          const stageH = stage?.height ?? 800;
          const left = px + 18 + width > stageW - 12 ? Math.max(12, px - 18 - width) : px + 18;
          const top = Math.min(Math.max(px >= 0 ? py - 44 : 12, 12), Math.max(12, stageH - 190));
          return (
            <div className="comment-popover" style={{ left, top, width }} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Comment">
              <div className="comment-popover__top">
                <strong>{activeComment.author}</strong>
                <span>{new Date(activeComment.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <button type="button" onClick={() => setActiveCommentId(null)} aria-label="Close comment"><X size={12} /></button>
              </div>
              <p>{activeComment.text}</p>
              <div className="comment-popover__actions">
                <button type="button" onClick={() => { resolveComment(activeComment.id); setActiveCommentId(null); }}>
                  <Check size={11} /> Resolve
                </button>
                <button type="button" onClick={() => { deleteComment(activeComment.id); setActiveCommentId(null); }} title="Delete comment">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })()}

        {dragActive && (
          <div className="canvas-drop">
            <span><ImagePlus size={22} /></span>
            <strong>Drop to add media</strong>
            <small>Images and videos become nodes you can connect to a generator.</small>
          </div>
        )}

        {doc.nodes.length === 0 && (
          <div className="canvas-empty-hint">
            <span><Sparkles size={18} /></span>
            <strong>Drop a node to start</strong>
            <small>Press <kbd>+</kbd> or use the toolbar below.</small>
          </div>
        )}

        <header className="canvas-topbar">
          <div className="canvas-topbar__left">
            {doc?.pageParentId && (
              <button className="canvas-back" onClick={goPageBack} title="Back to parent canvas">
                <ArrowLeft size={13} />
                <span>{pageParentTitle}</span>
              </button>
            )}
            <button className="canvas-logo" onClick={goDashboard} title="Back to studio">
              <Logo compact />
            </button>
            <div className="canvas-title">
              <input
                value={doc.title}
                onChange={(event) => renameCanvas(event.target.value)}
                aria-label="Canvas title"
              />
              <button
                className="canvas-title__chevron"
                onClick={() => setTitleMenu((value) => !value)}
                aria-label="Canvas menu"
              >
                <ChevronDown size={14} />
              </button>
              {titleMenu && (
                <div className="canvas-title-menu">
                  <button onClick={() => { duplicateCanvas(doc.id); setTitleMenu(false); showToast('Canvas duplicated'); }}>
                    <Copy size={13} /> Duplicate
                  </button>
                  <button disabled={!canUndo} onClick={() => { undo(); setTitleMenu(false); }}>
                    <Undo2 size={13} /> Undo
                  </button>
                  <button disabled={!canRedo} onClick={() => { redo(); setTitleMenu(false); }}>
                    <Redo2 size={13} /> Redo
                  </button>
                  <button onClick={() => { copySelection(); setTitleMenu(false); }}>
                    <Copy size={13} /> Copy selection
                  </button>
                  <button onClick={() => { pasteClipboard(); setTitleMenu(false); }}>
                    <ClipboardPaste size={13} /> Paste
                  </button>
                  <button disabled={selectedIds.length < 2} onClick={() => { groupSelection(); setTitleMenu(false); }}>
                    <Frame size={13} /> Group selection
                  </button>
                  <button onClick={() => { ungroupSelection(); setTitleMenu(false); }}>
                    <Ungroup size={13} /> Ungroup
                  </button>
                  <button onClick={() => { saveAsTemplate(doc.title); setTitleMenu(false); }}>
                    <LayoutTemplate size={13} /> Save as template
                  </button>
                  <button onClick={() => { setVersionsOpen(true); setAssetsOpen(false); setSelected(null); setTitleMenu(false); }}>
                    <HistoryIcon size={13} /> Version history
                  </button>
                  <button onClick={() => { exportDoc(); setTitleMenu(false); }}>
                    <Download size={13} /> Export JSON
                  </button>
                  <button
                    className="is-danger"
                    onClick={() => {
                      if (window.confirm('Delete this canvas? This cannot be undone.')) {
                        deleteCanvas(doc.id);
                        goDashboard();
                      }
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="canvas-topbar__right">
            <button
              type="button"
              className={`comfy-status ${!useComfy ? 'is-demo' : connection === 'online' ? 'is-online' : connection === 'offline' ? 'is-offline' : ''}`}
              onClick={openConnection}
              title={!useComfy ? 'Demo mode — click to connect ComfyUI' : connection === 'online' ? 'ComfyUI connected' : 'ComfyUI not connected — click to configure'}
            >
              <span className={`comfy-status__dot ${!useComfy ? 'is-demo' : connection === 'online' ? 'is-online' : connection === 'offline' ? 'is-offline' : ''}`} />
              <span>ComfyUI</span>
            </button>
            <button
              type="button"
              className="comfy-status"
              onClick={() => setGuideOpen((value) => !value)}
              title="How to write a prompt for each model"
              aria-expanded={guideOpen}
            >
              <Lightbulb size={13} />
              <span>Prompt guide</span>
            </button>
            <div className="canvas-action-pill">
              <div className="canvas-account">
                <button
                  className="canvas-avatar-btn"
                  onClick={() => setAccountOpen((value) => !value)}
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                >
                  <span className="avatar avatar--sm avatar--ring">AR</span>
                  <ChevronDown size={12} />
                </button>
                {accountOpen && (
                  <div className="account-menu" role="menu" aria-label="Account">
                    <div className="account-menu__head">
                      <span className="avatar avatar--sm">AR</span>
                      <div>
                        <strong>Alex R.</strong>
                        <span>Local workspace</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAssetsOpen((value) => !value);
                        setAccountOpen(false);
                      }}
                    >
                      <FolderOpen size={14} /> Assets
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                        setAccountOpen(false);
                      }}
                    >
                      <ThemeIcon preference={themePreference} size={14} />
                      Theme: {themePreference === 'system' ? 'Auto' : THEME_LABEL[themePreference]}
                    </button>
                    <span className="account-menu__label">Accent</span>
                    <div className="account-menu__swatches">
                      {ACCENTS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={item.id === accentId ? 'account-swatch is-selected' : 'account-swatch'}
                          style={{ background: item.color }}
                          title={item.label}
                          aria-label={item.label}
                          onClick={() => setAccent(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="canvas-pill-icon"
                onClick={() => showToast('No new notifications')}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={16} />
              </button>
              <button
                className={chatOpen ? 'canvas-pill-button is-active' : 'canvas-pill-button'}
                onClick={() => { setChatTab('chat'); setChatOpen((value) => !value); }}
              >
                <MessageCircle size={15} /> Chat
                {roomId && <span className={`canvas-live-dot ${roomConnected ? 'is-live' : ''}`} />}
              </button>
              <button className="canvas-pill-button canvas-pill-button--share" onClick={copyShare}>
                <Share2 size={14} /> Share
              </button>
            </div>
          </div>
        </header>

        {tool === 'erase' && (
          <div className="erase-hint">
            <Eraser size={13} /> Eraser · click a drawing to remove
            <button type="button" onClick={() => selectTool('select')}>Done</button>
          </div>
        )}

        {tool === 'draw' && (
          <div
            className="draw-layer"
            onPointerDown={beginStroke}
            onPointerMove={extendStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            aria-label="Drawing surface"
          >
            <span className="draw-layer__hint">Draw on the board · press V to select</span>
          </div>
        )}

        <CanvasDock
          tool={tool}
          onTool={selectTool}
          onSticky={addStickyNote}
          onText={addTextCard}
          shapeMenuOpen={shapeMenuOpen}
          onToggleShapeMenu={() => setShapeMenuOpen((value) => !value)}
          onShape={addShapeCard}
          onTable={addTableCard}
          onPage={addPageCard}
          onSearch={() => setSearchOpen(true)}
          onAdd={() => setPaletteOpen((value) => !value)}
          addOpen={paletteOpen}
        />

        {canvasMenu && (
          <CanvasContextMenu
            x={canvasMenu.x}
            y={canvasMenu.y}
            onCreate={createFromCanvasMenu}
            onClose={() => setCanvasMenu(null)}
          />
        )}

        {connectMenu && (
          <ConnectMenu
            x={connectMenu.x}
            y={connectMenu.y}
            sourceLabel={connectMenu.sourceLabel}
            sourceKind={connectMenu.sourceKind}
            onSelect={createFromConnectMenu}
            onClose={() => setConnectMenu(null)}
          />
        )}

        <div className="canvas-zoom">
          <button onClick={() => void zoomOut()} title="Zoom out"><Minus size={13} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => void zoomIn()} title="Zoom in"><Plus size={13} /></button>
          <span className="canvas-zoom__divider" />
          <button onClick={() => fitView({ padding: 0.16, duration: 300 })} title="Fit view"><Maximize2 size={13} /></button>
          <button
            className={minimapOpen ? 'is-active' : ''}
            onClick={() => setMinimapOpen((value) => !value)}
            title="Toggle map"
          >
            <MapIcon size={13} />
          </button>
        </div>


        {selectedId && selectedNode && (selectedNode.data.kind !== 'model' || detailNodeId === selectedId) && (
          <div className={`floating-inspector ${selectedNode?.data.kind === 'model' ? 'floating-inspector--generation' : ''}`}>
            <button
              className="floating-inspector__close"
              onClick={() => {
                if (selectedNode?.data.kind === 'model') {
                  closeDetails();
                  useSettingsStore.getState().setDetailsAutoOpen(false);
                } else clearSelection();
              }}
              aria-label="Close inspector"
            >
              <X size={14} />
            </button>
            {selectedNode?.data.kind === 'model' ? <GenerationPanel /> : <Inspector />}
          </div>
        )}

        {versionsOpen && (
          <VersionPanel onClose={() => setVersionsOpen(false)} />
        )}

        {guideOpen && (
          <PromptGuide
            key={selectedNode?.data.kind === 'model' ? selectedNode.data.model : 'none'}
            initialModel={selectedNode?.data.kind === 'model' ? selectedNode.data.model : undefined}
            onClose={() => setGuideOpen(false)}
          />
        )}

        {assetsOpen && (
          <AssetsPanel
            onUse={(asset) => addAssetToCanvas(asset)}
            onClose={() => setAssetsOpen(false)}
          />
        )}

        {paletteOpen && (
          <AddNodePanel
            onAdd={(kind, modelId, title) => {
              handleAdd(kind, modelId, title);
              setPaletteOpen(false);
            }}
            onUpload={(files) => void handleUploadFiles(files)}
            onAssets={() => {
              setPaletteOpen(false);
              setSelected(null);
              setAssetsOpen(true);
            }}
            onSoon={(message) => {
              setPaletteOpen(false);
              showToast(message);
            }}
          />
        )}

        {searchOpen && (
          <div className="canvas-search">
            <div className="canvas-search__head">
              <Search size={15} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find a node, prompt or model"
              />
              <button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={14} /></button>
            </div>
            <div className="canvas-search__list">
              {filteredNodes.map((node) => (
                <button key={node.id} onClick={() => selectSearchResult(node.id)}>
                  <span>
                    <strong>{node.data.title}</strong>
                    <small>{node.data.kind} · {node.data.status}</small>
                  </span>
                  <ChevronDown size={13} className="canvas-search__arrow" />
                </button>
              ))}
              {filteredNodes.length === 0 && <span className="canvas-search__empty">No nodes match.</span>}
            </div>
          </div>
        )}

        {chatOpen && (
          <div className="canvas-chat">
            <div className="canvas-chat__head">
              <div>
                <strong>Collaborate</strong>
                <span>{roomConnected ? `Live · ${peers} ${peers === 1 ? 'person' : 'people'}` : 'Local preview · not synced'}</span>
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Close chat"><X size={14} /></button>
            </div>
            <div className="chat-tabs">
              <button className={chatTab === 'chat' ? 'chat-tab is-active' : 'chat-tab'} onClick={() => setChatTab('chat')}>
                Chat
              </button>
              <button className={chatTab === 'comments' ? 'chat-tab is-active' : 'chat-tab'} onClick={() => setChatTab('comments')}>
                Comments {openComments.length ? `(${openComments.length})` : ''}
              </button>
            </div>
            {chatTab === 'chat' ? (
              <>
                <div className="canvas-chat__messages">
                  {(roomConnected ? roomMessages : chatMessages).map((message) => (
                    <div key={message.id} className={message.self ? 'chat-message chat-message--self' : 'chat-message'}>
                      <span>{message.author}</span>
                      <p>{message.text}</p>
                    </div>
                  ))}
                  {roomConnected && !roomMessages.length && (
                    <div className="chat-empty">No messages yet. Say hello to the room.</div>
                  )}
                </div>
                <form
                  className="canvas-chat__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendChat();
                  }}
                >
                  <input
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder={roomConnected ? 'Message the room…' : 'Leave a note…'}
                  />
                  <button type="submit" aria-label="Send"><Send size={14} /></button>
                </form>
              </>
            ) : (
              <div className="comments-panel">
                <button
                  className={commentMode ? 'comment-add is-active' : 'comment-add'}
                  onClick={() => {
                    selectTool(commentMode ? 'select' : 'comment');
                    setChatOpen(false);
                    setCommentDraft(null);
                  }}
                >
                  <MapPin size={13} /> {commentMode ? 'Click the canvas…' : 'Add a comment'}
                </button>
                {comments.map((comment) => (
                  <article className={comment.resolved ? 'comment-row is-resolved' : 'comment-row'} key={comment.id}>
                    <div className="comment-row__top">
                      <strong>{comment.author}</strong>
                      <span>{new Date(comment.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <p>{comment.text}</p>
                    <div className="comment-row__actions">
                      <button onClick={() => resolveComment(comment.id)}>
                        <Check size={11} /> {comment.resolved ? 'Reopen' : 'Resolve'}
                      </button>
                      <button onClick={() => deleteComment(comment.id)} title="Delete comment"><Trash2 size={11} /></button>
                    </div>
                  </article>
                ))}
                {!comments.length && (
                  <div className="chat-empty">No comments yet. Drop a pin anywhere on the canvas.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CanvasEditor() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
