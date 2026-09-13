/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Conservative drive status from the existing type=disk inventory.
 * hw-probe setDriveStatus() maps SMART PASSED/OK to works and
 * FAILED to failed when smartctl ran as administrator during -all.
 * This module does not read logs/smartctl and does not run -check.
 */

import { uniqueDevicesById } from './findings-normalizer';
import type { DriveStatusKind, DriveStatusSummary, HardwareDevice, HardwareSummary } from './model';

export function classifyDriveStatus(status: string): DriveStatusKind {
    const normalized = status.trim().toLowerCase();
    if (normalized === "works")
        return "works";
    if (normalized === "" || normalized === "detected")
        return "detected";
    if (normalized === "failed")
        return "failed";
    return "other";
}

export function deriveDriveStatus(disks: HardwareDevice[]): DriveStatusSummary {
    const unique = uniqueDevicesById(disks.filter(device => device.type === "disk"));
    const counts = {
        works: 0,
        detected: 0,
        failed: 0,
        other: 0,
        total: unique.length,
    };
    for (const disk of unique) {
        const kind = classifyDriveStatus(disk.status);
        counts[kind] += 1;
    }
    return {
        disks: unique,
        counts,
        source: "probe-status",
    };
}

export function deriveDriveStatusFromSummary(summary: HardwareSummary): DriveStatusSummary {
    return deriveDriveStatus(summary.disks);
}
