# Cockpit Hardware Probe

A Cockpit plugin that provides a native web UI around [`hw-probe`](https://github.com/linuxhw/hw-probe).

`hw-probe` remains the hardware probing engine. This repository is only the Cockpit shell around it.

## Current status

**v0.2 — Local Probe Execution**

This version provides:

- a Cockpit plugin with one **Hardware Probe** navigation item
- detection of whether `hw-probe` is available from PATH, `~/.local/bin`, or the official Flatpak
- installed version detection via `hw-probe -dumpversion`
- a manual **Run Hardware Probe** action that runs a local probe
- running, success, failure, timeout, cancelled, and administrative-access-required states
- targeted Cancel of only the process this page started

This version does **not**:

- parse hardware inventory or findings
- upload anything
- contact linux-hardware.org
- install packages
- use `sudo`, `su`, `pkexec`, or a shell
- change Flatpak sandbox permissions
- request administrative access on page load, refresh, or version detection

Version detection runs as the authenticated Cockpit user. Native `hw-probe` 1.6 requires root for the actual probe, so **Run Hardware Probe** uses Cockpit's documented privileged spawn (`superuser: "require"`) only after that button is pressed. Probe data is stored by native `hw-probe` under `/root/HW_PROBE`. The official Flatpak is still started as the signed-in user; sandboxing can reduce hardware visibility. Upload is planned as a later explicit milestone.

Nothing is uploaded. Running a local hardware probe does not upload data. Uploading to linux-hardware.org is a separate explicit action (not in this version).

## Planned workflow

The intended product workflow is:

```text
local probe → inspect summary → optional explicit upload
```

That workflow is not fully implemented yet. v0.2 can run a local probe. Inventory parsing and optional upload come later.

## Package name

On Fedora and Bazzite, the tool package name is **`hw-probe`**. Fedora installs the executable at `/usr/bin/hw-probe`.

The plugin also detects a normal per-user install at `~/.local/bin/hw-probe` for the authenticated Cockpit user, and the official Flatpak app `org.linux_hardware.hw-probe`. Cockpit's process PATH is not the same as an interactive login shell, so a tool that works in the terminal can still be invisible to `cockpit.spawn(["hw-probe", ...])` until a later discovery step is tried.

Detection order:

1. `hw-probe` via Cockpit's normal process lookup
2. if that executable is not found: `<authenticated-user-home>/.local/bin/hw-probe`
3. if that executable is not found: the official Flatpak, invoked as `flatpak run org.linux_hardware.hw-probe`

A normal native installation is preferred when both native and Flatpak copies exist. Flatpak is not treated as a filesystem executable path. The UI reports the same available / version / error states regardless of source.

Arbitrary custom install paths are not supported. Do not edit Cockpit's PATH as a workaround.

This plugin does not install the RPM or the Flatpak. If `hw-probe` is missing from PATH, `~/.local/bin`, and the official Flatpak, the page reports that it is unavailable. If the Flatpak is installed but fails to launch, that is reported as a detection error rather than as a missing install.

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

`npm test` runs Vitest unit tests for the parser, providers, spawn timeout, probe execution, and UI states.

`make check` is the optional Cockpit VM integration test from the Starter Kit. It is not required for v0.2 unit validation.

## Real-host verification (Bazzite / Fedora)

1. Build and install the development plugin:

   ```bash
   make
   make devel-install
   ```

2. Log into Cockpit and open **Hardware Probe**.

3. If `hw-probe` is installed, compare the shown version with the matching invocation:

   ```bash
   hw-probe -dumpversion
   ~/.local/bin/hw-probe -dumpversion
   flatpak run org.linux_hardware.hw-probe -dumpversion
   ```

   They should match after trimming whitespace. A user-local binary should be detected even when Cockpit's process PATH does not include `~/.local/bin`. An official Flatpak install should be detected after PATH and user-local lookups fail. If both a native install and the Flatpak are present, the native version is the one shown.

4. Click **Run Hardware Probe**. Native probes request Cockpit administrative access at that moment (not during page load or version detection) and run the documented local operation `-all` without `-upload`. Compare with a privileged terminal run only for validation:

   ```bash
   hw-probe -all
   sudo -E ~/.local/bin/hw-probe -all
   flatpak run org.linux_hardware.hw-probe -all
   ```

   Use the invocation that matches the installation Cockpit detected. The plugin does not embed `sudo`; Cockpit's privileged spawn is the production path. The command must not include `-upload`. A successful native privileged run stores probe data under `/root/HW_PROBE` and typically prints `Local probe path: /root/HW_PROBE/LATEST/hw.info`. A Flatpak run is unprivileged in this version and may see less hardware because of sandboxing.

   If Cockpit denies administrative access, the page reports that administrative access is required. That is not a generic `hw-probe` command failure.

5. Click **Refresh** only after the probe is idle. Refresh re-runs version detection, not a probe.

6. Optional missing-tool check: temporarily hide `hw-probe` from `PATH` for the Cockpit session, or test on a host without the package. The page should say that `hw-probe` is not installed or cannot be found.

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
