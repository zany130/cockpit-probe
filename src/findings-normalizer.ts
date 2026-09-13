/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Passive findings from hw-probe device Status fields. Status meanings
 * follow linuxhw/hw-probe README and hw-probe.pl writeDevs() / probeHW().
 * This module does not execute -check or -check-extended.
 */

import type { HardwareDevice, HardwareFinding, HardwareFindingsSummary, FindingKind, HardwareSummary } from './model';

/*
 * Types that are useful to list when operability is only "detected".
 * Other types (bridges, hubs, IOMMU, SMBus, USB controllers, storage
 * controllers, unknown future types) stay in counts and a secondary list.
 */
const USER_FACING_TYPES = new Set([
    "cpu",
    "memory",
    "graphics card",
    "disk",
    "network",
    "sound",
    "monitor",
    "bluetooth",
    "keyboard",
    "mouse",
    "human interface",
    "motherboard",
    "bios",
    "tv card",
]);

export function uniqueDevicesById(devices: HardwareDevice[]): HardwareDevice[] {
    const seen = new Map<string, HardwareDevice>();
    for (const device of devices)
        seen.set(device.id, device);
    return [...seen.values()];
}

export function devicesFromCategories(groups: Array<{ devices: HardwareDevice[] }>): HardwareDevice[] {
    const devices: HardwareDevice[] = [];
    for (const group of groups)
        devices.push(...group.devices);
    return devices;
}

export function classifyUpstreamStatus(status: string): FindingKind {
    const normalized = status.trim().toLowerCase();
    if (normalized === "" || normalized === "detected")
        return "detected";
    if (normalized === "works" || normalized === "limited" || normalized === "fixed")
        return "confirmed-working";
    if (normalized === "failed" || normalized === "malfunc")
        return "reported-problem";
    return "unknown";
}

function emptyCounts(): HardwareFindingsSummary["counts"] {
    return {
        works: 0,
        detected: 0,
        failed: 0,
        malfunc: 0,
        limited: 0,
        fixed: 0,
        other: 0,
        total: 0,
    };
}

function incrementCount(counts: HardwareFindingsSummary["counts"], status: string) {
    const normalized = status.trim().toLowerCase();
    if (normalized === "works")
        counts.works += 1;
    else if (normalized === "detected" || normalized === "")
        counts.detected += 1;
    else if (normalized === "failed")
        counts.failed += 1;
    else if (normalized === "malfunc")
        counts.malfunc += 1;
    else if (normalized === "limited")
        counts.limited += 1;
    else if (normalized === "fixed")
        counts.fixed += 1;
    else
        counts.other += 1;
}

function deviceRef(device: HardwareDevice): HardwareFinding["device"] {
    return {
        id: device.id,
        bus: device.bus,
        type: device.type,
        vendor: device.vendor,
        device: device.device,
        driver: device.driver,
    };
}

function findingFor(device: HardwareDevice): HardwareFinding {
    const kind = classifyUpstreamStatus(device.status);
    const finding: HardwareFinding = {
        device: deviceRef(device),
        upstreamStatus: device.status.trim() === "" ? "detected" : device.status,
        kind,
        summary: summaryFor(device.status, kind),
        source: "probe-status",
        prominence: prominenceFor(device, kind),
    };
    const detail = detailFor(device.status, kind);
    if (detail !== undefined)
        finding.detail = detail;
    return finding;
}

function summaryFor(status: string, kind: FindingKind): string {
    const normalized = status.trim().toLowerCase();
    if (kind === "reported-problem" && normalized === "failed")
        return "hw-probe reported failed";
    if (kind === "reported-problem" && normalized === "malfunc")
        return "hw-probe reported a malfunction";
    if (normalized === "limited")
        return "hw-probe reported limited functionality";
    if (normalized === "fixed")
        return "hw-probe reported the device as fixed";
    if (kind === "confirmed-working")
        return "hw-probe reported works";
    if (kind === "detected")
        return "hw-probe reported detected";
    return "hw-probe reported an unrecognized status";
}

function detailFor(status: string, kind: FindingKind): string | undefined {
    const normalized = status.trim().toLowerCase();
    if (kind === "reported-problem" && normalized === "failed")
        return "Upstream meaning: driver is not found or the device is broken. This plugin does not decide which of those applies.";
    if (kind === "reported-problem" && normalized === "malfunc")
        return "Upstream meaning: error operation of the device or driver.";
    if (kind === "detected")
        return "Upstream meaning: the device was found and a driver may be present, but hw-probe has not confirmed operability. That is not a failure report.";
    if (normalized === "limited")
        return "Upstream meaning: works, but with limited functionality.";
    if (normalized === "fixed")
        return "Upstream meaning: works; this status is assigned during probe review, not by local -all.";
    if (kind === "unknown")
        return "This status is not in the known hw-probe vocabulary. It is shown as reported, not as a failure.";
    return undefined;
}

function prominenceFor(device: HardwareDevice, kind: FindingKind): "noteworthy" | "secondary" {
    if (kind === "reported-problem" || kind === "unknown")
        return "noteworthy";
    if (kind === "detected" && USER_FACING_TYPES.has(device.type))
        return "noteworthy";
    return "secondary";
}

export function deriveFindingsFromSummary(summary: HardwareSummary): HardwareFindingsSummary {
    return deriveFindings(devicesFromCategories(summary.categories));
}

export function deriveFindings(devices: HardwareDevice[]): HardwareFindingsSummary {
    const unique = uniqueDevicesById(devices);
    const counts = emptyCounts();
    counts.total = unique.length;

    const problems: HardwareFinding[] = [];
    const unconfirmed: HardwareFinding[] = [];
    const unknown: HardwareFinding[] = [];
    const secondaryUnconfirmed: HardwareFinding[] = [];

    for (const device of unique) {
        incrementCount(counts, device.status);
        const finding = findingFor(device);

        if (finding.kind === "reported-problem")
            problems.push(finding);
        else if (finding.kind === "unknown")
            unknown.push(finding);
        else if (finding.kind === "detected") {
            if (finding.prominence === "noteworthy")
                unconfirmed.push(finding);
            else
                secondaryUnconfirmed.push(finding);
        }
    }

    return {
        counts,
        problems,
        unconfirmed,
        unknown,
        secondaryUnconfirmed,
        source: "probe-status",
    };
}
