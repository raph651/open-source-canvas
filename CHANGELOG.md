# Changelog

All notable changes to Open Source Canvas. Newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- **The app can connect to a stock ComfyUI again.** It sent a custom request header that ComfyUI's `--enable-cors-header` setup rejects, so the page showed "ComfyUI offline" even with ComfyUI running. The header is now only sent to our own gateway or a remote server.
- **Reactions** now go onto the selected node. Press Reactions and the reaction rides on your cursor: click the canvas or a node to place it (the palette changes which one), or pick an emoji with a node selected to put it on that node's border. Further reactions wrap around the node clockwise.
- **Reactions and comments can be dragged.** A reaction dropped on a node pins to it and follows it when the node moves; dropped on empty canvas it floats free.
- **Comments** open in a small card next to their pin (instead of the top-right panel), including right after you leave one. The pin and the new-comment box can be dragged. A comment left on a node, or dropped on one, pins to it and follows it when the node moves.
- The **Anchor preview** in the inspector shows the whole image or video instead of a cropped one.
- The side panel shows the whole output (image or video) of an output node and of a generation node, at its own shape, instead of a cropped strip.
- A **source clip** on a node (the Recreate template) plays while the pointer is over it, and shows a play icon at the bottom right otherwise. The Recreate prompt now uses `@Source`, `@Product` and `@Avatar` references like the other templates.
- The **output node** shows the whole result at its own shape instead of a cropped one, with its aspect ratio and size in pixels under it (for example `3:4 · 1152 × 1536`). Its bottom-left tag is an image or video icon, and a reference that has a picture no longer has a dashed outline or a Replace button on the node (use Replace reference in the side panel), and the side panel no longer has an "Anchor" heading.
- **Model pickers** only offer models of the node's type: image nodes list image models, video nodes list video models.
- **Resolution, aspect ratio and the number of generations now reach ComfyUI.** Resolution and aspect set the size of the render (image: 512, 768 or 1k as a pixel budget; video: 480p or 720p as the short side). Before, the resolution and the count were ignored. With "Number of generations" above 1, each one is its own render with its own seed, and all of them go to the node's History strip. A resolution the model does not offer falls back to its first one.
- **Edges stay put when you click a node.** The node grows to show its prompt, but its connection points keep their place, so the edges no longer slide down.
- **Panning over a node.** Scrolling or two-finger panning now moves the canvas when the pointer is over a node's prompt box or its controls. The prompt box still scrolls its own text when it has more than fits.
- **The side panel stays closed once you dismiss it.** Clicking or typing in a node no longer reopens it; the expand button at the bottom right of the node brings it back.

### Changed
- **The theme follows your system by default.** The app starts in your system's light or dark setting and switches with it. The theme button cycles Auto, Bright and Night; choosing Bright or Night pins it. A choice saved by an earlier version is kept.
- **Credits are gone.** Nothing is metered when you run locally, so the credit counter, the cost on the Generate button and the "Needs N credits" block are removed. The Generate button and the Models page show a run-time estimate instead: a rough guide for a model until you have run it, then the time of your last render on your machine.
- **The Models page is simpler.** One title, grouped Local and API, the run-time estimate and a single action per model ("Use model", or "Install" when ComfyUI cannot find its files). The developer footer is replaced by a link to the guide for adding another local model.

### Added
- **Adding a local model** is documented in [docs/ADDING_MODELS.md](docs/ADDING_MODELS.md).
- **Reactions**: a palette of 16 (hearts in every colour, 🔥, 👍, 😂 and more). Click a placed reaction to change it; double-click it to remove it.
- **Rename a generation**: double-click its title at the top left of the node, type a name, press Enter. The tag at the bottom left of the preview is now just an image or video icon.
- **Local models**: Wan 2.2 TI2V 5B (text and image to video, up to 720p at 24 fps) and Pika H3 Flex. A local model whose files ComfyUI cannot see shows an INSTALL badge; picking it, or running a node that uses it, opens the files to download, the folder for each, and a Check again button. Pika H3 Flex is listed with the files from ComfyUI's guide (no custom node; ComfyUI 0.43.2 or newer for text to video) but runs from ComfyUI's own Pika H3 Flex template; this app has no workflow for it yet.

## [0.1.1] - 2026-10-30

### Added
- **Online demo on GitHub Pages**, with ComfyUI offline and a "demo only" notice. Canvases, nodes, prompts and `@` references work; Run draws placeholder artwork. Build it with `npm run build:pages`. ([#12](https://github.com/raph651/open-source-canvas/pull/12))
- The online demo lists every model, including the API ones (Seedance 2.5, Seedream 5.0 Pro, ...). ([#13](https://github.com/raph651/open-source-canvas/pull/13))

### Fixed
- The demo notice strip no longer covers the top of the page. ([#13](https://github.com/raph651/open-source-canvas/pull/13))

## [0.1.0] - 2026-10-29

### Added
- Music Video and Marketing Studio templates reference their images with `@` mentions. ([#10](https://github.com/raph651/open-source-canvas/pull/10), [#11](https://github.com/raph651/open-source-canvas/pull/11))
- Variation control, a visible seed and a clearer History strip. ([#7](https://github.com/raph651/open-source-canvas/pull/7))
- A random seed by default, and every render is kept in History. ([#6](https://github.com/raph651/open-source-canvas/pull/6))
- 1080p demo video and a day-theme board in the README. ([#8](https://github.com/raph651/open-source-canvas/pull/8), [#9](https://github.com/raph651/open-source-canvas/pull/9))

### Fixed
- Result polling and output viewing now work when the server needs an access key. ([#5](https://github.com/raph651/open-source-canvas/pull/5))

## Initial release

- Open Source Canvas: an open-source node canvas for image and video generation on ComfyUI.
