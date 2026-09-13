# Changelog

All notable changes to this project are documented in this file.

## 1.0.0 — 2026-09-13

First stable Cockpit plugin around `hw-probe`.

### Added

- Hardware Probe page with capability detection (PATH, `~/.local/bin/hw-probe`, official Flatpak).
- Local `hw-probe -all` from **Run Hardware Probe**. Native probes use Cockpit `superuser: "require"` because hw-probe requires root. Flatpak probes stay unprivileged.
- Hardware summary and conservative findings parsed from the local `host` and `devices` inventory files only.
- Drive status from disk `Status` (SMART-backed when a privileged `-all` collected it). No SMART attribute table.
- Explicit **Share Probe** / **Upload Probe** using `hw-probe -upload` only, with confirmation copy that matches upstream privacy behavior.
- Validated `https://linux-hardware.org/?probe=…` result links (`noopener noreferrer`, `referrerpolicy=no-referrer`).
- After a successful upload, empty local-probe state plus this session’s public URL. hw-probe’s deletion of `LATEST` is not reported as an inventory read failure.
- Refresh that keeps the current summary, 10-minute hang ceilings, cancel, 80-row display caps, and a usable narrow Cockpit pane.
- Fedora/Bazzite RPM (`Recommends: hw-probe`), Debian/Ubuntu `.deb` (`make deb`), unit-test CI, and release documentation.

### Security

- Argv-only `cockpit.spawn`; no shell, `sudo`, `su`, `pkexec`, curl, wget, or plugin HTTP client.
- No automatic upload. Capability detection, local `-all`, and inventory reads never pass `-upload`.
- Upload URLs are accepted only for `https://linux-hardware.org/?probe=<id>`.
- Raw hardware strings are rendered as text. Host `hwaddr` is not shown.

### Not in 1.0.0

Probe history, scheduled probes, `-check` / `-check-extended`, health scores, package/driver/firmware install, Flatpak overrides, SMART dashboards, fleet views, and linux-hardware.org accounts.
