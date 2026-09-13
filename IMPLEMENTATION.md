# IMPLEMENTATION.md

# Cockpit Hardware Probe — Implementation Plan

## 1. Project Summary

This project is a Cockpit plugin that provides a native web UI around `hw-probe`.

The plugin should let administrators:

- detect whether `hw-probe` is installed
- run a local hardware probe
- inspect a concise summary of the resulting hardware state
- see important hardware/device findings
- optionally upload a probe to linux-hardware.org
- open the resulting public probe URL when an upload succeeds
- understand what data is being collected/uploaded before they opt in

The initial architecture should be intentionally simple:

```text
Cockpit UI
   ↓
provider layer
   ↓
parser / normalizer
   ↓
cockpit.spawn() / documented Cockpit APIs
   ↓
hw-probe
   ↓
local probe data and/or linux-hardware.org
```

Do not introduce a daemon, D-Bus service, custom API server, database, or helper process unless real implementation constraints prove one is necessary.

The first design assumption is:

> Use `cockpit.spawn()` with argv arrays and direct `hw-probe` invocation, then add complexity only if the real host requires it.

---

# 2. Product Goals

The plugin should eventually let a Cockpit user:

1. Open a **Hardware Probe** page.
2. See whether `hw-probe` is installed and usable.
3. See the installed `hw-probe` version.
4. Run a local hardware probe.
5. See current probe state:
   - idle
   - running
   - completed
   - failed
6. View a concise normalized device summary.
7. See important device/support/operability findings without dumping raw logs into the UI.
8. Re-run the probe.
9. Explicitly choose whether to upload results to linux-hardware.org.
10. See privacy/upload information before upload.
11. Open the returned linux-hardware.org probe URL after upload.
12. Preserve local-only operation when the user does not choose upload.

---

# 3. Non-Goals

The project must NOT:

- implement its own hardware probing engine
- replace `hw-probe`
- scrape linux-hardware.org as the primary source of local hardware state
- automatically upload probes
- upload without explicit user action
- create background monitoring in v1
- use `hw-probe -start` monitoring mode in v1
- maintain a persistent probe history database
- invent hardware health scores
- invent support percentages from incomplete local data
- claim hardware is healthy merely because it was detected
- duplicate Cockpit Logs
- expose raw command output directly in React
- provide a generic terminal wrapper for arbitrary `hw-probe` arguments
- accept arbitrary user-supplied shell fragments
- use `sh -c` or `bash -c`
- silently elevate privileges
- silently install packages
- silently modify system configuration
- depend on distro-name branching when capability detection is sufficient
- require a daemon/helper service unless direct Cockpit execution is proven inadequate

---

# 4. Upstream Behavior to Respect

Current `hw-probe` behavior and options must be verified before each relevant milestone.

Known current capabilities include:

- `hw-probe -all` — collect hardware probe data
- `hw-probe -check` — check device operability
- `hw-probe -upload` — upload and return a permanent probe URL
- `hw-probe -show` — show host/device information
- `hw-probe -show-host` — show host information
- `hw-probe -show-devices` — show device list
- `hw-probe -save DIR` — save probe data locally
- `hw-probe -src PATH` — operate on a saved probe
- `hw-probe -list` — list executed probes
- `hw-probe -dumpversion` — print tool version

`hw-probe` documentation also states that uploaded data is privacy-filtered/anonymized, but the plugin must still present upload as explicit consent rather than treating the upstream privacy policy as permission to upload automatically.

The plugin must not assume command output formats are stable without tests and fixtures.

### 4.1 v0.1 upstream verification (2026-09-13)

Verified against current `linuxhw/hw-probe` source (`hw-probe.pl` on `master`), linux-hardware.org documentation, Cockpit spawn/error docs, and Fedora package metadata.

**Executable and version query**

- Executable name: `hw-probe` (Fedora installs `/usr/bin/hw-probe`).
- Best machine-readable version query is still `hw-probe -dumpversion`.
- Getopt still defines `dumpversion!`. Help text: “Print the tool version (`$TOOL_VERSION`) and don't do anything else.”
- Implementation prints `$TOOL_VERSION` plus a trailing newline and exits 0:

  ```perl
  print $TOOL_VERSION."\n";
  ```

- Current upstream `$TOOL_VERSION` is `1.6`, not `1.6.6`. `$TOOL_RELEASE` is a separate field (`6`) and is **not** included in `-dumpversion` output.
- `-v` / `-version` prints a multi-line usage banner. Do not parse it for capability detection.
- Typical success output is a single version token plus newline, for example `1.6\n`. Trim surrounding whitespace. Reject empty, multiline, or non-version text.
- Fedora/EPEL currently package the RPM as `hw-probe` version `1.6.5-*`. The RPM file list includes `/usr/bin/hw-probe`. Bazzite can layer the same Fedora package with `rpm-ostree install hw-probe`.
- A community report that `-dumpversion` was removed referred to obsolete `-probe` / `-logs` options, not `-dumpversion`. `-dumpversion` is still present.

**Cockpit execution**

- Use argv arrays only. Never `sh -c`, `bash -c`, or `flatpak run ...` as a single string.
- Cockpit process PATH is not the user's interactive shell PATH. A user-local install at `~/.local/bin/hw-probe` is therefore not found by name-only spawn.
- v0.1 executable discovery, in this order, stopping at the first usable install:
  1. `cockpit.spawn(["hw-probe", "-dumpversion"])` using Cockpit's normal process lookup
  2. only on structured `problem === "not-found"`: read the authenticated user's home via `await cockpit.init()` then `cockpit.info.user.home` (current API since Cockpit 336; `cockpit.user()` is soft-deprecated), construct `<home>/.local/bin/hw-probe`, and spawn that absolute path with `-dumpversion`
  3. only after native PATH and user-local are both structured not-found (or home lookup cannot be used): official Flatpak `org.linux_hardware.hw-probe`
- Prefer a native installation when both native and Flatpak versions exist.
- Do not invent `/home/<username>`. If home lookup fails, skip the user-local path and still try Flatpak. If Flatpak is also missing, report a controlled home-lookup error rather than claiming hw-probe is not installed.
- Other native-lookup failures (permission denied, timeout, command-failed) must not fall back.
- Official Flatpak is an invocation, not a filesystem executable path:

  ```ts
  type HwProbeInvocation =
      | { kind: "native"; executable: string; source: "native-path" | "user-local" }
      | { kind: "flatpak"; executable: "flatpak"; appId: "org.linux_hardware.hw-probe"; source: "flatpak" };
  ```

- Flatpak detection uses documented CLI argv arrays:
  1. determine whether `flatpak` itself is available by spawning `["flatpak", "info", "--show-ref", "org.linux_hardware.hw-probe"]`
  2. treat exit 0 as “the app is installed” (user and system installations are queried by default; `--show-ref` is machine-readable)
  3. treat structured `problem === "not-found"` as “Flatpak CLI missing”
  4. treat a non-zero exit as “hw-probe Flatpak not installed”
  5. only then run `["flatpak", "run", "org.linux_hardware.hw-probe", "-dumpversion"]`
