# How Open Source Canvas uses ComfyUI

Open Source Canvas is a **custom canvas front-end over the ComfyUI API**. It is not a ComfyUI UI clone, and it does not reimplement diffusion. Every local render is a ComfyUI workflow submitted to a running ComfyUI server.

## Request flow

```text
Canvas model node
  → ModelRouter           src/lib/providers.ts
  → ComfyProvider         src/lib/comfyProvider.ts
  → ComfyClient           src/lib/comfy.ts
      POST /prompt        API-format workflow JSON, with this tab's client_id and the node's name
      GET  /history/:id   poll execution status
      GET  /queue         what is running and waiting (the Queue panel, the node's place in line)
      WS   /ws            live step progress for this tab's jobs     src/lib/comfyLive.ts
      GET  /view          fetch the output image/video
      POST /upload/image  first frame for LTX image-to-video
      POST /queue         {"delete": [id]} takes a waiting job off the queue
      POST /interrupt     {"prompt_id": id} stops that job if it is the one running
```

The queue, live progress and cancel are described in [Queue, progress and cancel](#queue-progress-and-cancel) below.

## Workflows

All three are API-format ComfyUI graphs:

| Workflow | Builder | Nodes |
|---|---|---|
| SD-Turbo text-to-image | `sdTurboWorkflow()` | CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, SaveImage |
| SD-Turbo image-to-image | `sdTurboImg2ImgWorkflow()` | LoadImage, VAEEncode, KSampler (denoise 0.55), VAEDecode, SaveImage |
| LTX text-to-video | `ltxVideoWorkflow()` | CLIPLoader, CheckpointLoaderSimple, EmptyLTXVLatentVideo, LTXVScheduler, SamplerCustom, VAEDecode, CreateVideo, SaveVideo |
| SD-Turbo image-to-image | `sdTurboImg2ImgWorkflow()` | LoadImage, VAEEncode, KSampler (denoise 0.55), VAEDecode, SaveImage |
| LTX image-to-video | `ltxImageToVideoWorkflow()` | LoadImage, LTXVImgToVideo, LTXVScheduler, SamplerCustom, VAEDecode, CreateVideo, SaveVideo |

Source: `src/lib/comfyWorkflows.ts`. Static reference copies: `workflows/*.api.json`.

## Queue, progress and cancel

ComfyUI renders one job at a time and keeps the rest in a queue. The canvas shows that queue, the step a render is on, and lets you stop any job, the way the ComfyUI page does.

### What you see

- **Queue** button in the canvas top bar. It spins while ComfyUI is rendering and shows how many jobs are running or waiting.
- **Queue panel** (click the button):
  - the running job: the node's name, the model, what it is doing (`Loading models`, `Reading the prompt`, `Rendering · step 12 of 20`, `Decoding`, `Saving`), a progress bar, the time since it started, and **Cancel**;
  - the waiting jobs, in order, each with **Remove**;
  - **Cancel all** (when there is more than one job): stops the canvas run and every job, waiting ones first so ComfyUI does not start the next one;
  - at the bottom, **Live progress** when step counts are coming in, or **Queue only** when they are not (see [Shared servers](#shared-servers)).
  Jobs queued from the ComfyUI page or another tool are listed too, as **From ComfyUI**.
- **On the node** while it renders: a progress bar with the same text (`Waiting in queue · 2 ahead`, `Rendering · step 5 of 8`…) and an **×** to cancel just that node. A cancelled node goes back to idle with a "render cancelled" toast; it is not marked as failed.

### How it works

| Piece | File | What it does |
|---|---|---|
| Session id | `src/lib/comfyLive.ts` | One `client_id` per page load. Every job is queued with it, so ComfyUI sends that job's progress to this tab. |
| Job name | `src/lib/comfy.ts` (`queue`) | Each job carries `extra_data.osc = { title, model, nodeId }`. ComfyUI keeps it in the queue entry, so the panel can name the job and find its node. |
| Live feed | `src/lib/comfyLive.ts` | One WebSocket to `/ws?clientId=…`, reopened after a drop. It reads `execution_start`, `executing` (which node), `progress` (step `value` of `max`) and `execution_interrupted`. Binary preview frames are ignored. |
| Queue | `src/store/useComfyQueue.ts` | `useComfyQueueSync()` (mounted once in the editor) reads `GET /queue` every 1.5 s while ComfyUI is connected. |
| A render | `src/lib/comfy.ts` (`run`) | Polls `/history/:id` every 800 ms as before. In between it reports the job's place in the queue, or its current node and step from the live feed. The node's class name becomes a short phase label (`phaseLabel()`). |
| Node progress | `src/store/useComfyQueue.ts` (`nodeProgress`) | What each rendering node shows. Kept out of the board, so it is never saved, exported or synced to a room. |
| UI | `src/components/QueuePanel.tsx`, `CanvasNodeView.tsx` | The panel and the strip on the node. |

### Cancelling

- Every rendering node gets its own `AbortController` (`beginNodeRun()` in `useComfyQueue.ts`, called from `run()` in `useCanvasStore.ts`). Cancelling one node does not stop the others in the same run.
- On abort, `ComfyClient.cancelPrompt(id)` sends `POST /queue {"delete": [id]}` (for a waiting job) and then `POST /interrupt {"prompt_id": id}` (for the running one). The interrupt names the job, so it never stops someone else's render. A failed delete does not skip the interrupt.
- **Cancel** in the panel on a job from this tab goes through its node, so the node resets. On any other job it calls `cancelPrompt` directly.
- A job interrupted from the ComfyUI page shows up in `/history` with `execution_interrupted`; the canvas treats that as a cancel, not an error.

### When something goes wrong

- **ComfyUI closes or crashes mid-render.** If ComfyUI cannot be reached for 20 seconds, the node fails with "Lost the connection to ComfyUI during the render". Before, it kept spinning until the 10-minute timeout.
- **The job disappears.** If a job is in neither the queue nor the history three checks in a row (about 7 s), it was removed elsewhere or ComfyUI restarted, and the node says so.
- **A node in the workflow fails.** The node shows ComfyUI's own message (for example `KSampler: CUDA out of memory`), taken from `execution_error`, instead of "check the ComfyUI console".
- **Long renders.** The timeout is now 90 minutes (was 10), so a big video model is not abandoned while ComfyUI is still working on it. A dead ComfyUI is caught by the checks above, not by the timeout.

### Shared servers

The shared-server proxy (`server/app.mjs`) keeps other people's jobs private: it refuses `GET /queue`, `POST /queue` and WebSockets. The canvas handles that:

- the panel says **This server keeps its queue private** and asks again only every 30 s;
- the socket stops retrying after three failed attempts, and the footer reads **Queue only**;
- nodes still show that they are queued or rendering (without step counts) and can still be cancelled, through `POST /interrupt` with the job's id.

With an access key set in the ComfyUI panel, no socket is opened (a browser WebSocket cannot send the key).

### Limits

- Step counts come from nodes that report progress (samplers, some decoders). Loaders and encoders show their phase without a count.
- Jobs queued by other clients get step counts only when ComfyUI broadcasts their progress (jobs queued without a `client_id`).
- `POST /interrupt` with a `prompt_id` needs a recent ComfyUI. An older one ignores the id and stops whatever is running.

## Proof it is live

- The top-right badge reads **ComfyUI 0.42.0** when connected.
- `GET http://127.0.0.1:8188/system_stats` returns the MPS device and 24 GB unified memory.
- Image renders return from `/history` and appear via `/view`.
- LTX image-to-video uploads the upstream still to `/upload/image`, then submits `LTXVImgToVideo`.
- The app refuses to run local models if ComfyUI is offline instead of pretending.

## What is not ComfyUI

The **API seats** — Seedance 2.0/2.5, LTX-2.3, Nano Banana Pro, Soul 2.0 — are optional external wrappers. They are marked `runtime: 'api'`, route through `src/lib/modelWrappers.ts`, and fail with “API wrapper required” until connected. They are not part of the ComfyUI demo path.

The mock provider is only used when **Use ComfyUI** is switched off. With the default settings, local models run on ComfyUI.

## Contest eligibility

The rules allow the **Comfy API, Comfy Router, and/or the Comfy SDK**. A custom canvas calling the local Comfy API is eligible; the canvas does not have to be ComfyUI’s node editor. The submission should demonstrate:

1. ComfyUI running locally.
2. A still generated through `/prompt`.
3. An image-to-video clip generated through `LTXVImgToVideo`.
4. The workflow JSON in the repo.
5. The README setup steps and MIT license.

For an unambiguous judge experience, use **local models only** in the demo and hide or disable the API seats until the wrappers are connected.

## Verify in one minute

```bash
curl http://127.0.0.1:8188/system_stats
```

In the app, the badge must say `ComfyUI 0.42.0`. Then run a model node and check ComfyUI’s queue/history; the same prompt ID should appear in `/history`.
