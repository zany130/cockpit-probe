import { describe, expect, it } from 'vitest';

import { parseDeviceRow, parseDevicesFile } from './device-parser';
import {
    DEVICE_COMPLETELY_MALFORMED,
    DEVICE_EMPTY_DRIVER,
    DEVICE_EXTRA_FIELDS,
    DEVICE_MALFORMED_ROW,
    DEVICE_OPTIONAL_TRAILING,
    FAKE_HWADDR,
    HOST_COMPLETELY_MALFORMED,
    HOST_CRLF_NO_FINAL_NEWLINE,
    HOST_MALFORMED_LINE,
    HOST_MISSING_OPTIONAL,
    HOST_UNKNOWN_KEY,
    HOST_WITH_COLON_VALUE,
    VALID_DEVICES_FIXTURE,
    VALID_HOST_FIXTURE,
    repeatedCpuRows,
} from './fixtures/inventory-fixtures';
import { parseHostFile } from './host-parser';
import { normalizeInventory } from './inventory-normalizer';
import { summaryContainsSensitiveValue } from './inventory-privacy';
import { formatRamFromKiB, parseRamTotalKiB } from './ram';

describe('parseHostFile', () => {
    it('parses a valid host file', () => {
        const parsed = parseHostFile(VALID_HOST_FIXTURE);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.arch).toBe('x86_64');
        expect(parsed.fields.model).toBe('B650M Pro RS WiFi');
        expect(parsed.fields.ram_total).toBe('32414356');
        expect(parsed.fields.hwaddr).toBeUndefined();
        expect(parsed.fields.id).toBeUndefined();
        expect(parsed.fields.uuid).toBeUndefined();
        expect(parsed.diagnostics.discardedSensitiveKeys).toContain('hwaddr');
        expect(parsed.diagnostics.discardedSensitiveKeys).toContain('filesystem');
        expect(parsed.diagnostics.discardedSensitiveKeys).toContain('id');
        expect(parsed.diagnostics.discardedSensitiveKeys).toContain('uuid');
    });

    it('accepts CRLF and a missing final newline', () => {
        const parsed = parseHostFile(HOST_CRLF_NO_FINAL_NEWLINE);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.arch).toBe('x86_64');
        expect(parsed.fields.model).toBe('Test Board');
        expect(parsed.fields.kernel).toBe('6.12.0-custom:debug');
    });

    it('splits on the first colon only', () => {
        const parsed = parseHostFile(HOST_WITH_COLON_VALUE);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.kernel).toBe('6.12.0-custom:debug');
    });

    it('tolerates unknown host keys', () => {
        const parsed = parseHostFile(HOST_UNKNOWN_KEY);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.future_widget).toBe('enabled');
        expect(parsed.diagnostics.unknownKeys).toContain('future_widget');
    });

    it('skips a malformed host line without invalidating the file', () => {
        const parsed = parseHostFile(HOST_MALFORMED_LINE);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.arch).toBe('x86_64');
        expect(parsed.fields.model).toBe('Test Board');
        expect(parsed.diagnostics.skippedLines).toBe(1);
    });

    it('allows missing optional host fields', () => {
        const parsed = parseHostFile(HOST_MISSING_OPTIONAL);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.fields.model).toBeUndefined();
        expect(parsed.fields.ram_total).toBeUndefined();
    });

    it('rejects a completely malformed host source', () => {
        expect(parseHostFile(HOST_COMPLETELY_MALFORMED).ok).toBe(false);
        expect(parseHostFile('').ok).toBe(false);
    });
});

describe('RAM units', () => {
    it('treats ram_total as KiB from /proc/meminfo', () => {
        expect(parseRamTotalKiB('32414356')).toBe(32414356);
        expect(formatRamFromKiB(32414356)).toBe('30.9 GiB');
        expect(formatRamFromKiB(33554432)).toBe('32 GiB');
        expect(formatRamFromKiB(1024)).toBe('1 MiB');
    });
});

