# Setup and reference

Everything the [README](../README.md) leaves out: installing ComfyUI by hand (any recent build, 0.40 or newer recommended), connecting to a server, hosted API models, configuration, and how the repository is laid out.

## Install ComfyUI by hand

If you do not use `./scripts/setup-comfyui.sh`:

**Option B, by hand.**

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git comfyui
cd comfyui
python3 -m venv .venv          # Python 3.10 to 3.12
source .venv/bin/activate
pip install -r requirements.txt
```

Install PyTorch for your hardware first if the requirements step does not pick it up
(see the [ComfyUI install guide](https://github.com/comfyanonymous/ComfyUI#installing)).

Download the models the app uses by default (Option A already did this):

| File | Put it in | Used for |
|---|---|---|
| `sd_turbo.safetensors` ([stabilityai/sd-turbo](https://huggingface.co/stabilityai/sd-turbo)) | `ComfyUI/models/checkpoints/` | images |
| `ltxv-2b-0.9.8-distilled-fp8.safetensors` ([Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video)) | `ComfyUI/models/checkpoints/` | video |
| `t5xxl_fp8_e4m3fn.safetensors` ([comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)) | `ComfyUI/models/text_encoders/` | the text encoder for LTX |

Start ComfyUI with CORS enabled so the browser app may call it:

```bash
python main.py --enable-cors-header
```

ComfyUI listens on `http://127.0.0.1:8188`. Open that address once to confirm it loads.

## Connecting ComfyUI

The app only needs one thing: the address of a ComfyUI server.

| Setup | What to do |
|---|---|
| Same machine, dev server (`npm run dev`) | Start ComfyUI with `--enable-cors-header`. Keep the default `http://127.0.0.1:8188`. |
| Same machine, built app (`node server/app.mjs`) | Nothing extra. The server proxies `/comfy/*` to ComfyUI, so the browser never talks to it directly. |
| ComfyUI on another machine | Set `COMFY_URL` for the server (below), or change the base URL in the ComfyUI panel. Use HTTPS if it leaves your network. |

Settings in the ComfyUI panel (stored in your browser): base URL, optional API key, the image checkpoint, the video
checkpoint and the text encoder file names, and the **Fast local video** switch.

Server environment variables (`server/app.mjs`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4173` | port to listen on |
| `HOST` | `127.0.0.1` | bind address |
| `COMFY_URL` | `http://127.0.0.1:8188` | the ComfyUI server to proxy |
| `COMFY_API_KEY` | none | added to proxied requests when ComfyUI sits behind a gateway that needs it |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | none | Cloudflare Access service token, if ComfyUI is behind Access |

The proxy keeps each visitor's outputs separate (outputs are written under a per-client folder) and refuses queue
listings, so a shared deployment does not leak other people's renders.

How a render flows through the code is described in [docs/COMFYUI_RUNTIME.md](docs/COMFYUI_RUNTIME.md). The
workflows themselves are plain ComfyUI API-format JSON in `workflows/`, built in `src/lib/comfyWorkflows.ts`.

## API models

Some models are not run locally. ComfyUI can call them for you through its **partner nodes**, which run on the
provider's servers and bill your Comfy account credits:

- LTX-2.5 (Fast and Pro), Seedream 5.0 Pro, Nano Banana Pro, Seedance 2.0 and 2.5, Kling, MiniMax H3, Veo, FLUX and more

To use them from ComfyUI:

1. Create a ComfyUI account API key at [platform.comfy.org](https://platform.comfy.org) (API Keys, then New). Add credits.
2. Send your workflow to ComfyUI with the key in `extra_data.api_key_comfy_org` (see the
   [API key integration guide](https://docs.comfy.org/development/comfyui-server/api-key-integration)), or log in
   inside the ComfyUI interface.

**Status in this app:** these models appear in the model list and in the templates, and the example media in this
repo was made with LTX-2.5 and Seedream 5.0 Pro through those nodes. Generating from the canvas with an API model
is not wired yet: it fails with a clear "wrapper required" message instead of faking a render. To add one, register
a wrapper in `src/lib/modelWrappers.ts` that submits the matching partner-node workflow. Keep keys on a server:
never put a key in the browser bundle.

## Project layout

```text
src/
  components/    studio home, canvas editor, nodes, inspector, panels
  lib/           ComfyUI client and provider, workflow builders, model router
  store/         canvas, settings and collaboration state
  data.ts        model catalog and templates
server/
  app.mjs        serves the built app, proxies /comfy, isolates per-visitor outputs
  room.mjs       optional collaboration room
workflows/       API-format ComfyUI graphs (SD-Turbo, LTX)
public/          template media and images
scripts/         setup-comfyui.sh: installs ComfyUI and the models; pages-extras.mjs: the GitHub Pages demo build
deploy/          running it for other people behind a Cloudflare Tunnel with Access
docs/            how ComfyUI is used, and how to add a local model (ADDING_MODELS.md)
CHANGELOG.md     what changed in each version
```

A board is plain JSON: `{ id, title, updatedAt, nodes, edges }`. Boards autosave to your browser; use the canvas menu to
export one.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 4173 |
| `npm run build` | type check and production build into `dist/` |
| `npm run preview` | preview the production build |
| `npm run build:pages` | static demo build for GitHub Pages (no ComfyUI, mock provider, notice strip); set `VITE_BASE=/<repo>/` |
| `node server/app.mjs` | serve `dist/` and proxy ComfyUI |
| `npm run room` | collaboration room on port 4180 (in-memory, last write wins, no auth: demo only) |

## Sharing it with other people

`deploy/README.md` shows how to publish a running copy behind Cloudflare Tunnel and Cloudflare Access, keeping
ComfyUI private on your machine.
