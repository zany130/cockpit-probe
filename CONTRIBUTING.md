# Contributing

This is a Cockpit plugin around `hw-probe`. Keep that split: the plugin is UI, typed models, providers, and parsers. `hw-probe` remains the probing engine.

The design contract is [IMPLEMENTATION.md](IMPLEMENTATION.md). Do not add post-1.0 ideas from that file unless the roadmap is revised.

## Development setup

Install gettext, Node.js, npm, and make, then:

```bash
make
make devel-install
```

`make` checks out Cockpit shared files into `pkg/lib`. Reload the Cockpit page after each rebuild. Use `make devel-uninstall` to remove the development symlink.

For UI work without Cockpit:

```bash
PREVIEW_PORT=43173 npm run preview
```

## Checks

Run these before sending a change:

```bash
npx tsc --noEmit
npm run eslint
npm run stylelint
npm test
NODE_ENV=production npm run build
```

Do not add `hw-probe -check`, automatic upload, a health score, `sudo`, a shell, or a plugin HTTP client.

## Layout

```text
src/           plugin UI, providers, parsers, tests
preview/       mocked Cockpit for local UI review
packaging/     Fedora spec and Arch PKGBUILD templates
test/          optional Cockpit VM browser tests
```

Prefer an official Cockpit API (`cockpit.spawn` with argv, `cockpit.file`) over wrapping `cat`, `sudo`, or `curl`.

## Packaging

`make rpm` builds `cockpit-hardware-probe`. The spec **Recommends** `hw-probe` and must not run a probe or touch the network during install.

Arch packaging is a Starter Kit leftover and is not a supported 1.0 target.

## Real-host verification (operator)

This plugin was unit-tested in a container that cannot open Bazzite Cockpit. On a real Fedora/Bazzite host with Cockpit:

1. `make && make devel-install`, then open **Hardware Probe**.
2. Compare the shown version with `hw-probe -dumpversion`, `~/.local/bin/hw-probe -dumpversion`, or `flatpak run org.linux_hardware.hw-probe -dumpversion`. Native wins over Flatpak.
3. If `/root/HW_PROBE/LATEST/hw.info/{host,devices}` exist, the summary should load after administrative access for the file read. CPU should not be listed once per sibling thread. Disks are `type=disk` devices, not PCI controllers. Host `hwaddr` must not appear. There is no health score.
4. **Run Hardware Probe** requests administrative access for native `-all` and does not pass `-upload` or `-check`.
5. **Refresh** does not start `-all`.
6. Nothing contacts linux-hardware.org until you confirm **Upload Probe**. Confirm runs `hw-probe -upload` only. After success, the page shows **No local hardware probe is available yet** and keeps **View uploaded probe**. Refresh must not say the inventory could not be read.
7. A failed upload does not mark the local probe as failed.

## License

Contributions are LGPL-2.1-or-later. See [LICENSE](LICENSE) and [LICENSE-AUDIT.md](LICENSE-AUDIT.md).
