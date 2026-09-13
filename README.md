# Cockpit Hardware Probe

A Cockpit plugin that provides a native web UI around [`hw-probe`](https://github.com/linuxhw/hw-probe).

`hw-probe` remains the hardware probing engine. This repository is only the Cockpit shell around it.

## Current status

**v0.1 — Capability Detection and Plugin Shell**

This version provides:

- a Cockpit plugin with one **Hardware Probe** navigation item
- detection of whether the `hw-probe` executable is available
- installed version detection via `hw-probe -dumpversion`

This version does **not**:

- run a local hardware probe
- parse hardware inventory
- upload anything
- contact linux-hardware.org
- install packages
- escalate privileges

Nothing is uploaded.

## Planned workflow

The intended product workflow is:

```text
local probe → inspect summary → optional explicit upload
```

That workflow is not implemented yet. v0.1 only answers whether `hw-probe` is installed and usable.

## Package name

On Fedora and Bazzite, the tool package name is **`hw-probe`**. Fedora installs the executable at `/usr/bin/hw-probe`.

The plugin also detects a normal per-user install at `~/.local/bin/hw-probe` for the authenticated Cockpit user. Cockpit's process PATH is not the same as an interactive login shell, so a tool that works in the terminal can still be invisible to `cockpit.spawn(["hw-probe", ...])` until that user-local path is tried.

Detection order:

1. `hw-probe` via Cockpit's normal process lookup
2. if that executable is not found: `<authenticated-user-home>/.local/bin/hw-probe`

Arbitrary custom install paths are not supported. Do not edit Cockpit's PATH as a workaround.

This plugin does not install that package. If `hw-probe` is missing from both locations, the page reports that it is unavailable.

## Development

### Dependencies

On Fedora:

```bash
sudo dnf install gettext nodejs npm make
```

On Debian/Ubuntu:

```bash
sudo apt install gettext nodejs npm make
```

Install JavaScript dependencies and build:

```bash
make
```

`make` checks out Cockpit shared library files into `pkg/lib`, installs npm packages, and builds `dist/`.

### Build

```bash
make
```

Production bundle:

```bash
NODE_ENV=production make
```

### Install a development build into Cockpit

```bash
make devel-install
```

This links `dist/` into `~/.local/share/cockpit/hardware-probe`. Reload the Cockpit page in the browser after rebuilding.

Uninstall the development link:

```bash
make devel-uninstall
```

### Tests and checks

```bash
npx tsc --noEmit
npm run eslint
npm run stylelint
npm test
NODE_ENV=production npm run build
```

`npm test` runs Vitest unit tests for the parser, provider, spawn timeout, and UI states.

`make check` is the optional Cockpit VM integration test from the Starter Kit. It is not required for v0.1 unit validation.

## Real-host verification (Bazzite / Fedora)

1. Build and install the development plugin:

   ```bash
   make
   make devel-install
   ```

2. Log into Cockpit and open **Hardware Probe**.

3. If `hw-probe` is installed system-wide **or** at `~/.local/bin/hw-probe` for the logged-in user, compare the shown version with:

   ```bash
   hw-probe -dumpversion
   ```

   They should match after trimming whitespace. A user-local binary should be detected even when Cockpit's process PATH does not include `~/.local/bin`.

4. Click **Refresh**. Only version detection should run again. No probe files should appear, and no network upload should occur.

5. Optional missing-tool check: temporarily hide `hw-probe` from `PATH` for the Cockpit session, or test on a host without the package. The page should say that `hw-probe` is not installed or cannot be found.

On Fedora:

```bash
sudo dnf install hw-probe
```

On Bazzite, the same Fedora package can be layered if it is not already present:

```bash
rpm-ostree install hw-probe
```

Do not use this plugin to install the package; v0.1 has no install action.

## License

LGPL-2.1-or-later, following the Cockpit Starter Kit.