- Do not parse `flatpak list` human-readable tables. Do not launch the Flatpak merely to discover whether it is installed.
- If the Flatpak CLI is missing, or the app is not installed, hw-probe is unavailable. If the app is installed but launch fails, report a command-failed/error state — not “hw-probe is not installed”.
- The provider exposes the same normalized capability (`available`, `version`, error state) regardless of source. `source` is retained internally (`native-path` | `user-local` | `flatpak`) and is not required in the v0.1 UI. Do not expose filesystem paths in the normal UI.
- Documented spawn options do **not** include a process timeout field (`binary`, `directory`, `err`, `environ`, `pty`, `batch`, `latency`, `superuser`). The `"timeout"` value exists as a Cockpit problem code.
- v0.1 applies a bounded timeout with a timer and `process.close("timeout")`, which terminates the spawned process and is normalized separately from command-not-found.
- Missing executable: structured `problem === "not-found"` (do not key off English stderr such as “command not found”).
- Permission denied: structured `problem === "access-denied"`.
- Generic failure: `problem === null` with a non-zero `exit_status`.
- v0.1 uses `err: "ignore"` so stderr is not used to classify state. Locale is pinned with `LC_ALL=C` and `LANG=C` because version stdout is parsed.

**Flatpak `-dumpversion` verification (2026-09-13)**

Verified against current `linuxhw/hw-probe` `flatpak/hw-probe.sh` and `hw-probe.pl` on `master`, and against `flatpak-info(1)`.

- Official application id: `org.linux_hardware.hw-probe`.
- The Flatpak wrapper prepends `-flatpak` and forwards remaining arguments:

  ```sh
  perl /app/bin/hw-probe-flatpak -flatpak "$@"
  ```

  so `flatpak run org.linux_hardware.hw-probe -dumpversion` becomes `-flatpak -dumpversion`.
- Getopt still defines both `flatpak!` and `dumpversion!`.
- The no-argument / desktop `-all -upload` path runs only when `$#ARGV_COPY==0`, or when the only argument is `-flatpak`. Two arguments (`-flatpak`, `-dumpversion`) do not take that path.
- `DumpVersion` prints `$TOOL_VERSION` plus a newline and exits 0 **before** any probe/upload work.
- Therefore `-dumpversion` is a valid version query through the official Flatpak. Do not assume later Flatpak builds remain identical; re-verify before v0.2 probing.
- Do not modify Flatpak permissions in v0.1. Do not install the Flatpak from this plugin.
- v0.1 only detects capability/version. Do not assume the Flatpak has the same host hardware access as a native install. When v0.2 implements probing, independently verify sandbox permissions and access to `/sys`, `/proc`, PCI/USB enumeration, storage information, kernel logs, SMART/drive-health behavior, and privilege behavior. If Flatpak produces less complete data, surface that honestly.

### 4.2 v0.2 upstream verification (2026-09-13)

Verified against current `linuxhw/hw-probe` `hw-probe.pl` on `master`, current `-help`, a direct unprivileged run of that script, `flatpak-info(1)` / the official Flatpak manifest, current Cockpit spawn docs (`pkg/lib/cockpit.d.ts`), and a real-host Bazzite native user-local install.

**Local probe command**

- Current `-help` documents `-all` as “Probe for hardware.” It does **not** document `-probe`.
- Getopt still accepts `probe!`, but it is listed under `# Obsolete`. `-probe` alone enables logs at **minimal** level. `-all` enables probe + logs at the **default** log level.
- README and help examples use `hw-probe -all -upload` for the public upload path. Omitting `-upload` is the local-only form.
- Direct observation (unprivileged `perl hw-probe.pl -all` and `-probe`, 2026-09-13): both exit 1 with stderr `ERROR: you should run as root ('sudo -E hw-probe ...' or with 'su')` and produce no stdout. No files were written. No upload occurred.
- Real-host Bazzite (native user-local `~/.local/bin/hw-probe`, reports `hw-probe 1.6`): `~/.local/bin/hw-probe -probe` exits 1 with the same root requirement. Current `-help` on that host documents `-all` and `-upload`, not `-probe`, and reports probe data under `/root/HW_PROBE`.
- Therefore v0.2 invokes **`-all` only**, through the v0.1 resolved invocation. Do not use obsolete `-probe`. Do not add `-check`, `-save`, or `-upload`.

**Upload / network**

- `uploadData()` and curl POST run only inside `if($Opt{"Upload"})`. v0.2 never passes `-upload` / `--upload` / `-confirm-upload-of-hashed-ids`.
- Linux dependency checks warn on missing `dmidecode`/`smartctl`/`lspci`/etc.; `curl` is required on some BSD paths, not as a Linux probe dependency.
- Flatpak manifest includes `--share=network`. That does not mean this plugin initiates a request. A local `-all` run should not call `uploadData()`. Real-host packet capture is still needed to confirm no unexpected network from helper tools.

**Artifacts**

- Default `PROBE_DIR` is `/root/HW_PROBE` (help: “Probes info is saved in the $PROBE_DIR directory”). `LATEST_DIR` is `$PROBE_DIR/LATEST`. Observed success stdout includes `Local probe path: $DATA_DIR` (typically `/root/HW_PROBE/LATEST/hw.info` when run as root).
- Snap uses `$SNAP_USER_COMMON/HW_PROBE`. Flatpak uses `$XDG_DATA_HOME/HW_PROBE` (commonly `~/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE`).
- A new probe `rmtree`s existing `$DATA_DIR` then writes `LATEST`. v0.2 does not delete or relocate probes itself. Cancellation via SIGTERM may leave a partial `LATEST` tree; do not auto-clean.
- v0.3 reads only the two trusted files under `/root/HW_PROBE/LATEST/hw.info/{host,devices}` (see §4.3). v0.2 does not implement that read, copy probe data into the Cockpit user's home, or manage history.

**Completion**

- Stdout progress lines such as `Probe for hardware ... Ok` are not a percentage and are not a reliable machine API. v0.2 treats Cockpit spawn completion with exit 0 as success.
- `exitStatus(0)` is the normal successful end of `scenario()`. Non-zero is failure. Missing tools on Linux are often warnings rather than hard failures, except `hwinfo` when that log is enabled.

**Privilege and Flatpak**

- Native (non-Snap/non-Flatpak) probing as a non-root user **hard-fails** (`exitStatus(1)`). Real-host hw-probe 1.6 matches that.
- Current Cockpit API (`SuperuserMode = "require" | "try" | null | undefined` on `cockpit.spawn` channel options): native probe execution uses `cockpit.spawn(argv, { superuser: "require", ... })`. If the user cannot become administrator, the channel closes with `problem === "access-denied"`, normalized as `administrative-access-required`.
- Do **not** use `superuser: "try"`: unprivileged native execution is known to fail, so denial must be explicit.
- Do **not** use `sudo`, `sudo -E`, `su`, `pkexec`, `sh -c`, or `bash -c`.
- Capability/version detection remains unprivileged. Privilege is requested only after **Run Hardware Probe**. The page itself is not privileged. Cockpit's existing administrative authentication UI is used; this plugin does not reproduce it.
- Native argv uses the v0.1 resolved absolute executable (`hw-probe` from PATH, `/usr/bin/hw-probe` when that is the resolved path, or `/home/<user>/.local/bin/hw-probe`). Because root executes that absolute path, PATH is not reconstructed and no shell is used.
- Official Flatpak metadata indicates root is needed for complete hard-drive health access, not that all probing requires root. v0.2 therefore runs `["flatpak", "run", "org.linux_hardware.hw-probe", "-all"]` as the authenticated Cockpit user, **without** `superuser: "require"`. Do not add `flatpak override`. Sandboxing can reduce hardware visibility relative to a native privileged probe.
- The broader v0.6 privilege/extended-data review remains for later; this native-probe privilege is only the v0.2 correction required by real-host evidence.

