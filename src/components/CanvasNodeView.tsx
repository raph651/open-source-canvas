import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bold,
  ChevronDown,
  Clock3,
  Clapperboard,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Play,
  Plus,
  Sparkles,
  Ungroup,
  X,
} from 'lucide-react';
import { ASPECTS, MODELS, MODEL_BY_ID, NODE_META } from '../data';
import { useCanvasStore } from '../store/useCanvasStore';
import { useComfyQueue } from '../store/useComfyQueue';
import { fileToNodeMedia } from '../lib/media';
import type { CanvasNode, ModelId } from '../types';
import { Artwork } from './Artwork';
import { HoverVideo } from './VideoStill';
import { Logo } from './Logo';
import { ModelPicker } from './ModelPicker';
import { GenerationTypePicker, type GenerationFamily } from './GenerationTypePicker';
import { MentionMenu } from './MentionMenu';
import { PromptMirror, syncMirrorScroll, syncPromptMirror } from './PromptMirror';
import { ToolPicker } from './ToolPicker';
import { buildMentionGroups, buildMentionLookup, mentionHandle, PROMPT_PLACEHOLDER, type MentionItem } from '../lib/mentions';
import { announcePopover, subscribePopoverOpen } from '../lib/popoverBus';
import { useSettingsStore } from '../store/useSettingsStore';
import { aspectLabel } from '../lib/format';
import { runTimeLabel } from '../lib/runTime';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Rendering',
  done: 'Ready',
  error: 'Needs input',
};

