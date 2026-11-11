# Desktop preset overlay provenance

`presets.patch.yml` is adapted from `@deepseek-ai/dsh-web-app` distributed in
DeepSeek Harness desktop **0.2.2-rc.1**, build
`c59d10aff167ad7eefead4b3a9082fb57c8fbfe8`.

Upstream repository: https://github.com/deepseek-ai/deepseek-harness
Upstream package directory: `packages/bundle/web-app`

The installed source package provides:
- `presets/minimal.patch.yml`: complete minimal preset content.
- `presets/standard.patch.yml`: most standard preset content.
- `cordis.patch.yml`: host-plane agent-tool disabling content.

Local adaptation combines the selected contents into one standalone overlay
for the bridge SDK profile instead of loading the full desktop/Web host
composition. It retains the minimal and standard agent presets and host-tool
disabling rules; it is not a verbatim copy of the complete upstream package.
The bridge separately supplies runtime-specific insertions and compatibility
handling in its source modules. This version-sensitive adaptation is not an
upstream-supported integration or a claim of compatibility with later builds.

Copyright (c) 2026 DeepSeek. Upstream licenses these contents under MIT.
The adjacent `LICENSE` contains the full, unmodified license notice copied
from the installed `@deepseek-ai/dsh-web-app/LICENSE` file. Preserve that notice
when redistributing this overlay or substantial portions of it.