**Cockpit cancellation**

- `process.close([problem])` closes stdin/stdout. If `problem` is set, Cockpit terminates the child with a signal. v0.2 uses `close("cancelled")` for Cancel and `close("timeout")` for the probe timer. Do not use `pkill`/`killall`.

**Timeout**

- Upstream documents about one minute for extra `-check` tests on typical desktops. v0.2 does not pass `-check`. Probe timeout is **10 minutes** (`PROBE_TIMEOUT_MS`), separate from the 8s capability timeout.

### 4.3 v0.3 upstream verification (2026-09-13)

Verified against current `linuxhw/hw-probe` `hw-probe.pl` on `master` (`writeHost`, `readHost`, `writeDevs`, `getDeviceBus`, `setDevCount` / `getDeviceCount`, meminfo `Ram_total`), current `-help`, Cockpit `cockpit.file` types (`pkg/lib/cockpit.d.ts` `FileOpenOptions.superuser`), and **authoritative real-host notes supplied by the operator** for a Bazzite host running hw-probe 1.6. This environment did **not** inspect `/root/HW_PROBE` or SSH to that host.

**Raw files, not `-show*`**

- A native privileged `hw-probe -all` writes `/root/HW_PROBE/LOG` and `/root/HW_PROBE/LATEST/hw.info/{host,devices,logs}`. On the reported host, `LATEST` is a real directory. `host` and `devices` are ASCII text (about 575 and 9184 bytes).
- Canonical resolution of `/root/HW_PROBE/LATEST` may be `/var/roothome/HW_PROBE/LATEST` because of the host root-home layout. The plugin uses the documented/logical path `/root/HW_PROBE/LATEST/...` and must **not** hardcode `/var/roothome`.
- `-show-host`, `-show-devices`, and `-show` work, but `-show-devices` renders a truncated human table (`Advanced Micr...`, `graphics ...`). v0.3 therefore parses the raw `host` and `devices` files, not the table.
- These files are an **internal upstream implementation detail**. They are not documented as a stable public API. `-show*` remains a validation/reference interface only.
- Do not recursively read `/root/HW_PROBE`. Do not read `logs/`. Do not follow `Local probe path:` from stdout as a user-controlled path.

**Host file (`writeHost` / `readHost`)**

- Line-oriented `lc(key) + ":" + value + "\n"`. Upstream `readHost` matches `/(\w+)\:(.*)/` (first colon only). Values may contain additional colons (timestamps, `op_modes`).
- Unknown keys and malformed individual lines are skipped. A file with zero valid `key:value` lines is `malformed-host`, not an empty success.
- Useful static inventory copied into the React-facing host model: `arch`, `boot_mode`, `cores`, `kernel`, `model`, `type`, `vendor` (if present), `ram_total`, `monitors`, `nics`, `probe_ver`. Motherboard vendor from a `type=motherboard` device may fill `vendor` when the host file omits it.
- Transient telemetry is parsed then **omitted** from the summary: `cpu_temp`, `cpu_fan`, `load_average`, `ram_used`.
- Sensitive host keys are discarded during parse/normalize and never copied into `HardwareSummary`: `hwaddr`, hostname-like `id`/`name`/`hostname`, serials, UUIDs, machine IDs, probe IDs, hashes, IPs, WWNs, and `filesystem` (may contain filesystem UUIDs). The real host sample included `hwaddr:` with a hardware hash; fixtures use an obvious fake.

**RAM units**

- `$Sys{"Ram_total"}` is copied from `/proc/meminfo` `MemTotal: (\d+) kB`. Linux reports that kB as **1024-byte KiB** (`proc(5)` / kernel meminfo). Observed `ram_total:32414356` is therefore 32414356 KiB ≈ **30.9 GiB**, not a decimal-GB marketing figure and not megabytes. Installed DIMM labels (2×16 GB) can still look like “32 GB”; MemTotal is the kernel-visible total and is slightly lower. v0.3 displays the converted MemTotal label, not a guessed “32 GiB”.

**Devices file (`writeDevs`)**

- Join of `ID;Class;Status;Type;Driver;Vendor;Device[;SVendor[;SDevice]]`. Semicolons inside values are replaced with spaces before join. Extra trailing fields may exist; empty `Driver` is represented by `;;`.
- Discrepancy vs a naive “BUS:ID;CLASS;…” reading: the first field is already `bus:id` (for example `pci:1002-744c-1849-5315`). `Class` is the bus class token (PCI `03-00`), not a human category. `Type` is the human category (`graphics card`, `disk`, `network`, …). Follow upstream `writeDevs`, not the truncated `-show-devices` table.
- `-show` remaps cpu/mem/bios/board to a SYS bus for display. v0.3 keeps the raw ID prefix lowercased as `bus`.
- Parser contract: split on `;`, require at least five fields and an ID containing `:`. Optional SVendor/SDevice. Extra future fields ignored. Blank lines skipped. Unknown status/type/bus preserved. Zero successfully parsed rows is `malformed-devices`.
- Device IDs may be kept internally (React keys / grouping). The primary UI does not display PCI/USB IDs. Serial suffixes matching `-serial-...` are stripped from IDs.

**CPU duplicates**

- `writeDevs` repeats the same CPU line `getDeviceCount` times. For CPU, `setDevCount` uses threads when available, otherwise cores. Real-host `-show-devices` listed the Ryzen 5 7600X 12 times while `cores:6` and the package is a 6-core processor. Those 12 rows are logical-processor copies of one `HW{cpu:...}` entry, not 12 packages.
- High-level CPU summary: one model + host `cores`. Do **not** advertise thread count from the duplicate-row count. Raw inventory keeps the repeated rows; the Devices CPU list display-groups identical vendor+device rows. This is CPU-specific, not generic name deduplication.

**Memory duplicates**

- Identical `RAM Module 16GB DIMM 4800MT/s` rows are distinct physical modules (`mem:slot-0`, `mem:slot-1`). Count them separately.

**Storage**

- PCI `type=storage` is a controller (SATA / NVMe controller). Overview Storage lists `type=disk` only. Controllers remain in the secondary inventory.

**Graphics / network**

- Do not invent a GPU marketing name from PCI IDs. If Device is `VGA compatible controller`, show that plus vendor and driver (`amdgpu` on the reported host).
- Network devices use upstream `type=network`. No MAC or IP fields are copied.

**Acquisition**

