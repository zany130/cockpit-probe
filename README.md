# Cockpit Hardware Probe

A Cockpit plugin that provides a native web UI around [`hw-probe`](https://github.com/linuxhw/hw-probe).

`hw-probe` remains the hardware probing engine. This repository is only the Cockpit shell around it.

## Current status

**v0.4 — Hardware Findings**

This version provides everything in v0.3, plus a **Hardware Findings** section derived from the same local `devices` statuses:

- counts of hw-probe statuses (Works, Detected, and others when present)
- devices hw-probe marked `failed` or `malfunc`, with the upstream meaning quoted conservatively
- user-facing devices with status `detected` listed as unconfirmed operability, not as failures
- low-level bridges/controllers with `detected` kept under a secondary expandable list
- unknown future statuses shown as unrecognized, not as failures

`detected` means hw-probe has not confirmed operability. It is **not** automatically a warning, a break, or poor health.

This version does **not**:

- upload anything or contact linux-hardware.org
- run `hw-probe -check` or `-check-extended` (those mix live tests and benchmarks; see IMPLEMENTATION.md §4.4)
- invent a hardware health score or percentage
- install packages, drivers, or firmware
- offer repair/remediation actions
- use `sudo`, `su`, `pkexec`, or a shell
- change Flatpak sandbox permissions
- automatically run `hw-probe -all` or `-check` on page load

Version detection runs as the authenticated Cockpit user. Native `hw-probe` 1.6 requires root for the actual probe, so **Run Hardware Probe** uses Cockpit's documented privileged spawn (`superuser: "require"`) only after that button is pressed. Reading an existing native inventory uses Cockpit `cockpit.file` with `superuser: "require"` on two trusted paths:

- `/root/HW_PROBE/LATEST/hw.info/host`
- `/root/HW_PROBE/LATEST/hw.info/devices`

Those files are an internal hw-probe format (not a documented stable public API). Findings reuse the v0.3 parsed `HardwareDevice[]`; they do not reparse a second file format.

Device statuses remain **Works**, **Detected**, **Failed**, **Malfunction**, and so on as hw-probe reported them. Absence of a problem status is not proof that the machine is healthy.

The official Flatpak still uses the v0.3 unprivileged inventory path. Passive findings work on that same inventory. Active `-check` is not implemented, so Flatpak check/sandbox gaps are not papered over with `flatpak override`.

Nothing is uploaded. Running a local hardware probe does not upload data. Uploading to linux-hardware.org is a separate explicit action (not in this version).

## Planned workflow

The intended product workflow is:

```text
local probe → inspect summary → optional explicit upload
```

v0.4 covers local probe execution, the hardware summary, and conservative findings from probe statuses. Optional upload comes later.

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

`npm test` runs Vitest unit tests for parsers, providers, spawn timeout, probe execution, inventory, and UI states.

`make check` is the optional Cockpit VM integration test from the Starter Kit. It is not required for v0.4 unit validation. The plugin does not run `hw-probe -check`.

## Real-host verification (Bazzite / Fedora)

This plugin was implemented and unit-tested in a Chromebook Linux container. It has **not** been marked as passing the Bazzite real-host gate from this environment.

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

   They should match after trimming whitespace. A user-local binary should be detected even when Cockpit's process PATH does not include `~/.local/bin`. If both a native install and the Flatpak are present, the native version is the one shown.

4. If `/root/HW_PROBE/LATEST/hw.info/{host,devices}` already exist from a previous privileged probe, the Hardware Summary should load after administrative access is granted for the file read. Confirm:

   - System model matches the host `model` (for example ASRock B650M Pro RS WiFi)
   - CPU appears **once** at summary level, not 12 times
   - Physical core count is **6**
   - Total memory is the converted `ram_total` from `/proc/meminfo` KiB (32414356 KiB displays as **30.9 GiB**, which is the kernel MemTotal, not a marketing “32 GB”)
   - Two physical RAM modules remain listed
   - GPU vendor/device are shown honestly (VGA compatible controller) with driver **amdgpu**
   - Four physical disks appear; PCI SATA/NVMe **controllers are not counted as disks**
   - Two network adapters appear
   - The host `hwaddr` value is **nowhere** in the UI
   - Low-level devices remain available under **Devices** / **Other devices**
   - There is no Upload action, no `-check`, and no health score
   - **Hardware Findings** loads from the same local probe (not a second file format)
   - Devices with status `works` are counted as Works, not as “healthy”
   - Devices with status `detected` are **not** called broken, unhealthy, warning, or critical
   - Low-level PCI bridges/controllers with `detected` stay under **Low-level devices without confirmed operability**, not as danger cards
   - Unrecognized statuses, if any, are listed separately from reported problems
   - Counts are integers (Works / Detected / …), never a percentage or “Hardware Health”

5. Click **Run Hardware Probe**. Native probes request Cockpit administrative access and run `-all` without `-upload`. After success, the summary should refresh from the two files, and Hardware Findings should refresh from that same inventory. Compare with a privileged terminal run only for validation:

   ```bash
   hw-probe -all
   sudo -E ~/.local/bin/hw-probe -all
   ```

   The plugin does not embed `sudo`. Confirm the command line is not `hw-probe -check` and does not include `-upload`. A successful native privileged run stores probe data under `/root/HW_PROBE`.

   If Cockpit denies administrative access, the page reports that administrative access is required. That is not a generic `hw-probe` command failure. If the probe command succeeds but the inventory files cannot be parsed, that is shown as an inventory-read failure, not “Hardware probe failed.”

6. Click **Refresh** only after the probe is idle. Refresh re-runs version detection and re-reads the existing inventory; it does not start `hw-probe -all` or `-check` by itself.

7. Confirm no network/upload request occurs while using the page (browser developer tools → Network, or `journalctl` / Cockpit logs). The plugin has no Upload control in this version.

8. Do **not** run `hw-probe -check` or `-check-extended` from this plugin. Those commands are active tests plus benchmarks; v0.4 does not expose them. If you want to inspect what `-check` would do on this host, that is a manual upstream experiment, not plugin acceptance.

On Fedora:

```bash
sudo dnf install hw-probe
```

On Bazzite, the same Fedora package can be layered if it is not already present:

```bash
rpm-ostree install hw-probe
```

Do not use this plugin to install the package.

## License

LGPL-2.1-or-later, following the Cockpit Starter Kit.