describe('parseDevicesFile', () => {
    it('parses a valid device row', () => {
        const row = parseDeviceRow(
            'pci:1002-744c-1849-5315;03-00;works;graphics card;amdgpu;Advanced Micro Devices, Inc. [AMD/ATI];VGA compatible controller;ASRock Incorporation'
        );
        expect(row).toMatchObject({
            bus: 'pci',
            status: 'works',
            type: 'graphics card',
            driver: 'amdgpu',
            vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]',
            device: 'VGA compatible controller',
            subvendor: 'ASRock Incorporation',
        });
    });

    it('parses an empty driver', () => {
        const row = parseDeviceRow(DEVICE_EMPTY_DRIVER);
        expect(row?.driver).toBeNull();
        expect(row?.type).toBe('iommu');
    });

    it('parses optional trailing fields', () => {
        const row = parseDeviceRow(DEVICE_OPTIONAL_TRAILING);
        expect(row?.subvendor).toBe('ATI Technologies Inc');
        expect(row?.subdevice).toBeUndefined();
    });

    it('ignores extra future fields', () => {
        const row = parseDeviceRow(DEVICE_EXTRA_FIELDS);
        expect(row?.vendor).toBe('Realtek');
        expect(row?.device).toBe('RTL8125');
        expect(row?.subvendor).toBe('Subvendor');
        expect(row?.subdevice).toBe('Subdevice');
    });

    it('skips a malformed row without destroying the inventory', () => {
        const parsed = parseDevicesFile(
            VALID_DEVICES_FIXTURE.replace('\n', '\n' + DEVICE_MALFORMED_ROW + '\n')
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        expect(parsed.diagnostics.skippedRows).toBeGreaterThan(0);
        expect(parsed.devices.length).toBeGreaterThan(10);
    });

    it('preserves unknown status and type', () => {
        const row = parseDeviceRow('usb:ffff-0001;ff;glitchy;flux capacitor;;ACME;Model Q');
        expect(row?.status).toBe('glitchy');
        expect(row?.type).toBe('flux capacitor');
    });

    it('rejects a completely malformed device source', () => {
        expect(parseDevicesFile(DEVICE_COMPLETELY_MALFORMED).ok).toBe(false);
        expect(parseDevicesFile('').ok).toBe(false);
    });

    it('strips serial suffixes from device ids before they reach the model', () => {
        const row = parseDeviceRow(
            'ide:disk-serial-ABCDEF123;01;works;disk;;Seagate;ST4000VN006 4TB'
        );
        expect(row?.id).toBe('ide:disk');
        expect(JSON.stringify(row)).not.toContain('ABCDEF123');
    });

    it('preserves an unknown bus prefix', () => {
        const row = parseDeviceRow('virtio:net0;02;works;network;virtio_net;Red Hat;Virtio network');
        expect(row?.bus).toBe('virtio');
        expect(row?.type).toBe('network');
    });
});

describe('normalizeInventory', () => {
    it('filters hwaddr out of the React-facing model', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(summaryContainsSensitiveValue(result.summary, FAKE_HWADDR)).toBe(false);
        expect(summaryContainsSensitiveValue(result.summary, 'hwaddr')).toBe(false);
        expect(summaryContainsSensitiveValue(result.summary, 'fake-test-hostname')).toBe(false);
        expect(summaryContainsSensitiveValue(result.summary, '00000000-0000-4000-8000-000000000000')).toBe(false);
        expect(JSON.stringify(result.summary)).not.toMatch(/f{32}/);
    });

    it('copies a conservative hw-probe time stamp for upload copy', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(result.summary.host.collectedAt).toBe('2026-09-13 12:00:00 UTC');
    });

    it('does not copy unknown or transient host keys into the summary', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(JSON.stringify(result.summary)).not.toContain('cpu_temp');
        expect(JSON.stringify(result.summary)).not.toContain('load_average');
        expect(JSON.stringify(result.summary)).not.toContain('future_widget');
        expect(result.summary.host.architecture).toBe('x86_64');
        expect(result.summary.host.physicalCoreCount).toBe(6);
        expect(result.summary.host.ramTotalLabel).toBe('30.9 GiB');
    });

    it('groups identical logical CPU rows into one processor model', () => {
        const devices = [
            ...repeatedCpuRows(12),
            'mem:slot-0;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s',
        ].join('\n');
        const result = normalizeInventory('arch:x86_64\ncores:6\nram_total:32414356\n', devices);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(result.summary.cpu?.model).toContain('Ryzen 5 7600X');
        expect(result.summary.cpu?.physicalCoreCount).toBe(6);
        expect(result.summary.cpu?.logicalEntryCount).toBe(12);
        expect(result.summary.categories.find(group => group.id === 'cpu')?.devices).toHaveLength(12);
    });

    it('does not deduplicate identical RAM module names', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(result.summary.memory.moduleCount).toBe(2);
        expect(result.summary.memory.modules).toHaveLength(2);
        expect(result.summary.memory.modules[0].device).toBe(result.summary.memory.modules[1].device);
        expect(result.summary.memory.modules[0].id).not.toBe(result.summary.memory.modules[1].id);
    });

    it('does not treat storage controllers as physical disks', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(result.summary.disks).toHaveLength(4);
        expect(result.summary.disks.every(disk => disk.type === 'disk')).toBe(true);
        expect(result.summary.disks.some(disk => /SATA controller|Non-Volatile memory controller/.test(disk.device))).toBe(false);
        const controllers = result.summary.categories.find(group => group.id === 'storage-controller');
        expect(controllers?.devices.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps multiple GPUs and NICs', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        expect(result.summary.graphics).toHaveLength(2);
        expect(result.summary.graphics[0].driver).toBe('amdgpu');
        expect(result.summary.graphics[0].device).toBe('VGA compatible controller');
        expect(result.summary.network).toHaveLength(2);
        expect(result.summary.network.some(nic => /RTL8125/.test(nic.device))).toBe(true);
        expect(result.summary.network.some(nic => /MT7922/.test(nic.device))).toBe(true);
    });

    it('places unknown types in other without crashing', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const other = result.summary.categories.find(group => group.id === 'other');
        expect(other?.devices.some(device => device.type === 'flux capacitor')).toBe(true);
        expect(other?.devices.some(device => device.type === 'bridge')).toBe(true);
        expect(other?.devices.some(device => device.type === 'iommu')).toBe(true);
    });
});