- Native: `cockpit.file(path, { superuser: "require" }).read()` for the two trusted paths only. This is Cockpit’s documented privileged file API (`FileOpenOptions.superuser`). Prefer it over spawning `/usr/bin/cat`. Do not use `superuser: "try"`, `sudo`, `su`, `pkexec`, or a shell.
- Missing both files → empty inventory (not a crash). Missing only one file → `host-missing` / `devices-missing`. `problem === "access-denied"` → `administrative-access-required`. Completely malformed text → parse failure, distinct from `hw-probe -all` failure.
- Page load may read an existing probe. It must not execute `hw-probe -all`. After a successful v0.2 run, reload the two files. If `-all` succeeded but the files are still absent, show that the probe completed and the inventory could not be read.
- Flatpak: upstream sets `$PROBE_DIR = $ENV{"XDG_DATA_HOME"}."/HW_PROBE"` when `-flatpak`. The official app’s documented `XDG_DATA_HOME` is `~/.var/app/org.linux_hardware.hw-probe/data`. v0.3 reads `<authenticated-home>/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE/LATEST/hw.info/{host,devices}` **without** privilege, using the same parsers. If home cannot be used, `inventory-unavailable`. This is not claimed native/Flatpak parity and was not verified on a live Flatpak host. No `flatpak override`.

**Statuses**

- Preserve upstream `works` / `detected` (UI: Works / Detected). Do not map them to health scores or traffic lights. v0.4 derives a separate findings model from these statuses; it does not mutate `HardwareDevice`.

**Privilege boundary (v0.3)**

1. Native `hw-probe -all` via `cockpit.spawn` with `superuser: "require"` after **Run Hardware Probe** (v0.2).
2. Native read of the two trusted inventory files via `cockpit.file` with `superuser: "require"`.

Capability/version detection remains unprivileged.

### 4.4 v0.4 upstream verification (2026-09-13)

Verified against current `linuxhw/hw-probe` `hw-probe.pl` on `master` (fetched 2026-09-13; `GetOptions`, help text, `writeDevs`, `setDriveStatus`, battery capacity, `checkHW`, `checkGraphics` / `checkGraphicsCardOutput`, `makeProbe`, option normalization) and the Operability table in the same repository’s README. linux-hardware.org documents the same status table via that README. This environment did **not** execute `-check` on Bazzite and did not guess from option names.

**Device Status vocabulary**

`writeDevs()` writes `$HW{$ID}{"Status"}` and, if it is empty, assigns `"detected"` (comment: “test result”). That is the complete field written into the v0.3 `devices` file.

Statuses **assigned by current local probing** in `hw-probe.pl`:

| Status | Where assigned | Upstream meaning (README Operability) |
| --- | --- | --- |
| `works` | `probeHW` and related paths: in-use NICs, graphics logs, CPU, SMART `PASSED` / `SMART Health Status: OK` in `setDriveStatus`, etc. | Driver is found and operates properly (passed static or dynamic tests) |
| `detected` | default in `writeDevs()` when no status was set; some graphics paths via `setCardStatus(..., "detected")`; optical drives | Device is detected, driver is found, but not tested yet |
| `failed` | missing driver on several classes; SMART `FAILED` / `FAIL` in `setDriveStatus`; graphics module-unload paths | Driver is not found **or** device is broken (upstream does not distinguish which) |
| `malfunc` | battery capacity at or below `$MIN_BAT_CAPACITY` | Error operation of the device or driver |

README also documents `limited` (“Works, but with limited functionality”) and `fixed` (“Works, fixed by user”; assigned during linux-hardware.org probe **review**, not by local `-all`). Those strings are **not** assigned in current `hw-probe.pl` local probing. If they appear (for example after a reviewed/exported probe), v0.4 classifies them as confirmed-working, not as problems.

Unknown future statuses are preserved as `unknown` findings and are **not** treated as failure. Missing status is treated as `detected`, matching `writeDevs()`.

`detected` is absence of confirmed operability, not a warning or a break. A PCI bridge with `detected` is not a malfunction report. Do not implement `works → healthy`, `detected → warning`, `else → failed`.

**`-check` — answers to the research questions**

Sources: help text (`-check` / `-check-extended`), Getopt `check!`, option block that sets `Probe`+`Logs`, `makeProbe()`, `checkHW()`, `getGears()`, README Operability / extra tests list. Line numbers below are from `hw-probe.pl` on `master` as fetched 2026-09-13.

1. **What does `-check` do?** Help: “Check devices operability. Test performance of CPU, memory, graphics cards and drives.” README Operability: extra sanity tests (`glxgears`, `hdparm` read speed, `dd`/`md5sum` CPU, `memtester`), about one minute on typical desktops.
2. **Evaluate existing probe vs actively test?** Actively tests. `makeProbe()` runs `probeHW()` / `writeLogs()`, then `checkHW()`, then `writeDevs()` / `writeHost()`. It is not a read of an already-collected probe.
3. **Categories tested?** Graphics (`glxgears`), memory (`memtester`), drives (sequential read), CPU (`dd` throughput). Not a general per-device operability sweep.
4. **Benchmarks?** Yes. Help explicitly says performance testing. CPU path is a throughput measurement; `-check-extended` adds `7z b`.
5. **Disk reads/writes?** Sequential **reads** via `hdparm -t` (BSD: `diskinfo -c`). No write-test of user filesystems was found in `checkHW()`.
6. **SMART operations?** Not in `checkHW()`. SMART collection and `setDriveStatus()` happen during `-all` logs (`smartctl`), not as a `-check` self-test.
7. **Stress CPU/memory/GPU/storage?** Yes, for the duration of those tests: `glxgears` ~17s (`getGears`: `glxgears -info … & sleep 17 ; killall glxgears`), `memtester 8 1` (8 MiB, one loop), `hdparm -t` on each disk, `dd` 512 MiB from `/dev/zero` piped to `md5sum`.
8. **Root?** Native non-Flatpak: `Probe` requires root (`exitStatus(1)`). `-check` sets `Probe`+`Logs`, so native `-check` requires root. Flatpak/Snap print a warning and continue rather than hard-exit.
9. **Duration?** Upstream README: about one minute on average modern desktops. Not measured on Bazzite in this environment.
10. **Alters `/root/HW_PROBE/LATEST`?** Yes. `writeDevs()` / `writeHost()` run after `checkHW()`, so LATEST is rewritten. Tests are written under `$DATA_DIR/tests/` (`glxgears`, `memtester`, `hdd_read`, `cpu_perf`).
11. **Requires a preceding `-all`?** No. `-check` itself sets `Probe` and `Logs` (same flags `-all` sets).
12. **Combined with `-all`?** Combining still runs one `makeProbe()`: collect, then `checkHW()`, then write. Semantics are “full probe plus the extra tests,” not two independent jobs.
13. **Files/status fields?** Test logs under `tests/`. Device `Status` is still the `devices` field. `checkHW()`’s own comment is still `TODO: test operability, set status to "works", "malfunc" or "failed"`. Most tests only write logs. Graphics “frames in” can set GPU status to `works` via `checkGraphicsCardOutput`.
14. **Exit codes?** Same process `exitStatus(0|1)` as other modes. No dedicated machine-readable check-result code was found.
15. **`-check` vs `-check-extended`?** Both enable CheckGraphics/Memory/Hdd/Cpu. Extended additionally sets `Check7z` and runs `7z b`.
16. **Machine-readable result?** No separate findings JSON. Consumers would re-read `devices` plus optional `tests/` logs. Test logs are not a stable public API.
17. **Do `works`/`detected`/failed in `devices` depend on `-check`?** Mostly no. Those statuses are assigned during `probeHW()` / SMART / related log analysis. `-check` may promote some graphics cards to `works` if glxgears prints “frames in”. It does not systematically rewrite other statuses (see the TODO on `checkHW()`).
18. **Useful findings without `-check`?** Yes. The existing `devices` Status field already carries `works` / `detected` / `failed` / `malfunc` from `-all`.

