# Cockpit Hardware Probe

A Cockpit plugin that provides a native web UI around [`hw-probe`](https://github.com/linuxhw/hw-probe).

`hw-probe` remains the hardware probing engine. This repository is only the Cockpit shell around it.

**Running a local hardware probe does not upload data. Uploading to linux-hardware.org is a separate explicit action.**

## What it does

On a host where `hw-probe` is installed, the **Hardware Probe** page can:

- detect a native PATH install, `~/.local/bin/hw-probe`, or the official Flatpak `org.linux_hardware.hw-probe`
- run a local `hw-probe -all` (native probes use Cockpit administrative access because hw-probe itself requires root)
- show a hardware summary and conservative findings from `/root/HW_PROBE/LATEST/hw.info/{host,devices}` (or the Flatpak data directory)
- optionally upload the current local probe with `hw-probe -upload` after confirmation
- open the returned `https://linux-hardware.org/?probe=…` URL when hw-probe prints one

After a successful upload, hw-probe deletes its local `LATEST` copy. The page then shows that no local probe is available yet, and keeps this session’s public URL.

## What it does not do

- upload automatically, retry failed uploads, or persist previous probe URLs
- run `hw-probe -check` or `-check-extended`
- invent a hardware health score or support percentage
- install packages, drivers, or firmware
- use `sudo`, `su`, `pkexec`, a shell, curl, or wget
- implement its own HTTP client
- change Flatpak sandbox permissions
- keep probe history, schedules, or fleet views

Do not claim complete anonymity. Upstream filters usernames, hostnames, IP addresses, MAC addresses, UUIDs, and serial numbers from uploads, but a 32-byte prefix of a salted SHA512 hash of MAC addresses and serial numbers is still sent so the public database can tell computers and drives apart. Filtering can fail in some edge cases.

## Requirements

- [Cockpit](https://cockpit-project.org/) 336 or later
- `hw-probe` on the host you inspect (RPM, `~/.local/bin/hw-probe`, or the official Flatpak)

The plugin does not install `hw-probe`. If it is missing, the page says so.

On Fedora:

```bash
sudo dnf install cockpit hw-probe
```

On Bazzite, layer the Fedora package if it is not already present:

```bash
rpm-ostree install hw-probe
```

## Install this plugin

This repository builds a noarch Fedora/Bazzite RPM. It is not claimed to be in a distro compose until a separate package review lands. The RPM **Recommends** `hw-probe` and does not run a probe or contact the network during installation.

```bash
make
make rpm
sudo rpm -i cockpit-hardware-probe-*.rpm
```

Uninstall:

```bash
sudo rpm -e cockpit-hardware-probe
```

Development install (symlink `dist/` into the user Cockpit directory):

```bash
make
make devel-install
```

Reload the Cockpit page after rebuilding. Remove the link with `make devel-uninstall`.

## Detection order

1. `hw-probe` via Cockpit’s normal process lookup
2. `<authenticated-user-home>/.local/bin/hw-probe`
3. `flatpak run org.linux_hardware.hw-probe`

A normal native installation is preferred when both native and Flatpak copies exist. Arbitrary custom install paths are not supported. Do not edit Cockpit’s PATH as a workaround.

## Development

On Fedora:

```bash
sudo dnf install gettext nodejs npm make
```

On Debian/Ubuntu:

```bash
sudo apt install gettext nodejs npm make
```

```bash
make
```

`make` checks out Cockpit shared library files into `pkg/lib`, installs npm packages, and builds `dist/`.

Production bundle:

```bash
NODE_ENV=production make
```

### Checks

```bash
npx tsc --noEmit
npm run eslint
npm run stylelint
npm test
NODE_ENV=production npm run build
```

`npm test` runs Vitest unit tests for parsers, providers, spawn timeout, probe execution, inventory, findings, upload, drive status, and UI states.

`make check` is the optional Cockpit VM browser test. It is not a substitute for `hw-probe -check` (which this plugin never runs).

### Browser preview (mocked Cockpit)

This environment cannot open a real Cockpit session. A local mock server stands in for UI review:

```bash
PREVIEW_PORT=43173 npm run preview
```

Open `http://127.0.0.1:43173/`. Query `?state=` selects a mock: `available` (default native), `empty-inventory`, `findings-problems`, `admin-denied`, `flatpak`, and the older capability-error states. Mock local probes take about four seconds so the running UI is visible. Nothing in this preview talks to linux-hardware.org.

## Known limitations

- Native vs Flatpak probes are not claimed to be equivalent. Flatpak runs unprivileged; SMART-backed drive health may be missing.
- This plugin was implemented and unit-tested in a container without a Bazzite Cockpit session. Real-host verification is documented in [CONTRIBUTING.md](CONTRIBUTING.md).
- Upload is performed by `hw-probe`, not by this plugin. Cancellation is best-effort if curl is already in flight.
- Device lists cap at 80 rows per group in the UI; the local files are not truncated.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the design contract, and [CHANGELOG.md](CHANGELOG.md) for the 1.0.0 contents.

## License

LGPL-2.1-or-later. See [LICENSE](LICENSE) and [LICENSE-AUDIT.md](LICENSE-AUDIT.md).
