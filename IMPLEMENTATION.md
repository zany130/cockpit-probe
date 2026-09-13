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

- Use argv arrays only: `cockpit.spawn(["hw-probe", "-dumpversion"])`.
- Documented spawn options do **not** include a process timeout field (`binary`, `directory`, `err`, `environ`, `pty`, `batch`, `latency`, `superuser`). The `"timeout"` value exists as a Cockpit problem code.
- v0.1 applies a bounded timeout with a timer and `process.close("timeout")`, which terminates the spawned process and is normalized separately from command-not-found.
- Missing executable: structured `problem === "not-found"` (do not key off English stderr such as “command not found”).
- Permission denied: structured `problem === "access-denied"`.
- Generic failure: `problem === null` with a non-zero `exit_status`.
- v0.1 uses `err: "ignore"` so stderr is not used to classify state. Locale is pinned with `LC_ALL=C` and `LANG=C` because version stdout is parsed.

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
cockpit.spawn(["hw-probe", "-all"]);
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
- Run probe button
- privacy/local-only explanation
- no upload by default

Example:

> Run a local hardware probe to inspect detected devices and operability information. Nothing is uploaded unless you explicitly choose Upload.

## 8.3 Probe running

Show:

- running state
- progress wording only if real progress information is available
- elapsed time if useful
- Cancel only if safely implemented

Do not invent percentage progress.

## 8.4 Probe complete

Show concise summary:

- system
- OS/kernel
- total devices
- devices with reported issues
- unknown/not-reported devices

Then show a device table/list.

Possible columns:

- Device
- Type
- Vendor
- Driver
- Status

Do not display hundreds of raw log lines.

## 8.5 Findings

Highlight only meaningful upstream-reported problems.

Examples:

- failed/nonworking device status
- missing driver where explicitly reported
- unsupported device where explicitly reported

Do not infer problems from harmless missing optional metadata.

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
- `hw-probe` executable detection
- installed version detection
- normalized capability model
- loading/error/unavailable/ready states
- no probe execution yet
- no upload
- no privilege escalation

Tests:

- installed
- missing
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

- Run probe action
- running state
- completion state
- timeout appropriate for hardware scan
- safe cancellation if Cockpit process semantics support it
- no upload
- no automatic privilege escalation

The command must not include `-upload`.

Tests:

- successful run
- slow run
- failure
- permission denied
- timeout
- cancellation if implemented

Real-host gate:

Run a real probe successfully from Cockpit without uploading anything.

---

## v0.3 — Local Probe Parsing and Hardware Summary

Goal:

Turn the local probe into useful normalized hardware information.

Research the most reliable structured local source.

Implement:

- host/system summary
- device inventory
- normalized device categories
- driver field where reliably available
- device status where explicitly available
- issue count
- unknown state

Do not infer health.

Tests must use realistic sanitized probe fixtures.

Real-host gate:

Compare displayed summary against actual hw-probe local data on the host.

---

## v0.4 — Hardware Findings

Goal:

Surface useful problems without building a fake diagnostics engine.

Implement conservative findings for statuses explicitly reported by hw-probe.

Possible categories, only where supported by upstream data:

- nonworking device
- unsupported device
- missing driver
- unknown operability

Do not parse generic logs for speculative errors unless roadmap is explicitly revised.

Do not create a health score.

---

## v0.5 — Explicit Upload to linux-hardware.org

Goal:

Allow the user to intentionally upload the current probe.

Implement:

- Upload action
- confirmation/privacy explanation
- upload running state
- returned URL parsing/validation
- successful Open probe action
- upload errors that preserve local results

Requirements:

- never automatic
- never triggered by normal refresh
- never triggered by local probe execution
- validate returned URL
- no credentials/secrets in logs

Real-host gate:

Upload one explicitly approved test probe and verify the returned URL.

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