**`-check-extended`**

- Getopt: `check-extended!`. Help: “Perform extended check.”
- Enables the same four `-check` tests plus `7z b` (p7zip benchmark) written to `tests/7z_b`.
- Not exposed in v0.4. It is more performance-oriented, not a distinct operability model.

**Decision: Option A — passive findings only**

v0.4 does **not** execute `-check` or `-check-extended`, automatically or as a button.

Rationale:

- Passive `Status` fields already distinguish confirmed operability, untested detection, and explicit problem statuses.
- `-check` mixes operability testing with performance benchmarks. v0.4 is findings, not benchmarking.
- `checkHW()` does not systematically update Status (TODO in source), so running it would often produce test logs this plugin is not prepared to interpret.
- It is active: GPU/memory load, sequential disk reads, rewrite of LATEST. Unsuitable to attach to page load, Refresh, or `-all`.
- Duration and host impact were not measured on the real Bazzite machine; this environment must not fabricate that.

No automatic or explicit check action. Do not silently substitute `-check-extended`.

**Flatpak**

Passive findings reuse the v0.3 inventory path (native privileged files or the documented Flatpak data dir). Official Flatpak docs ask for root mainly to check drive health (SMART during `-all`). This environment did not run Flatpak `-check`; sandboxing would likely reduce `glxgears` / `hdparm` / `memtester` usefulness. Because active check is not implemented, that gap is not papered over. No `flatpak override`.

### 4.5 v0.5 upstream verification (2026-09-13)

Verified against current `linuxhw/hw-probe` `hw-probe.pl` on `master` (`GetOptions` `upload|confirm-upload-of-hashed-ids!`, help `-upload` / `-src` / `-save`, `createPackage()`, `uploadData()`, `cleanData()`, option normalization, `makeProbe()` gate) and the README Privacy / Usage sections. This environment did **not** upload from Bazzite.

**What `-upload` does**

1. **Upload.** `uploadData()` packs the probe (`tar` of `hw.info`) and POSTs it with `curl` to `https://linux-hardware.org/upload_result.php` (`-F file=@pkg`, `-F hwaddr=…`, tool version, client salt). The plugin never implements that HTTP client.
2. **Existing LATEST vs new probe.** `-upload` alone does **not** set `Probe`. `makeProbe()` runs only when `Probe` or `Check` is set. `createPackage()` without `-src` uses existing `$DATA_DIR` (`$PROBE_DIR/LATEST/hw.info`) and errors with “please make probe first” if it is missing. **v0.5 therefore invokes `-upload` only**, not `-all -upload`.
3. **Does it require `-all` together with `-upload`?** No. README examples use `-all -upload` as a combined “probe then upload” convenience. Combining them **does** run a new probe (and redirects write to a temp dir under LATEST, then `cleanData()`). v0.5 must not hide that extra probe.
4. **Existing saved probe.** `-src|-source PATH` is “A probe to upload.” v0.5 does not pass `-src` (no arbitrary path). Native/Flatpak `-upload` uses that invocation’s DATA_DIR, which is the same LATEST tree v0.3 reads.
5. **Root.** Native `Probe` requires root. `-upload` alone does not set Probe, so the hard root-exit is not taken. Accessing `/root/HW_PROBE/LATEST` still needs privilege; native upload uses `superuser: "require"`. Flatpak DATA_DIR is under the user XDG data home; Flatpak upload is unprivileged.
6. **Endpoint.** `https://linux-hardware.org/upload_result.php`. On TLS failure, upstream may retry HTTP. The plugin still only accepts `https://linux-hardware.org/?probe=…` as a clickable result.
7. **Success output.** `uploadData()` prints the server body (`print $Log`) after stripping a private-access token line. It extracts `probe=(\w+)` and writes `Probe URL: https://linux-hardware.org/?probe=$id` into `$PROBE_DIR/LOG`. Stdout is the server response, typically containing `probe=<id>` and sometimes a full URL.
8–9. **URL / probe ID.** Sample public probes look like `https://linux-hardware.org/?probe=b394035f90`. v0.5 parses that host/query only, or a whitespace-delimited `probe=<id>` token, then applies the documented URL shape.
10. **Exit codes.** `exitStatus(0)` on success; `exitStatus(1)` on pack/upload failure (including curl errors).
11. **No network.** curl failures (codes 6/7/28 observed in messages) → network-unavailable. Upstream may also fall back to Perl POST.
12. **Server reject.** curl 22 (“The requested URL returned error”) → upstream-rejected.
13–15. **Privacy.** Help/README: usernames, hostnames, IPs, MACs, UUIDs, serials are “NOT uploaded directly.” A 32-byte prefix of salted SHA512 of MACs and serials **is** uploaded for deduplication; UUIDs are decorated the same way. “Be aware that this may fail in certain edge cases.” Hardware inventory, logs, and hashed identifiers remain. Do not claim complete anonymity.
16–17. **Mutates LATEST.** After a successful upload, `cleanData()` `rmtree`s `$LATEST_DIR`. That is upstream, not this plugin. Confirmation copy must say so. The already-rendered summary stays in React until Refresh or a new probe.
18. **Re-upload.** Supported if LATEST exists. After a successful upload LATEST is gone, so another upload needs a new local probe first.
19–20. **Flatpak.** Official docs: `flatpak run org.linux_hardware.hw-probe -all -upload`. The wrapper prepends `-flatpak`. Manifest includes `--share=network`. v0.5 uses `flatpak run org.linux_hardware.hw-probe -upload` without `flatpak override`. Not claimed native/Flatpak parity.

**Selected invocation**

- Native PATH: `["hw-probe", "-upload"]` with `superuser: "require"`
- User-local: `["<home>/.local/bin/hw-probe", "-upload"]` with `superuser: "require"`
- Flatpak: `["flatpak", "run", "org.linux_hardware.hw-probe", "-upload"]` unprivileged

Timeout: `UPLOAD_TIMEOUT_MS` = 10 minutes (hang ceiling). Cancellation: `process.close("cancelled")`, same as v0.2. Cancellation is best-effort; hw-probe may still finish packing or complete an in-flight curl POST after Cockpit closes the process.

**v0.5 security audit (source)**

- No automatic upload: capability, local `-all`, inventory `cockpit.file`, and findings never pass `-upload`
- Plugin has no HTTP client (`fetch` / Axios / curl / wget) for linux-hardware.org
- No `sudo` / `su` / `pkexec` / `sh -c` / `bash -c`
- Upload argv is fixed: `-upload` only (no `-src`, no server URL, no user-supplied args)
- Rendered result links must be `https://linux-hardware.org/?probe=<id>`
- Consent is not persisted; failed uploads are not retried automatically
- No probe history database or localStorage
- No remediation / package / driver / firmware actions

This is the first milestone allowed to cause an external network request, and only through hw-probe after explicit confirmation.

---

# 5. Design Principles

## 5.1 Start simple

Use:

- TypeScript
- React
- PatternFly
- Cockpit Starter Kit conventions
- documented Cockpit APIs
- `cockpit.spawn()` with argv arrays
- `hw-probe` as the hardware-data source

Do not create a backend service just to wrap a command-line tool.

## 5.2 Explicit privilege handling

Some probe data may be incomplete without elevated privileges.

