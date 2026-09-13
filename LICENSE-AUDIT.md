# License audit (v1.0)

This plugin is **LGPL-2.1-or-later**.

| Component | License | Notes |
| --- | --- | --- |
| This repository (`src/`, `preview/`, packaging templates, docs) | LGPL-2.1-or-later | SPDX headers; [LICENSE](LICENSE) is the FSF LGPL-2.1 text. `or later` is the project grant. |
| Cockpit `pkg/lib` (build checkout, not stored in git) | LGPL-2.1-or-later | Required to build; same license family as Cockpit. |
| Production JS bundle legal comments | various, generated | `dist/index.js.LEGAL.txt` after `NODE_ENV=production` build; shipped as `%license` in the RPM. |
| React, react-dom, scheduler | MIT | Bundled. |
| PatternFly | MIT | Bundled. |
| tabbable, focus-trap | MIT | Bundled with PatternFly focus handling. |
| esbuild, TypeScript, Vitest, ESLint, Stylelint | various OSI | Build/test only; not shipped in the RPM payload beyond the prebuilt `dist/`. |
| `hw-probe` | LGPL-2.1 (upstream) | **Not bundled.** RPM `Recommends: hw-probe`. |

There is no proprietary runtime dependency. The plugin does not vendor linux-hardware.org client code; upload is `hw-probe -upload`.

AppStream metadata is CC0-1.0 (`org.cockpit_project.hardware_probe.metainfo.xml`).