export function CanvasNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const meta = NODE_META[data.kind];
  const accentColor =
    data.kind === 'prompt' || data.kind === 'reference' || data.kind === 'note' ||
    data.kind === 'shape' || data.kind === 'table'
      ? 'var(--accent-soft)'
      : meta.color;
  const model = (data.model ? MODEL_BY_ID[data.model] : null) ?? MODELS[0];
  const measured = useSettingsStore((state) => state.runTimes[model.id]);
  const estimate = runTimeLabel(model, measured);
  // A generation shows the name you gave it (double-click the title), otherwise its model's name.
  const modelName = model?.name ?? data.title;
  const nodeTitle = data.kind === 'model' ? data.label?.trim() || modelName : data.title;
  const setSelected = useCanvasStore((state) => state.setSelected);
  const openDetails = useCanvasStore((state) => state.openDetails);
  const openPage = useCanvasStore((state) => state.openPage);
  const storeSelected = useCanvasStore((state) => state.selectedId === id);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const doc = useCanvasStore((state) => (state.activeId ? state.docs[state.activeId] : null));
  const assets = useCanvasStore((state) => state.assets);
  const run = useCanvasStore((state) => state.run);
  const running = useCanvasStore((state) => state.running);
  const progress = useComfyQueue((state) => state.nodeProgress[id]);
  const cancelNode = useComfyQueue((state) => state.cancelNode);
  const addAsset = useCanvasStore((state) => state.addAsset);
  const showToast = useCanvasStore((state) => state.showToast);
  const ungroupSelection = useCanvasStore((state) => state.ungroupSelection);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const storedWidth = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    return doc?.nodes.find((node) => node.id === id)?.width ?? null;
  });
  const storedHeight = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    return doc?.nodes.find((node) => node.id === id)?.height ?? null;
  });
  const childCount = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    return doc?.nodes.filter((node) => node.parentId === id).length ?? 0;
  });
  const pageNodeCount = useCanvasStore((state) =>
    data.kind === 'page' && data.pageId ? state.docs[data.pageId]?.nodes.length ?? 0 : 0,
  );
  const position = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    return doc?.nodes.find((item) => item.id === id)?.position ?? null;
  });
  const addNode = useCanvasStore((state) => state.addNode);
  const onConnect = useCanvasStore((state) => state.onConnect);
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null);
  const [tableMenu, setTableMenu] = useState<'color' | 'more' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Height of a model node when it is not selected. The in/out handles stay at this height so the edges do not slide
  // down when the node grows to show its prompt and controls.
  const [restingHeight, setRestingHeight] = useState<number | null>(null);
  // The prompt box only keeps the mouse wheel for itself when it has more text than fits; otherwise the wheel pans the canvas.
  const [promptOverflows, setPromptOverflows] = useState(false);
  // The real pixel size of the output once it has loaded, for the caption under it.
  const [outputSize, setOutputSize] = useState<{ url: string; width: number; height: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const commitName = () => {
    setRenaming(false);
    const next = nameDraft.trim().slice(0, 24);
    if (next !== (data.label ?? '')) updateNodeData(id, { label: next || undefined });
  };
  const [quickNumberMenu, setQuickNumberMenu] = useState<'duration' | 'batch' | null>(null);
  const quickNumberSource = `node-number-${id}`;
  const [quickNumberPos, setQuickNumberPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const uploadReference = async (file?: File) => {
    if (!file) return;
    try {
      const media = await fileToNodeMedia(file);
      updateNodeData(id, {
        previewUrl: media.url,
        mediaKind: media.kind,
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 22).toUpperCase(),
        title: media.kind === 'video' ? 'Video' : 'Image',
      });
      addAsset({ url: media.url, kind: media.kind, name: file.name, source: 'upload' });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };
  const switchGenerationFamily = (family: GenerationFamily) => {
    const nextId: ModelId = family === 'video' ? 'ltx-video-2b' : 'sd-turbo';
    const nextModel = MODEL_BY_ID[nextId];
    updateNodeData(id, {
      model: nextId,
      title: family === 'video' ? 'Video Generation' : 'Image Generation',
      resolution: nextModel?.resolutions?.[0] ?? (family === 'video' ? '720p' : '1k'),
      duration: family === 'video' ? data.duration ?? 4 : data.duration,
      generateAudio: family === 'video',
      outputUrl: undefined,
      outputKind: undefined,
      status: 'idle',
    });
  };

  const connectedUrl = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    const edge = doc?.edges.find((item) => item.target === id);
    const source = edge ? doc?.nodes.find((item) => item.id === edge.source) : null;
    return source?.data.outputUrl ?? null;
  });
  const connectedKind = useCanvasStore((state) => {
    const doc = state.activeId ? state.docs[state.activeId] : null;
    const edge = doc?.edges.find((item) => item.target === id);
    const source = edge ? doc?.nodes.find((item) => item.id === edge.source) : null;
    return source?.data.outputKind ?? null;
  });

  const resolutionOptions =
    model?.resolutions ?? (model?.family === 'video' ? ['720p', '1080p'] : ['1k', '2k', '4k']);
  const status = data.status ?? 'idle';
  const outputUrl = data.kind === 'output' ? connectedUrl : data.outputUrl;
  const outputKind = data.kind === 'output' ? connectedKind : data.outputKind;
  const isVideo =
    data.mediaKind === 'video' ||
    Boolean(data.previewUrl?.startsWith('data:video')) ||
    /\.(mp4|webm|mov)(\?|$)/i.test(data.previewUrl ?? '');

  const syncMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({ query: match[1].toLowerCase(), start: caret - match[1].length - 1, end: caret });
  };

  const chooseMention = (item: MentionItem) => {
    if (!mention) return;
    const value = promptRef.current?.value ?? data.prompt ?? '';
    let sourceId = item.nodeId;
    let tokenLabel = item.label;
    if (item.assetId) {
      tokenLabel = item.label.slice(0, 22).toUpperCase();
      const baseX = Math.max(40, (position?.x ?? 300) - 340);
      let y = position?.y ?? 200;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const occupied = (doc?.nodes ?? []).some(
          (node) => Math.abs(node.position.x - baseX) < 250 && Math.abs(node.position.y - y) < 190,
        );
        if (!occupied) break;
        y += 210;
      }
      sourceId = addNode(
        'reference',
        { x: baseX, y },
        undefined,
        {
          previewUrl: item.url,
          mediaKind: item.kind === 'video' ? 'video' : 'image',
          title: item.kind === 'video' ? 'Video' : 'Image',
          label: tokenLabel,
        },
        false,
      );
    }
    if (sourceId && !item.linked) {
      onConnect({ source: sourceId, target: id, sourceHandle: null, targetHandle: null });
    }
    const token = `@${mentionHandle(tokenLabel)} `;
    updateNodeData(id, {
      prompt: `${value.slice(0, mention.start)}${token}${value.slice(mention.end)}`,
    });
    const caret = mention.start + token.length;
    pendingCaretRef.current = caret;
    setMention(null);
    window.requestAnimationFrame(() => promptRef.current?.focus());
  };

  const mentionGroups = mention ? buildMentionGroups(doc, id, assets, mention.query) : [];
  const mentionLookup = buildMentionLookup(doc, id, assets);

  const toggleQuickNumber = (menu: 'duration' | 'batch', button: HTMLButtonElement) => {
    if (quickNumberMenu === menu) {
      setQuickNumberMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = menu === 'batch' ? 186 : 196;
    const height = menu === 'batch' ? 92 : 84;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.top - height - 8 < 8 ? rect.bottom + 8 : rect.top - height - 8;
    setQuickNumberPos({ left, top, width });
    announcePopover(quickNumberSource);
    setQuickNumberMenu(menu);
  };

  useLayoutEffect(() => {
    const field = promptRef.current;
    if (!field || data.kind !== 'model') return;
    const atEnd = field.selectionEnd === field.value.length;
    const scrollTop = field.scrollTop;
    field.style.height = 'auto';
    const maxHeight = 220;
    field.style.height = `${Math.min(field.scrollHeight, maxHeight)}px`;
    field.style.overflowY = field.scrollHeight > maxHeight ? 'auto' : 'hidden';
    field.scrollTop = atEnd ? field.scrollHeight : scrollTop;
    syncMirrorScroll(field);
  }, [data.prompt, data.kind, selected, storeSelected]);

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (pending === null) return;
    const field = promptRef.current;
    if (!field) return;
    pendingCaretRef.current = null;
    field.focus();
    field.setSelectionRange(pending, pending);
    syncMirrorScroll(field);
  }, [data.prompt]);

  useEffect(() => subscribePopoverOpen(quickNumberSource, () => setQuickNumberMenu(null)), [quickNumberSource]);

  useEffect(() => {
    if (!quickNumberMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.node__quick-number-wrap, .node-number-popover')) return;
      setQuickNumberMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuickNumberMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [quickNumberMenu]);

  const isSelected = Boolean(selected || storeSelected);
  useLayoutEffect(() => {
    const box = promptRef.current;
    setPromptOverflows(Boolean(box && box.scrollHeight > box.clientHeight + 1));
  }, [data.prompt, isSelected]);
  useEffect(() => {
    const element = rootRef.current;
    if (!element || data.kind !== 'model' || isSelected) return;
    const measure = () => setRestingHeight(element.offsetHeight || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data.kind, isSelected]);
  if (data.kind === 'page') {
    return (
      <div
        className={[
          'node',
          'node--page',
          selected || storeSelected ? 'node--selected' : '',
        ].join(' ')}
        style={{
          ['--node-accent' as string]: 'var(--accent-soft)',
          width: storedWidth ?? undefined,
          height: storedHeight ?? undefined,
        }}
      >
        <NodeResizer
          minWidth={260}
          minHeight={180}
          isVisible={selected || storeSelected}
          lineClassName="node-resizer__line"
          handleClassName="node-resizer__handle"
        />
        <span className="page-node__tag">{data.title || 'Page'}</span>
        <div
          className="page-node__card"
          onDoubleClick={(event) => {
            event.stopPropagation();
            openPage(id);
          }}
          title="Double-click to open this page"
        >
          <strong>{pageNodeCount > 0 ? `${pageNodeCount} node${pageNodeCount === 1 ? '' : 's'}` : 'Empty page'}</strong>
          <small>Double-click to enter</small>
        </div>
      </div>
    );
  }

  if (data.kind === 'group') {
    return (
      <div className={`node node--group ${selected ? 'node--selected' : ''}`}>
        <div className="node-group__label">
          <span>{data.title}</span>
          <small>{childCount} nodes</small>
          <button
            className="nodrag"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(id);
              ungroupSelection();
            }}
            title="Ungroup"
          >
            <Ungroup size={12} /> Ungroup
          </button>
        </div>
      </div>
    );
  }

  // A node the user sized by hand does not grow, so its handles can stay centred.
  const handleStyle =
    data.kind === 'model' && storedHeight == null
      ? { height: restingHeight ?? 213, bottom: 'auto' as const }
      : undefined;

  return (
    <div
      ref={rootRef}
      className={[
        'node',
        `node--${data.kind}`,
        selected || storeSelected ? 'node--selected' : '',
        status !== 'idle' ? `node--${status}` : '',
      ].join(' ')}
      style={{
        ['--node-accent' as string]: accentColor,
        width: storedWidth ?? undefined,
        height: storedHeight ?? undefined,
      }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={data.kind === 'model' ? 300 : data.kind === 'table' ? 220 : 120}
        isVisible={selected || storeSelected}
        lineClassName="node-resizer__line"
        handleClassName="node-resizer__handle"
      />
      {data.kind !== 'prompt' && data.kind !== 'reference' && data.kind !== 'note' && data.kind !== 'shape' && data.kind !== 'table' && (
        <Handle type="target" position={Position.Left} className="node-handle node-handle--in" style={handleStyle} />
      )}

      <div className="node__head">
        {data.kind === 'model' && renaming ? (
          <input
            className="node__title node__title--edit nodrag nopan"
            autoFocus
            maxLength={40}
            value={nameDraft}
            placeholder={modelName}
            aria-label="Generation name"
            onChange={(event) => setNameDraft(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={commitName}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commitName();
              if (event.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span
            className="node__title"
            title={data.kind === 'model' ? 'Double-click to rename' : undefined}
            onDoubleClick={
              data.kind === 'model'
                ? (event) => {
                    event.stopPropagation();
                    setNameDraft(data.label?.trim() || '');
                    setRenaming(true);
                  }
                : undefined
            }
          >
            {nodeTitle}
          </span>
        )}
        {data.kind === 'model' && (
          <GenerationTypePicker
            variant="node"
            family={model?.family === 'video' ? 'video' : 'image'}
            label={modelName}
            onChange={switchGenerationFamily}
          />
        )}
        {status !== 'idle' && data.kind !== 'note' && data.kind !== 'table' && (
          <span className={`node__status node__status--${status}`}>
            {status === 'running' || status === 'queued' ? (
              <LoaderCircle size={11} className="spin" />
            ) : status === 'error' ? (
              <AlertTriangle size={11} />
            ) : (
              <span className="node__status-dot" />
            )}
            {status === 'running' && progress?.stage === 'queued' ? 'Queued' : STATUS_LABEL[status]}
          </span>
        )}
      </div>

      <div className="node__body">
        {data.kind === 'prompt' && (
          <>
            <p className={data.prompt?.trim() ? 'node__prompt' : 'node__prompt node__prompt--empty'}>
              {data.prompt?.trim() || 'Write the direction in the inspector. Then connect it to a model.'}
            </p>
          </>
        )}

        {data.kind === 'model' && (
          <>
            {outputUrl ? (
              <div className="node__media">
                {outputKind === 'video' ? (
                  <video src={outputUrl} autoPlay muted loop playsInline />
                ) : (
                  <img src={outputUrl} alt={`${data.title} output`} draggable={false} />
                )}
                {outputKind === 'video' && (
                  <span className="node__play"><Play size={12} fill="currentColor" /> LTX</span>
                )}
                <span className="node__media-tag node__media-tag--icon" title={outputKind === 'video' ? 'Video' : 'Image'} aria-label={outputKind === 'video' ? 'Video' : 'Image'}>
                  {outputKind === 'video' ? <Clapperboard size={12} /> : <ImageIcon size={12} />}
                </span>
              </div>
            ) : status === 'error' ? (
              <div className="node__render node__render--error">
                <AlertTriangle size={18} />
                <strong>
                  {data.error?.toLowerCase().includes('wrapper') ? 'API wrapper required' : 'Needs an input'}
                </strong>
                <small>{data.error ?? 'Connect a prompt or reference.'}</small>
              </div>
            ) : status === 'running' || status === 'queued' ? (
              <div className="node__render node__render--running">
                <span className="node__orb" style={{ background: model?.accent }} />
                <LoaderCircle size={18} className="spin" />
                <strong>{status === 'queued' || progress?.stage === 'queued' ? 'Queued' : 'Rendering'}</strong>
                <small>{model?.name} · {model?.family}</small>
              </div>
            ) : (
              <div className="node__render node__render--empty">
                <span className="node__watermark" aria-hidden="true">
                  <Logo compact />
                </span>
              </div>
            )}

            {(status === 'running' || status === 'queued') && (
              <div className="node__progress nodrag" onPointerDown={(event) => event.stopPropagation()}>
                <div className={progress?.percent === undefined ? 'queue-bar queue-bar--busy' : 'queue-bar'}>
                  <span style={progress?.percent === undefined ? undefined : { width: `${Math.round(progress.percent * 100)}%` }} />
                </div>
                <div className="node__progress-row">
                  <span title={progress?.detail}>{progress?.detail ?? (status === 'queued' ? 'Waiting for its turn' : 'Starting')}</span>
                  {status === 'running' && (
                    <button type="button" onClick={() => cancelNode(id)} title="Cancel this render" aria-label="Cancel this render">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {(selected || storeSelected) && (
            <div
              className="node__quick nodrag"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
                <div className="node__quick-composer">
                  <div className="prompt-field prompt-field--node">
                  <PromptMirror value={data.prompt ?? ''} lookup={mentionLookup} />
                  <textarea
                    ref={promptRef}
                    className={promptOverflows ? 'nowheel' : undefined}
                    value={data.prompt ?? ''}
                    placeholder={PROMPT_PLACEHOLDER}
                    rows={4}
                    onFocus={() => openDetails(id)}
                    onChange={(event) => {
                      const caret = event.target.selectionStart ?? event.target.value.length;
                      pendingCaretRef.current = caret;
                      updateNodeData(id, { prompt: event.target.value });
                      syncMention(event.target.value, caret);
                    }}
                    onKeyUp={(event) => syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                    onClick={(event) => syncMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                    onBlur={() => window.setTimeout(() => setMention(null), 140)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      const mod = event.metaKey || event.ctrlKey;
                      if (mod && event.key.toLowerCase() === 'z') {
                        event.preventDefault();
                        if (event.shiftKey) redo(true);
                        else undo(true);
                        return;
                      }
                      if (mod && event.key.toLowerCase() === 'y') {
                        event.preventDefault();
                        redo(true);
                        return;
                      }
                      if (event.key === 'Escape' && mention) {
                        event.preventDefault();
                        setMention(null);
                      }
                    }}
                    onScroll={syncPromptMirror}
                  />
                  </div>
                  {mention && <MentionMenu groups={mentionGroups} onSelect={chooseMention} />}
                </div>
                  <div className="node__quick-meta-row">
                    <ToolPicker
                      className="node__quick-chip"
                      variant="node"
                      label="Resolution"
                      value={data.resolution ?? (model?.family === 'video' ? '720p' : '1k')}
                      options={resolutionOptions}
                      onChange={(next) => updateNodeData(id, { resolution: next })}
                    />
                    <ToolPicker
                      className="node__quick-chip"
                      variant="node"
                      label="Aspect ratio"
                      value={data.aspect ?? '1:1'}
                      options={ASPECTS}
                      display="aspect"
                      onChange={(next) => updateNodeData(id, { aspect: next as typeof data.aspect })}
                    />

                    {model?.family === 'video' && (
                      <div className="node__quick-number-wrap">
                        <button
                          type="button"
                          className={quickNumberMenu === 'duration' ? 'node__quick-number is-active' : 'node__quick-number'}
                          title="Clip duration"
                          data-tooltip="Duration"
                          aria-label="Clip duration"
                          aria-expanded={quickNumberMenu === 'duration'}
                          onClick={(event) => toggleQuickNumber('duration', event.currentTarget)}
                        >
                          <Clock3 size={9} /> {data.duration ?? 4}s
                        </button>
                      </div>
                    )}

                    <div className="node__quick-number-wrap">
                      <button
                        type="button"
                        className={quickNumberMenu === 'batch' ? 'node__quick-number is-active' : 'node__quick-number'}
                        title="Number of Generations"
                        data-tooltip="Number of Generations"
                        aria-label="Number of Generations"
                        aria-expanded={quickNumberMenu === 'batch'}
                        onClick={(event) => toggleQuickNumber('batch', event.currentTarget)}
                      >
                        <Layers size={9} /> {data.batch ?? 1}
                      </button>
                    </div>
                  </div>
                  {quickNumberMenu && quickNumberPos &&
                    createPortal(
                      <div
                        className={quickNumberMenu === 'batch' ? 'node-number-popover node-number-popover--portal node-number-popover--batch' : 'node-number-popover node-number-popover--portal'}
                        style={{ left: quickNumberPos.left, top: quickNumberPos.top, width: quickNumberPos.width }}
                      >
                        {quickNumberMenu === 'duration' ? (
                          <>
                            <div className="node-number-popover__head">
                              <span>Duration</span>
                              <strong>{data.duration ?? 4}s</strong>
                            </div>
                            <input
                              type="range"
                              min={2}
                              max={15}
                              step={1}
                              value={data.duration ?? 4}
                              aria-label="Clip duration in seconds"
                              onChange={(event) => updateNodeData(id, { duration: Number(event.target.value) })}
                            />
                            <div className="node-number-popover__ticks"><span>2s</span><span>15s</span></div>
                          </>
                        ) : (
                          <>
                            <div className="node-number-popover__head">
                              <span>Number of Generations</span>
                            </div>
                            <div className="node-number-popover__cells" role="radiogroup" aria-label="Number of Generations">
                              {[1, 2, 3, 4].map((count) => (
                                <button
                                  key={count}
                                  type="button"
                                  role="radio"
                                  aria-checked={(data.batch ?? 1) === count}
                                  aria-label={`${count} generation${count === 1 ? '' : 's'}`}
                                  className={(data.batch ?? 1) === count ? 'is-active' : ''}
                                  onClick={() => updateNodeData(id, { batch: count })}
                                >
                                  {count}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>,
                      document.body,
                    )}
                  <div className="node__quick-foot">
                    <ModelPicker
                      variant="node"
                      value={(data.model ?? 'sd-turbo') as ModelId}
                      onChange={(next) => {
                        const nextModel = MODEL_BY_ID[next];
                        const nextResolutions = nextModel?.resolutions ?? (nextModel?.family === 'video' ? ['720p', '1080p'] : ['1k', '2k', '4k']);
                        updateNodeData(id, {
                          model: next,
                          title:
                            data.title === 'Image Generation' || data.title === 'Video Generation'
                              ? nextModel?.family === 'video'
                                ? 'Video Generation'
                                : 'Image Generation'
                              : data.title,
                          resolution: nextResolutions.includes(data.resolution ?? '')
                            ? data.resolution
                            : nextResolutions[0],
                          outputUrl: undefined,
                          outputKind: undefined,
                          status: 'idle',
                        });
                      }}
                    />
                    <div className="node__quick-actions">
                      <button
                        type="button"
                        className="node__quick-generate"
                        onClick={() => void run('selected')}
                        disabled={running}
                      >
                        {running ? <LoaderCircle size={10} className="spin" /> : <Sparkles size={10} />}
                        {running ? 'Rendering' : 'Generate'}
                        {!running && estimate && <span title={estimate.title}>{estimate.label}</span>}
                      </button>
                      <button
                        type="button"
                        className="node__quick-more"
                        title="Open settings"
                        aria-label="Open settings"
                        onClick={() => openDetails(id, true)}
                      >
                        <Maximize2 size={11} />
                      </button>
                    </div>
                  </div>
            </div>
            )}
          </>
        )}

        {data.kind === 'reference' && (
          <>
            <div className="node__media node__media--reference">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                hidden
                onChange={(event) => void uploadReference(event.target.files?.[0])}
              />
              {data.previewUrl ? (
                <>
                  {isVideo ? (
                    <HoverVideo src={data.previewUrl} />
                  ) : (
                    <img src={data.previewUrl} alt={data.label ?? 'Reference'} draggable={false} />
                  )}
                </>
              ) : (
                <button
                  className="node__upload nodrag"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  <ImagePlus size={18} />
                  <strong>Drop or click</strong>
                  <small>PNG · JPG · MP4 · WebM</small>
                </button>
              )}
              <span className="node__media-tag"><ImageIcon size={11} /> {data.label ?? 'ANCHOR'}</span>
            </div>
          </>
        )}

        {data.kind === 'output' && (
          <>
            <div className="node__media node__media--output">
              {outputUrl ? (
                outputKind === 'video' ? (
                  <video
                    src={outputUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    onLoadedMetadata={(event) => setOutputSize({ url: outputUrl, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
                  />
                ) : (
                  <img
                    src={outputUrl}
                    alt="Final output"
                    draggable={false}
                    onLoad={(event) => setOutputSize({ url: outputUrl, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                  />
                )
              ) : (
                <div className="node__render node__render--quiet">
                  <strong>No output</strong>
                </div>
              )}
              {outputUrl && (
                <span className="node__media-tag node__media-tag--icon" title={outputKind === 'video' ? 'Video' : 'Image'} aria-label={outputKind === 'video' ? 'Video' : 'Image'}>
                  {outputKind === 'video' ? <Clapperboard size={12} /> : <ImageIcon size={12} />}
                </span>
              )}
            </div>
            {outputUrl && outputSize?.url === outputUrl && outputSize.width > 0 && (
              <div className="node__meta-line" title="Aspect ratio and size in pixels">
                {aspectLabel(outputSize.width, outputSize.height)} · {outputSize.width} × {outputSize.height}
              </div>
            )}
          </>
        )}

        {data.kind === 'note' && (
          <div className={`node__note-wrap ${data.variant === 'sticky' ? 'node__note-wrap--sticky' : 'node__note-wrap--text'}`}>
            <textarea
              className="node__note-input nodrag"
              value={data.note ?? ''}
              onChange={(event) => updateNodeData(id, { note: event.target.value })}
              placeholder={data.variant === 'sticky' ? 'Write on the sticky note…' : 'Add text to the board…'}
              rows={data.variant === 'sticky' ? 6 : 3}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onFocus={() => setSelected(null)}
            />
          </div>
        )}

        {data.kind === 'shape' && (
          <div className="node__shape">
            <svg viewBox="0 0 220 150" role="img" aria-label={`${data.shape ?? 'rect'} shape`}>
              <defs>
                <linearGradient id={`shape-fill-${id}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" className="node__shape-stop-a" />
                  <stop offset="100%" className="node__shape-stop-b" />
                </linearGradient>
              </defs>
              {data.shape === 'ellipse' ? (
                <ellipse cx="110" cy="75" rx="102" ry="66" fill={`url(#shape-fill-${id})`} className="node__shape-stroke" strokeWidth="1.6" />
              ) : data.shape === 'diamond' ? (
                <polygon points="110,8 212,75 110,142 8,75" fill={`url(#shape-fill-${id})`} className="node__shape-stroke" strokeWidth="1.6" />
              ) : (
                <rect x="8" y="8" width="204" height="134" rx="16" fill={`url(#shape-fill-${id})`} className="node__shape-stroke" strokeWidth="1.6" />
              )}
            </svg>
          </div>
        )}

        {data.kind === 'table' && (() => {
          const table = data.table ?? { columns: ['Beat', 'Shot', 'Note'], rows: [] };
          const tableStyle = data.tableStyle ?? {};
          const patchTable = (next: { columns: string[]; rows: string[][] }) => updateNodeData(id, { table: next });
          const patchStyle = (patch: Partial<NonNullable<typeof data.tableStyle>>) =>
            updateNodeData(id, { tableStyle: { ...tableStyle, ...patch } });
          const setCell = (rowIndex: number, columnIndex: number, value: string) => {
            const rows = table.rows.map((row, r) =>
              r === rowIndex ? row.map((cell, c) => (c === columnIndex ? value : cell)) : row,
            );
            patchTable({ columns: table.columns, rows });
          };
          const addRow = () =>
            patchTable({ columns: table.columns, rows: [...table.rows, table.columns.map(() => '')] });
          const addColumn = () =>
            patchTable({
              columns: [...table.columns, `Col ${table.columns.length + 1}`],
              rows: table.rows.map((row) => [...row, '']),
            });
          const fontSize = tableStyle.size === 'small' ? 10 : tableStyle.size === 'large' ? 14 : 12;
          const align = tableStyle.align ?? 'left';
          const AlignIcon = align === 'center' ? AlignCenter : align === 'right' ? AlignRight : AlignLeft;
          const cellStyle = {
            fontWeight: tableStyle.bold ? 650 : 400,
            fontStyle: tableStyle.italic ? 'italic' : 'normal',
            textAlign: align,
            fontSize,
            color: tableStyle.color,
          } as const;
          return (
            <>
              <NodeToolbar
                isVisible={selected || storeSelected}
                position={Position.Top}
                offset={14}
                className="table-toolbar"
              >
                <div
                  className="table-toolbar__bar nodrag"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="table-tool"
                    title="Text color"
                    aria-label="Text color"
                    onClick={() => setTableMenu(tableMenu === 'color' ? null : 'color')}
                  >
                    <span
                      className="table-tool__color"
                      style={{ background: tableStyle.color ?? '#f3f0fb' }}
                    />
                    <ChevronDown size={9} />
                  </button>
                  <select
                    className="table-tool table-tool--size"
                    value={tableStyle.size ?? 'medium'}
                    aria-label="Text size"
                    onChange={(event) => patchStyle({ size: event.target.value as 'small' | 'medium' | 'large' })}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                  <button
                    type="button"
                    className={tableStyle.bold ? 'table-tool is-active' : 'table-tool'}
                    aria-pressed={tableStyle.bold ?? false}
                    title="Bold"
                    onClick={() => patchStyle({ bold: !tableStyle.bold })}
                  >
                    <Bold size={13} />
                  </button>
                  <button
                    type="button"
                    className={tableStyle.italic ? 'table-tool is-active' : 'table-tool'}
                    aria-pressed={tableStyle.italic ?? false}
                    title="Italic"
                    onClick={() => patchStyle({ italic: !tableStyle.italic })}
                  >
                    <Italic size={13} />
                  </button>
                  <button
                    type="button"
                    className="table-tool"
                    title={`Align ${align}`}
                    onClick={() =>
                      patchStyle({ align: align === 'left' ? 'center' : align === 'center' ? 'right' : 'left' })
                    }
                  >
                    <AlignIcon size={13} />
                  </button>
                  <button
                    type="button"
                    className={tableMenu === 'more' ? 'table-tool is-active' : 'table-tool'}
                    title="More"
                    aria-label="More table actions"
                    onClick={() => setTableMenu(tableMenu === 'more' ? null : 'more')}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
                {tableMenu === 'color' && (
                  <div className="table-toolbar__menu">
                    {['#f3f0fb', 'var(--accent-soft)', 'var(--accent)', '#8bd3ff', '#6ee7b7', '#fcd34d', '#fda4af'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={tableStyle.color === color ? 'table-color is-selected' : 'table-color'}
                        style={{ background: color }}
                        aria-label={`Text color ${color}`}
                        onClick={() => {
                          patchStyle({ color });
                          setTableMenu(null);
                        }}
                      />
                    ))}
                  </div>
                )}
                {tableMenu === 'more' && (
                  <div className="table-toolbar__menu table-toolbar__menu--list">
                    <button type="button" onClick={() => { addRow(); setTableMenu(null); }}>Add row</button>
                    <button type="button" onClick={() => { addColumn(); setTableMenu(null); }}>Add column</button>
                    <button
                      type="button"
                      onClick={() => {
                        patchTable({ columns: table.columns, rows: table.rows.map((row) => row.map(() => '')) });
                        setTableMenu(null);
                      }}
                    >
                      Clear cells
                    </button>
                  </div>
                )}
              </NodeToolbar>

              <div
                className="node__table-wrap nodrag"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <table className="node__table">
                  <thead>
                    <tr>
                      {table.columns.map((column, columnIndex) => (
                        <th key={columnIndex}>
                          <input
                            value={column}
                            aria-label={`Column ${columnIndex + 1}`}
                            style={cellStyle}
                            onChange={(event) => {
                              const columns = table.columns.map((item, index) =>
                                index === columnIndex ? event.target.value : item,
                              );
                              patchTable({ columns, rows: table.rows });
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {table.columns.map((_, columnIndex) => (
                          <td key={columnIndex}>
                            <input
                              value={row[columnIndex] ?? ''}
                              aria-label={`Row ${rowIndex + 1} column ${columnIndex + 1}`}
                              style={cellStyle}
                              onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="table-plus table-plus--row"
                  title="Add row"
                  aria-label="Add row"
                  onClick={addRow}
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  className="table-plus table-plus--col"
                  title="Add column"
                  aria-label="Add column"
                  onClick={addColumn}
                >
                  <Plus size={12} />
                </button>
              </div>
            </>
          );
        })()}
      </div>

      {data.kind !== 'output' && data.kind !== 'note' && data.kind !== 'shape' && data.kind !== 'table' && (
        <Handle type="source" position={Position.Right} className="node-handle node-handle--out" style={handleStyle} />
      )}
    </div>
  );
}