The plugin must distinguish:

- command unavailable
- normal unprivileged probe
- privileged operation required for richer data
- permission denied
- failed probe

Do not assume every probe must run as root.

Do not use `sudo` directly.

If Cockpit's documented privilege/escalation mechanism is needed, use it deliberately and only for the exact operation that requires it.

Privilege behavior must be researched and tested before implementation.

## 5.3 Local-first

Running a probe locally must not imply upload.

The default workflow should be:

```text
Run local probe
    ↓
Inspect summary
    ↓
Optional explicit upload
```

not:

```text
Run probe → automatically upload
```

## 5.4 Privacy is a product feature

Before upload, clearly explain:

- upload goes to linux-hardware.org
- upload is optional
- a permanent probe URL may be created
- upstream states that direct identifiers such as username, hostname, IP addresses, MAC addresses, UUIDs, and serial numbers are not uploaded directly
- hashed identifiers may still be uploaded for deduplication according to upstream behavior

Do not overstate anonymity.

## 5.5 Provider/model/UI separation

Use:

```text
Cockpit / hw-probe interfaces
        ↓
provider
        ↓
parser / normalizer
        ↓
typed domain model
        ↓
React UI
```

React must not parse raw `hw-probe` text.

## 5.6 Conservative interpretation

The UI should present:

- detected hardware
- upstream-reported status
- upstream-reported issues
- collection/upload state

It should not infer unsupported conclusions.

Examples of prohibited inferences:

- “device is healthy” because it appears in the inventory
- “driver is broken” based only on an unknown status
- “hardware failure” based on one generic warning
- “100% compatible” based on successful enumeration

---

# 6. Technical Architecture

## 6.1 Frontend

Use:

- TypeScript
- React
- PatternFly
- Cockpit Starter Kit structure

Initial navigation:

**Hardware Probe**

Prefer one top-level page for the first release.

Avoid unnecessary tabs/subpages until the amount of content justifies them.

## 6.2 Provider layer

Create focused providers such as:

- tool capability/version provider
- probe execution provider
- local probe results provider
- upload provider

Do not build one giant provider that mixes:

- command execution
- parsing
- state formatting
- React presentation

## 6.3 Command execution

Use documented Cockpit APIs.

Commands must use argv arrays.

Good:

```ts
cockpit.spawn(["hw-probe", "-dumpversion"]);
```

Good:

```ts
cockpit.spawn(["hw-probe", "-all"], { superuser: "require" });
cockpit.spawn(["/home/user/.local/bin/hw-probe", "-all"], { superuser: "require" });
cockpit.spawn(["flatpak", "run", "org.linux_hardware.hw-probe", "-all"]);
```

Good (v0.3 native inventory read; documented `cockpit.file`, not `cat`):

```ts
cockpit.file("/root/HW_PROBE/LATEST/hw.info/host", { superuser: "require" }).read();
cockpit.file("/root/HW_PROBE/LATEST/hw.info/devices", { superuser: "require" }).read();
```

Bad:

```ts
cockpit.spawn(`hw-probe ${args}`);
```

Never use:

- `sh -c`
- `bash -c`
- interpolated shell pipelines

unless an upstream limitation is proven and reviewed.

Stable locale/environment should be used where text output is parsed.

Consider:

```text
LC_ALL=C
LANG=C
NO_COLOR=1
```

only where relevant and supported.

## 6.4 Timeouts

Probes may take much longer than ordinary status commands.

Use different timeout classes:

- short capability/version probe
- medium read/show operation
- long hardware scan
- upload timeout

Do not use one universal 5-second timeout for everything.

The UI must show a running state instead of appearing frozen.

## 6.5 Cancellation

Where Cockpit permits safely terminating a running spawned process, support cancellation once probe execution exists.

Cancellation must:

- clearly transition state
- clean up process handles
- not leave React believing a probe completed successfully
- not delete existing previous results

Do not implement cancellation until actual process lifecycle behavior is verified.

---

# 7. Typed Models

Example direction:

```ts
type CapabilityState =
    | "available"
    | "unavailable"
    | "permission-denied"
    | "unknown";

interface HwProbeCapability {
    state: CapabilityState;
    version?: string;
    detail?: string;
}

type ProbeRunState =
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

interface ProbeRunStatus {
    state: ProbeRunState;
    startedAt?: string;
    completedAt?: string;
    error?: ProbeError;
}

interface ProbeError {
    kind:
        | "command-not-found"
        | "permission-denied"
        | "timeout"
        | "cancelled"
        | "malformed-output"
        | "command-failed"
        | "upload-failed"
        | "unknown";
    message: string;
}

interface HardwareDevice {
    id: string;
    category: string;
    vendor?: string;
    model?: string;
    driver?: string;
    status?: HardwareDeviceStatus;
}

type HardwareDeviceStatus =
    | "working"
    | "failed"
    | "unsupported"
    | "unknown"
    | "not-reported";

interface HardwareProbeSummary {
    host?: {
        system?: string;
        os?: string;
        kernel?: string;
        architecture?: string;
    };
    devices: HardwareDevice[];
    counts: {
        total: number;
        withIssues: number;
        unknown: number;
    };
}

interface UploadResult {
    url: string;
    probeId?: string;
}
```

These are examples, not a mandate to invent fields that upstream output does not reliably provide.

Prefer fewer correct fields over many speculative ones.

---

# 8. UI Structure

## 8.1 No hw-probe installed

Show:

- Hardware Probe heading
- clear unavailable state
- short explanation
- detected absence of `hw-probe`

Do not show a broken empty dashboard.

Do not auto-install anything.

## 8.2 Ready / no current probe

Show:

- installed version
- empty inventory state when `LATEST` host/devices are absent: **No local hardware probe is available yet** plus **Run Hardware Probe**
- privacy/local-only explanation
- no upload by default

Do not treat missing `LATEST` data as an application crash.

Example:

> Run a local hardware probe to build a hardware summary. Nothing is uploaded.

## 8.3 Probe running

Show:

- running state
- progress wording only if real progress information is available
- elapsed time if useful
- Cancel only if safely implemented

Do not invent percentage progress.

## 8.4 Probe complete

v0.3 shows a concise **Hardware Summary** from the privacy-filtered model:

- System (model, architecture, boot mode, kernel)
- CPU (one processor model, physical cores from `cores`)
- Memory (converted `ram_total`, physical module count)
- Graphics / Storage (`type=disk` only) / Network
- Devices: overview categories, with bridges/controllers and other low-level types under **Other devices**

Preserve upstream status wording (Works / Detected). v0.4 adds a **Hardware Findings** section with status counts and noteworthy upstream statuses. Do not show health scores.

Do not display hundreds of raw log lines. Do not dump an ungrouped 90-row table on the overview.

## 8.5 Findings

v0.4 shows a **Hardware Findings** section derived from the same `HardwareDevice[]` inventory:

- numeric counts of upstream statuses (not percentages, not a health score)
- reported problems only for `failed` / `malfunc`
- user-facing `detected` devices as unconfirmed operability, not warnings
- low-level bridges/controllers with `detected` under a secondary expandable list
- unknown statuses listed without being classified as failure

Copy must not claim the machine is healthy because no problem status was assigned.

Active `-check` is not offered.

## 8.6 Upload

Upload must be a separate explicit action.

