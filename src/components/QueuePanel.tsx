import { useEffect, useState } from 'react';
import { Clock, ListOrdered, LoaderCircle, X } from 'lucide-react';
import { liveFor, phaseLabel } from '../lib/comfyLive';
import type { ComfyQueueJob } from '../lib/comfy';
import { useCanvasStore } from '../store/useCanvasStore';
import { useComfyQueue } from '../store/useComfyQueue';
import { useSettingsStore } from '../store/useSettingsStore';

interface QueuePanelProps {
  onClose: () => void;
}

function elapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
}

function jobTitle(job: ComfyQueueJob) {
  return job.meta?.title || (job.fromApp ? 'Canvas render' : 'From ComfyUI');
}

function RunningJob({ job, now }: { job: ComfyQueueJob; now: number }) {
  const cancelJob = useComfyQueue((state) => state.cancelJob);
  useComfyQueue((state) => state.tick); // re-read live progress on every socket message
  const live = liveFor(job.promptId);
  const steps = live?.max && live.max > 1 ? live.max : 0;
  const percent = steps ? Math.min(100, Math.round(((live?.value ?? 0) / steps) * 100)) : undefined;
  const phase = live?.node ? phaseLabel(job.classes[live.node]) : 'Rendering';

  return (
    <article className="queue-job queue-job--running">
      <div className="queue-job__top">
        <LoaderCircle size={13} className="spin" />
        <div>
          <strong>{jobTitle(job)}</strong>
          <span>{job.meta?.model ?? (job.fromApp ? 'ComfyUI' : 'Queued outside this app')}</span>
        </div>
        <button type="button" className="queue-job__cancel" onClick={() => void cancelJob(job.promptId)} title="Cancel this render">
          <X size={13} /> Cancel
        </button>
      </div>
      <div className={percent === undefined ? 'queue-bar queue-bar--busy' : 'queue-bar'}>
        <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
      <div className="queue-job__meta">
        <span>{steps ? `${phase} · step ${live?.value ?? 0} of ${steps}` : phase}</span>
        <span>{live?.startedAt ? elapsed(now - live.startedAt) : ''}</span>
      </div>
    </article>
  );
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const jobs = useComfyQueue((state) => state.jobs);
  const access = useComfyQueue((state) => state.access);
  const live = useComfyQueue((state) => state.live);
  const cancelJob = useComfyQueue((state) => state.cancelJob);
  const cancelAll = useComfyQueue((state) => state.cancelAll);
  const useComfy = useSettingsStore((state) => state.useComfy);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const running = jobs.filter((job) => job.status === 'running');
  const pending = jobs.filter((job) => job.status === 'pending');

  return (
    <aside className="queue-panel" aria-label="ComfyUI queue">
      <div className="versions-panel__head">
        <div>
          <span className="eyebrow">COMFYUI</span>
          <h2>Queue</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close queue">
          <X size={16} />
        </button>
      </div>

      <div className="queue-panel__body">
        {!useComfy ? (
          <div className="versions-empty">
            <ListOrdered size={22} />
            <strong>Demo mode</strong>
            <span>Connect ComfyUI to see its queue.</span>
          </div>
        ) : access === 'offline' ? (
          <div className="versions-empty">
            <ListOrdered size={22} />
            <strong>ComfyUI is not answering</strong>
            <span>If a render was running, ComfyUI may have closed. Start it again and rerun.</span>
          </div>
        ) : access === 'private' ? (
          <div className="versions-empty">
            <ListOrdered size={22} />
            <strong>This server keeps its queue private</strong>
            <span>A shared server does not list other people's jobs. Your renders still show their progress and a cancel button on the node.</span>
          </div>
        ) : !jobs.length ? (
          <div className="versions-empty">
            <ListOrdered size={22} />
            <strong>Nothing in the queue</strong>
            <span>Renders from the canvas and from the ComfyUI page show up here.</span>
          </div>
        ) : (
          <>
            {running.map((job) => <RunningJob key={job.promptId} job={job} now={now} />)}
            {pending.length > 0 && <h3 className="queue-panel__label">Waiting · {pending.length}</h3>}
            {pending.map((job, index) => (
              <article key={job.promptId} className="queue-job">
                <div className="queue-job__top">
                  <span className="queue-job__pos">{index + 1}</span>
                  <div>
                    <strong>{jobTitle(job)}</strong>
                    <span>{job.meta?.model ?? 'Queued outside this app'}</span>
                  </div>
                  <button type="button" className="queue-job__cancel" onClick={() => void cancelJob(job.promptId)} title="Remove from the queue">
                    <X size={13} /> Remove
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </div>

      <div className="versions-panel__foot">
        <span title={live ? 'Step progress comes straight from ComfyUI' : 'No live connection: only the queue is shown'}>
          <Clock size={10} /> {live ? 'Live progress' : 'Queue only'}
        </span>
        {jobs.length > 1 && (
          <button
            type="button"
            className="queue-panel__clear"
            onClick={() => {
              // also stop the canvas run, so it does not queue the nodes that were still waiting their turn
              if (useCanvasStore.getState().running) useCanvasStore.getState().cancelRun();
              void cancelAll();
            }}
          >
            Cancel all
          </button>
        )}
      </div>
    </aside>
  );
}
