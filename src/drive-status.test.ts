import { describe, expect, it } from 'vitest';

import {
    DEVICE_DETECTED_DISK,
    DEVICE_FAILED_DISK,
    VALID_DEVICES_FIXTURE,
    VALID_HOST_FIXTURE,
} from './fixtures/inventory-fixtures';
import { classifyDriveStatus, deriveDriveStatus, deriveDriveStatusFromSummary } from './drive-status';
import { parseDeviceRow } from './device-parser';
import { normalizeInventory } from './inventory-normalizer';

function disk(row: string) {
    const parsed = parseDeviceRow(row);
    if (parsed == null)
        throw new Error('disk row must parse');
    return parsed;
}

describe('classifyDriveStatus', () => {
    it('maps SMART-derived Status strings conservatively', () => {
        expect(classifyDriveStatus('works')).toBe('works');
        expect(classifyDriveStatus('detected')).toBe('detected');
        expect(classifyDriveStatus('')).toBe('detected');
        expect(classifyDriveStatus('failed')).toBe('failed');
        expect(classifyDriveStatus('malfunc')).toBe('other');
        expect(classifyDriveStatus('limited')).toBe('other');
    });
});

describe('deriveDriveStatus', () => {
    it('counts unique disks from the overview inventory', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        const drives = deriveDriveStatusFromSummary(result.summary);
        expect(drives.counts.total).toBe(4);
        expect(drives.counts.works).toBe(4);
        expect(drives.counts.failed).toBe(0);
        expect(drives.source).toBe('probe-status');
        expect(drives.disks.every(item => item.type === 'disk')).toBe(true);
    });

    it('keeps a SMART-failed disk distinct from an untested disk', () => {
        const drives = deriveDriveStatus([
            disk(DEVICE_FAILED_DISK),
            disk(DEVICE_DETECTED_DISK),
        ]);
        expect(drives.counts.failed).toBe(1);
        expect(drives.counts.detected).toBe(1);
        expect(drives.counts.works).toBe(0);
        expect(drives.disks).toHaveLength(2);
    });

    it('ignores storage controllers', () => {
        const controller = parseDeviceRow(
            'pci:1022-43f7;01-06;works;storage;ahci;Advanced Micro Devices, Inc. [AMD];SATA controller'
        );
        if (controller == null)
            throw new Error('controller must parse');
        const drives = deriveDriveStatus([controller]);
        expect(drives.counts.total).toBe(0);
    });
});