Before upload:

- explain destination
- explain privacy behavior
- mention permanent URL
- require explicit confirmation

After successful upload:

- show returned probe URL
- Open probe action

Do not automatically re-upload when refreshing the page.

---

# 9. Data Source Strategy

Before choosing parsers, inspect what `hw-probe` can reliably expose locally.

Prefer structured data if available.

Potential sources to research:

- saved probe package/data under hw-probe's local storage
- JSON device information inside probe output
- `-show`
- `-show-devices`
- `-verbose`
- probe package files generated by `-save`

Do not choose presentation-oriented text output if a stable structured local representation exists.

Do not read undocumented internal files merely because they are convenient without first assessing stability.

If internal probe JSON is the best available source:

- isolate parsing behind a dedicated parser
- fixture-test it
- document that it is an upstream implementation detail
- fail gracefully if schema changes

---

# 10. Privilege Strategy

This must remain deliberately simple.

v0.1 should NOT immediately add privilege escalation.

First determine:

- which useful capability/version queries work unprivileged
- whether a normal probe can run unprivileged
- which specific data requires root
- how Cockpit should request privilege for later milestones

Root should only be introduced when there is demonstrated product value.

For example, upstream notes that elevated access may be necessary for complete drive health information.

That does not mean the entire UI should always execute `hw-probe` as root.

Potential future model:

- standard probe: normal user
- extended storage health probe: privileged, explicit action

Do not implement this split until researched.

---

# 11. Upload Security and Privacy

Upload code must:

- invoke `hw-probe` through argv
- never construct arbitrary URLs from untrusted stdout without validation
- accept only expected HTTPS probe URLs
- reject malformed output
- not automatically navigate the browser
- not log sensitive raw probe output unnecessarily

Validate returned URL conservatively.

The allowed destination should match the verified linux-hardware.org upload behavior.

Do not create a generic “open URL from command output” function.

---

# 12. Error Isolation

One failed operation should not destroy all useful state.

Examples:

- version detection failure should not crash page rendering
- local summary parser failure should not hide tool availability
- upload failure should not delete local probe results
- failed re-probe should not necessarily discard the last successful summary
- missing optional metadata should not invalidate the entire probe

Use typed, localized error states.

---

# 13. Milestones

## v0.1 — Capability Detection and Plugin Shell

Goal:

Create the Cockpit plugin and accurately detect whether `hw-probe` is available.

Implement:

- Cockpit plugin scaffold
- Hardware Probe page
- `hw-probe` executable detection, including:
  - normal Cockpit process PATH lookup of `hw-probe`
  - authenticated-user fallback at `~/.local/bin/hw-probe`
  - official Flatpak `org.linux_hardware.hw-probe` via `flatpak run` (not a filesystem path)
- installed version detection
- normalized capability model (`available` / version / error; source retained internally)
- loading/error/unavailable/ready states
- no probe execution yet
- no upload
- no privilege escalation
- no Flatpak permission overrides or package installation

Tests:

- native PATH found (Flatpak discovery not used)
- user-local found after PATH miss (Flatpak not used)
- Flatpak found after PATH and user-local miss (`flatpak info --show-ref` then `flatpak run … -dumpversion`)
- Flatpak CLI missing → unavailable
- Flatpak present, app missing → unavailable
- Flatpak app present but launch fails → command-failed/error, not missing
- Flatpak malformed version → malformed-output
- Flatpak timeout → timeout
- full native → user-local → Flatpak fallback chain
- version success
- malformed version output
- command failure
- permission denied
- timeout

Real-host gate:

Verify the page correctly reports the installed `hw-probe` state on a Bazzite/Fedora-family host.

---

## v0.2 — Local Probe Execution

Goal:

Run a local hardware probe without upload.

Research exact recommended command/options first.

Implement:

- Run probe action using the v0.1 resolved invocation
- argv: `buildHwProbeArgv(invocation, ["-all"])` (never `-upload`, never `-probe`)
- native probe: `cockpit.spawn(argv, { superuser: "require" })` only after **Run Hardware Probe**
- Flatpak probe: unprivileged `flatpak run org.linux_hardware.hw-probe -all`
- running state
- completion state
- administrative-access-required when Cockpit returns `access-denied` for native privileged spawn
- 10-minute probe timeout
- Cancel via `process.close("cancelled")` on only this spawn
- no upload
- no privilege during capability/version detection
- no `superuser: "try"`
- no `sudo` / `su` / `pkexec` / shell
- no Flatpak permission overrides

The command must not include `-upload`.

Do not assume a Flatpak install has identical host hardware access to a native install. Independently verify Flatpak sandbox permissions and access to `/sys`, `/proc`, PCI/USB enumeration, storage information, kernel logs, SMART/drive-health behavior, and privilege behavior. If Flatpak produces less complete data, surface that honestly rather than silently treating all installations as equivalent. Do not modify Flatpak permissions merely to make probing look complete.

Tests:

- successful native PATH argv (`["hw-probe", "-all"]` or `["/usr/bin/hw-probe", "-all"]`) with `superuser: "require"`
- successful user-local argv (`["/home/testuser/.local/bin/hw-probe", "-all"]`) with `superuser: "require"`
- native `access-denied` → `administrative-access-required`
- native non-zero exit after privileged start → command-failed
- Flatpak unprivileged argv
- no-upload argv regression for every backend
- no `superuser` on capability/version detection
- failure / timeout / cancellation / duplicate run suppressed / executable disappeared / Flatpak launch failure

Real-host gate:

Run a real probe successfully from Cockpit without uploading anything. Expected on the Bazzite host whose native install is `~/.local/bin/hw-probe`:

1. Hardware Probe detects hw-probe 1.6 without privilege (no authentication prompt on load).
2. **Run Hardware Probe** requests Cockpit administrative access.
3. Effective operation is `~/.local/bin/hw-probe -all` through `cockpit.spawn(..., { superuser: "require" })`.
4. No `-upload`. Native data under `/root/HW_PROBE`.

A manual `sudo -E ~/.local/bin/hw-probe -all` is validation only and must not be embedded in the plugin.

Status (2026-09-13): v0.2 privilege correction landed in unit tests. The Cockpit/Bazzite real-host retest is **not** marked complete in this environment (no Cockpit session on the target host). v0.3 proceeds from the operator-supplied real-host file format notes in §4.3.

---

## v0.3 — Local Probe Parsing and Hardware Summary

Goal:

After a successful local `hw-probe -all`, read the locally generated inventory, parse it into conservative typed models, privacy-filter it, and display a hardware summary in Cockpit. No upload occurs.

Status (2026-09-13): implemented in this repository against sanitized fixtures and unit tests. The Bazzite real-host gate is for the operator; this environment cannot mark it passed.

Parser contract: §4.3. Sources are `/root/HW_PROBE/LATEST/hw.info/host` and `.../devices` (internal hw-probe format). Acquisition is `cockpit.file` with `superuser: "require"` for native files.

Implemented:

- host/system summary (static inventory only; no telemetry dashboard)
- privacy filter that discards `hwaddr` and other sensitive identifiers before React
- device inventory grouped by type (overview vs secondary)
- driver and upstream status where present (`works` / `detected`, not health scores)
- CPU logical-row grouping for the summary; RAM modules not generically deduplicated
- Storage overview = `type=disk` only
- empty state when no local probe exists; reload after v0.2 success
- Flatpak documented-data-dir read, or `inventory-unavailable` if home cannot be used

