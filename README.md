# Cockpit Hardware Probe

A Cockpit plugin that provides a native web UI around [`hw-probe`](https://github.com/linuxhw/hw-probe).

`hw-probe` remains the hardware probing engine. This repository is only the Cockpit shell around it.

## Current status

**v0.6 — Privilege and extended data review**

This version keeps v0.5 upload behavior and does **not** add another privileged command.

Native `hw-probe -all` already requires root. Cockpit administrative access is used only for that native probe, reading its privileged inventory, and native upload. Version detection stays unprivileged.

Drive **Works** / **Failed** can include SMART PASSED/FAILED from a privileged `-all`. This page still does not show SMART attributes, temperatures, or a health score. It does not read `logs/smartctl`, run `-check`, or use `sudo`.

Flatpak probes stay unprivileged. SMART and some hardware details may be missing; the UI says so. This plugin does not change Flatpak sandbox permissions.

Optional **Share Probe** from v0.5 is unchanged: nothing is uploaded unless you confirm `hw-probe -upload`. hw-probe applies its own privacy filtering; this is not complete anonymity.

This version still does **not**:

- upload automatically or retry failed uploads by itself
- run `hw-probe -check` or `-check-extended`
- invent a hardware health score
- install packages, drivers, or firmware
- use `sudo`, `su`, `pkexec`, a shell, curl, or wget
- implement its own HTTP client
- change Flatpak sandbox permissions
- persist consent or previous probe URLs

## Planned workflow

The intended product workflow is:

```text
local probe → inspect summary → optional explicit upload
```

v0.6 covers local probe execution, the hardware summary, conservative findings, optional upload, and an honest privilege/drive-status review.

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

`npm test` runs Vitest unit tests for parsers, providers, spawn timeout, probe execution, inventory, findings, upload, drive status, and UI states.

`make check` is the optional Cockpit VM integration test from the Starter Kit. It is not required for v0.6 unit validation. The plugin does not run `hw-probe -check`.

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
   - There is no `-check` and no health score
   - **Drive status** lists `type=disk` devices using the same Status field (Works / Detected / Failed), not SMART attributes
   - Native completeness copy says administrative access was used because hw-probe itself requires root — not because this plugin added extra commands
   - **Hardware Findings** loads from the same local probe (not a second file format)
   - Devices with status `works` are counted as Works, not as “healthy”
   - Devices with status `detected` are **not** called broken, unhealthy, warning, or critical
   - Low-level PCI bridges/controllers with `detected` stay under **Low-level devices without confirmed operability**, not as danger cards
   - Unrecognized statuses, if any, are listed separately from reported problems
   - Counts are integers (Works / Detected / …), never a percentage or “Hardware Health”
   - **Share Probe** is below the local summary. Opening it does not upload.

5. Click **Run Hardware Probe**. Native probes request Cockpit administrative access and run `-all` without `-upload`. After success, the summary should refresh from the two files, and Hardware Findings should refresh from that same inventory. Compare with a privileged terminal run only for validation:

   ```bash
   hw-probe -all
   sudo -E ~/.local/bin/hw-probe -all
   ```

   The plugin does not embed `sudo`. Confirm the command line is not `hw-probe -check` and does not include `-upload`. A successful native privileged run stores probe data under `/root/HW_PROBE`.

   If Cockpit denies administrative access, the page reports that administrative access is required. That is not a generic `hw-probe` command failure. If the probe command succeeds but the inventory files cannot be parsed, that is shown as an inventory-read failure, not “Hardware probe failed.”

6. Click **Refresh** only after the probe is idle. Refresh re-runs version detection and re-reads the existing inventory; it does not start `hw-probe -all` or `-check` by itself.

7. Confirm no network/upload request occurs until you explicitly confirm **Upload Probe**. Use browser developer tools → Network, or `journalctl` / Cockpit logs. Capability detection, **Run Hardware Probe**, parsing, and findings never pass `-upload`.

8. Do **not** expect this plugin to run `hw-probe -check`. Those commands remain out of scope.

9. **Upload checklist (v0.5)** — only after you intend to share a probe with the public linux-hardware.org database:

   1. Opening Hardware Probe causes no upload (no unexpected network from this plugin).
   2. **Run Hardware Probe** still runs `-all` only and does not upload.
   3. Hardware Summary and Hardware Findings still load.
   4. **Share Probe** is below the local summary, not the primary CTA.
   5. **Upload Probe** opens confirmation and does not upload yet.
   6. Confirmation mentions linux-hardware.org, hashed identifiers, and that upload cannot be undone here. It must not claim complete anonymity.
   7. **Cancel** performs no upload.
   8. Confirm runs one `hw-probe -upload` (not `-all -upload`) and requests administrative access for native installs.
   9. Success shows **View uploaded probe** only for `https://linux-hardware.org/?probe=…` if hw-probe printed one.
   10. That link opens the external site only when you click it.
   11. The local summary remains on the page after upload (hw-probe may delete LATEST; Refresh may then show no local probe).
   12. A failed upload does not mark the local probe as failed.
   13. Refresh does not repeat the upload.
   14. **Try again** asks for confirmation again.

10. **Privilege and drive-status checklist (v0.6)** — this milestone does **not** add another privileged command:

    1. Opening Hardware Probe still does not prompt for administrative access until a native inventory read, **Run Hardware Probe**, or native **Upload Probe**.
    2. Native idle copy says Hardware Probe needs extra privilege because hw-probe itself requires root.
    3. After a native probe, **Drive status** appears between **Hardware Summary** and **Hardware Findings**.
    4. Disk Works / Failed can match SMART PASSED/FAILED from that privileged `-all`. There is still no SMART attribute table, temperature, or health score.
    5. The page does not read `logs/smartctl`, does not run `-check`, and does not use `sudo`.
    6. If a Flatpak install is used: **Run Hardware Probe** and inventory load stay unprivileged; completeness copy warns that SMART-backed drive health may be missing.
    7. Flatpak still has no “run as root” or `flatpak override` action in this plugin.

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