Do not infer health. Do not run `-check` / `-check-extended`. Do not upload.

Tests must use realistic sanitized probe fixtures (no real hwaddr/serials).

Real-host gate (operator, not this environment):

Compare the displayed summary against `/root/HW_PROBE/LATEST/hw.info` on the Bazzite host. See README for the checklist.

---

## v0.4 — Hardware Findings

Goal:

Surface useful problems without building a fake diagnostics engine.

Status (2026-09-13): **passive findings only** (Option A). See §4.4.

Implemented:

- typed `HardwareFinding` / `HardwareFindingsSummary` separate from `HardwareDevice`
- flow: v0.3 `devices` parser → `HardwareDevice[]` → `deriveFindings()` → `HardwareFindingsSummary` → React
- React does not parse raw command output or infer hardware health
- correlation by stripped upstream device `id` (bus/ID), not display name; RAM modules with the same label stay distinct; CPU logical duplicates count once
- if a future source cannot be correlated, `HardwareFinding.device` may be `null` (unassociated) rather than attaching to the wrong device
- UI: Hardware Findings with numeric status counts, reported problems (`failed` / `malfunc`), unconfirmed user-facing `detected` devices, secondary low-level `detected` list, unrecognized statuses
- `detected` is not a warning; unknown statuses are not failures
- no `-check` / `-check-extended` execution
- no health score, remediation, or upload

Error semantics remain distinct from v0.2/v0.3:

- Probe execution failed
- Probe data could not be read
- Probe data could not be parsed
- Findings could not be derived (only if the pure normalizer throws; it is total over a parsed inventory)
- Administrative access required

Active-check states (hardware check failed / cancelled / timed out) are **not** in the UI because `-check` is not implemented.

Do not parse generic logs for speculative errors. Do not create a health score.

Real-host gate (operator): see README checklist. This environment cannot mark it passed.

---

## v0.5 — Explicit Upload to linux-hardware.org

Goal:

Allow the user to intentionally upload the current probe.

Status (2026-09-13): implemented in this repository (unit tests). The Bazzite real-host upload gate is for the operator; this environment cannot mark it passed. See §4.5.

Implemented:

- separate Share Probe action (not combined with Run Hardware Probe)
- confirmation dialog with upstream-accurate privacy language
- `hw-probe -upload` only (existing LATEST; not `-all -upload`)
- native `superuser: "require"`; Flatpak unprivileged
- typed upload state; URL parser accepts only `https://linux-hardware.org/?probe=<id>`
- View uploaded probe is an explicit external link; it does not auto-navigate
- upload failure / cancel / timeout do not clear the local summary
- no history, no persisted consent, no automatic retry

Do not start v0.6 from this milestone.

Real-host gate (operator): see README checklist.

---

## v0.6 — Privilege and Extended Data Review

Goal:

Determine whether important useful information is missing from unprivileged probing.

Examples may include drive-health information.

Do not assume root is required globally.

If privileged probing is justified:

- use documented Cockpit privilege mechanisms
- make privilege explicit in UI
- scope it narrowly
- never use `sudo`
- test permission denial
- maintain useful unprivileged mode

If privilege provides little additional value, do not add it.

---

## v0.7 — UX / Compatibility / Hardening

Audit:

- long-running command behavior
- large hardware inventories
- virtualization
- systems without hw-probe
- systems with older/newer hw-probe
- parser schema changes
- offline systems
- upload failures
- narrow/mobile layout
- accessibility
- cancellation
- route/navigation behavior
- external URL handling
- security
- privacy language

No major new features.

---

## v1.0 — Release

Requirements:

- local probe works
- no automatic upload
- hardware summary works
- conservative findings work
- explicit upload works
- privacy explanation is accurate
- no command injection
- no shell interpolation
- privilege behavior audited
- responsive UI
- tests
- CI
- Fedora/Bazzite RPM
- clean install/uninstall
- release-quality README
- CHANGELOG
- CONTRIBUTING
- license audit

---

# 14. Post-1.0 Ideas

Out of scope before v1.0:

- probe history
- scheduled probes
- automatic periodic upload
- `hw-probe -start` monitoring
- fleet inventory
- compare probes over time
- SMART-specific dashboards
- charts/trends
- linux-hardware.org account integration
- multi-host aggregated view
- hardware compatibility recommendations
- driver installation
- automatic remediation
- device firmware updates
- package installation
- GNOME/KDE-specific hardware pages

Do not implement these before v1.0 unless the roadmap is explicitly revised.

---

# 15. Testing Strategy

## Unit tests

Test:

- version normalization
- command error normalization
- device parser
- status normalization
- upload URL validation
- privacy confirmation state

## Provider tests

Use realistic raw command output and probe fixtures.

Do not mock only final normalized models.

## Security tests

Verify:

- argv execution only
- no shell interpolation
- malicious output cannot inject HTML
- malicious output cannot create arbitrary external links
- upload URL validator rejects non-HTTPS/unexpected hosts
- raw hardware strings are rendered as text
- no upload occurs during local probe

## Error tests

Include:

- command missing
- command failure
- malformed output
- timeout
- permission denied
- partial probe data
- parser failure
- upload failure
- offline network

## Real-host tests

At minimum:

- Bazzite/Fedora-family system
- hw-probe installed
- hw-probe missing
- local probe
- host with multiple PCI/USB devices
- no upload
- explicit upload
- narrow/mobile Cockpit viewport

---

# 16. Packaging

First supported production package:

- Fedora/Bazzite RPM

The RPM should:

- install the Cockpit package
- depend on Cockpit appropriately
- determine whether `hw-probe` should be `Requires` or `Recommends`
- avoid bundling hw-probe unless licensing/packaging explicitly justifies it
- avoid auto-running a probe during installation
- avoid network access during installation
- avoid enabling background monitoring
- uninstall cleanly

Do not claim distro support that has not been tested.

---

# 17. Documentation

README should explain:

- what the plugin does
- that `hw-probe` is the underlying probe engine
- local probe vs upload
- privacy implications
- optional upload behavior
- required packages
- installation
- development
- testing
- known limitations

The README must clearly state:

> Running a local hardware probe does not upload data. Uploading to linux-hardware.org is a separate explicit action.

Do not claim complete anonymity; reflect upstream behavior accurately.

---

# 18. Research Rules

Before each milestone, verify current upstream behavior.

Prefer evidence in this order:

1. current `hw-probe` source/documentation
2. current linux-hardware.org documentation
3. current Cockpit developer documentation
4. current distro package metadata
5. reproducible issue reports
6. community discussions only as supporting evidence

If current evidence conflicts with this implementation plan:

- stop
- document the discrepancy
- update IMPLEMENTATION.md narrowly
- explain why

Do not blindly preserve an assumption that real upstream behavior disproves.

---

# 19. Release Philosophy

The plugin should feel like a native Cockpit hardware-inspection tool powered by `hw-probe`, not like a terminal wrapper.

The user should see:

- whether hardware probing is available
- one clear Run probe action
- understandable hardware results
- important findings
- one explicit optional Upload action

The underlying command-line complexity should remain isolated behind typed providers and parsers.

Start with the smallest correct architecture and add complexity only when real host behavior requires it.
