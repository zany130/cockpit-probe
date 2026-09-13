import { describe, expect, it } from 'vitest';

import { PATH_DUMPVERSION_INVOCATION, FLATPAK_INVOCATION } from './executable';
import { FAKE_HWADDR, VALID_DEVICES_FIXTURE, VALID_HOST_FIXTURE } from './fixtures/inventory-fixtures';
import {
    loadHardwareInventory,
    nativeInventoryPaths,
    reconcileInventoryWithProbe,
    type InventoryFileReader,
} from './inventory-provider';
import { NATIVE_DEVICES_PATH, NATIVE_HOST_PATH } from './inventory-paths';
import type { ProbeExecutionState } from './model';
import { summaryContainsSensitiveValue } from './inventory-privacy';

interface InventoryFileReadProblem {
    problem: string;
}

function accessDenied(): InventoryFileReadProblem {
    return { problem: 'access-denied' };
}

function fakeReader(files: Record<string, { content?: string | null; error?: InventoryFileReadProblem }>): {
    readFile: InventoryFileReader;
    calls: Array<{ path: string; superuser?: string }>;
} {
    const calls: Array<{ path: string; superuser?: string }> = [];
    const readFile: InventoryFileReader = async (path, options) => {
        const call: { path: string; superuser?: string } = { path };
        if (options?.superuser !== undefined)
            call.superuser = options.superuser;
        calls.push(call);
        const entry = files[path];
        if (entry?.error)
            throw entry.error;
        if (entry && 'content' in entry)
            return entry.content ?? null;
        return null;
    };
    return { readFile, calls };
}

const USER_LOCAL = {
    kind: 'native' as const,
    executable: '/home/testuser/.local/bin/hw-probe',
    source: 'user-local' as const,
};

describe('loadHardwareInventory', () => {
    it('loads native host and devices with privileged cockpit.file options', async () => {
        const { readFile, calls } = fakeReader({
            [NATIVE_HOST_PATH]: { content: VALID_HOST_FIXTURE },
            [NATIVE_DEVICES_PATH]: { content: VALID_DEVICES_FIXTURE },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result.status).toBe('ready');
        if (result.status !== 'ready')
            return;
        expect(result.summary.host.physicalCoreCount).toBe(6);
        expect(result.summary.disks).toHaveLength(4);
        expect(summaryContainsSensitiveValue(result.summary, FAKE_HWADDR)).toBe(false);
        expect(calls).toEqual([
            { path: NATIVE_HOST_PATH, superuser: 'require' },
            { path: NATIVE_DEVICES_PATH, superuser: 'require' },
        ]);
        expect(nativeInventoryPaths().host).toBe('/root/HW_PROBE/LATEST/hw.info/host');
        expect(JSON.stringify(calls)).not.toContain('/var/roothome');
        expect(calls.every(call => call.superuser !== 'try')).toBe(true);
    });

    it('returns empty when LATEST host and devices are both missing', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: null },
            [NATIVE_DEVICES_PATH]: { content: null },
        });
        await expect(loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile }))
                .resolves.toEqual({ status: 'empty' });
    });

    it('reports host-missing when only host is absent', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: null },
            [NATIVE_DEVICES_PATH]: { content: VALID_DEVICES_FIXTURE },
        });
        const result = await loadHardwareInventory(USER_LOCAL, { readFile });
        expect(result).toMatchObject({ status: 'failed', error: { kind: 'host-missing' } });
    });

    it('reports devices-missing when only devices are absent', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: VALID_HOST_FIXTURE },
            [NATIVE_DEVICES_PATH]: { content: null },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result).toMatchObject({ status: 'failed', error: { kind: 'devices-missing' } });
    });

    it('maps privileged access-denied to administrative-access-required', async () => {
        const { readFile, calls } = fakeReader({
            [NATIVE_HOST_PATH]: { error: accessDenied() },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result).toMatchObject({
            status: 'failed',
            error: { kind: 'administrative-access-required' },
        });
        expect(calls[0]).toEqual({ path: NATIVE_HOST_PATH, superuser: 'require' });
    });

    it('maps a generic read failure', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { error: { problem: 'internal-error' } },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result).toMatchObject({ status: 'failed', error: { kind: 'read-failed' } });
    });

    it('maps malformed host independently of probe execution', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: 'not a host file' },
            [NATIVE_DEVICES_PATH]: { content: VALID_DEVICES_FIXTURE },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result).toMatchObject({ status: 'failed', error: { kind: 'malformed-host' } });
    });

    it('maps malformed devices independently of probe execution', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: VALID_HOST_FIXTURE },
            [NATIVE_DEVICES_PATH]: { content: 'garbage' },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(result).toMatchObject({ status: 'failed', error: { kind: 'malformed-devices' } });
    });

    it('reads Flatpak inventory unprivileged from the documented data directory', async () => {
        const host = '/home/testuser/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE/LATEST/hw.info/host';
        const devices = '/home/testuser/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE/LATEST/hw.info/devices';
        const { readFile, calls } = fakeReader({
            [host]: { content: VALID_HOST_FIXTURE },
            [devices]: { content: VALID_DEVICES_FIXTURE },
        });
        const result = await loadHardwareInventory(FLATPAK_INVOCATION, {
            readFile,
            getUserHome: async () => '/home/testuser',
        });
        expect(result.status).toBe('ready');
        expect(calls[0]).toEqual({ path: host });
        expect(calls[1]).toEqual({ path: devices });
        expect(calls[0]).not.toHaveProperty('superuser');
        expect(calls[1]).not.toHaveProperty('superuser');
    });

    it('does not spawn hw-probe while reading inventory', async () => {
        const { readFile, calls } = fakeReader({
            [NATIVE_HOST_PATH]: { content: VALID_HOST_FIXTURE },
            [NATIVE_DEVICES_PATH]: { content: VALID_DEVICES_FIXTURE },
        });
        await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(calls.every(call => call.path === NATIVE_HOST_PATH || call.path === NATIVE_DEVICES_PATH)).toBe(true);
        expect(JSON.stringify(calls)).not.toContain('-all');
        expect(JSON.stringify(calls)).not.toContain('-upload');
        expect(JSON.stringify(calls)).not.toContain('-check');
        expect(JSON.stringify(calls)).not.toContain('-show');
        expect(JSON.stringify(calls)).not.toContain('/logs');
        expect(JSON.stringify(calls)).not.toContain('/usr/bin/cat');
    });

    it('reloads inventory after a successful probe when the two files appear', async () => {
        const files: Record<string, { content?: string | null }> = {
            [NATIVE_HOST_PATH]: { content: null },
            [NATIVE_DEVICES_PATH]: { content: null },
        };
        const readFile: InventoryFileReader = async (path) => files[path]?.content ?? null;
        const before = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        expect(before.status).toBe('empty');
        files[NATIVE_HOST_PATH] = { content: VALID_HOST_FIXTURE };
        files[NATIVE_DEVICES_PATH] = { content: VALID_DEVICES_FIXTURE };
        const after = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        const reconciled = reconcileInventoryWithProbe(after, {
            status: 'succeeded',
            startedAt: 1,
            completedAt: 2,
        });
        expect(reconciled.status).toBe('ready');
        if (reconciled.status !== 'ready')
            return;
        expect(reconciled.summary.host.physicalCoreCount).toBe(6);
        expect(summaryContainsSensitiveValue(reconciled.summary, FAKE_HWADDR)).toBe(false);
    });

    it('keeps probe success distinct from a later parse failure', async () => {
        const { readFile } = fakeReader({
            [NATIVE_HOST_PATH]: { content: '????' },
            [NATIVE_DEVICES_PATH]: { content: VALID_DEVICES_FIXTURE },
        });
        const result = await loadHardwareInventory(PATH_DUMPVERSION_INVOCATION, { readFile });
        const reconciled = reconcileInventoryWithProbe(result, {
            status: 'succeeded',
            startedAt: 1,
            completedAt: 2,
        });
        expect(reconciled).toMatchObject({ status: 'failed', error: { kind: 'malformed-host' } });
        expect(JSON.stringify(reconciled)).not.toMatch(/hardware probe failed/i);
    });

    it('does not read native /root paths for a Flatpak invocation', async () => {
        const { readFile, calls } = fakeReader({});
        await loadHardwareInventory(FLATPAK_INVOCATION, {
            readFile,
            getUserHome: async () => '/home/testuser',
        });
        expect(calls.some(call => call.path.startsWith('/root/HW_PROBE'))).toBe(false);
        expect(JSON.stringify(calls)).not.toContain('/var/roothome');
    });

    it('returns inventory-unavailable when Flatpak home cannot be used', async () => {
        const { readFile } = fakeReader({});
        const result = await loadHardwareInventory(FLATPAK_INVOCATION, {
            readFile,
            getUserHome: async () => '../not-a-home',
        });
        expect(result).toMatchObject({
            status: 'failed',
            error: { kind: 'inventory-unavailable' },
        });
    });
});

describe('reconcileInventoryWithProbe', () => {
    it('treats missing inventory after a successful probe as a parse/read failure', () => {
        const succeeded: ProbeExecutionState = {
            status: 'succeeded',
            startedAt: 1,
            completedAt: 2,
        };
        const reconciled = reconcileInventoryWithProbe({ status: 'empty' }, succeeded);
        expect(reconciled).toMatchObject({
            status: 'failed',
            error: { kind: 'missing' },
        });
        expect(reconciled.status === 'failed' && reconciled.error.message).toMatch(/inventory could not be read/);
        expect(JSON.stringify(reconciled)).not.toMatch(/hardware probe failed/i);
    });

    it('keeps empty inventory when no probe has completed', () => {
        expect(reconcileInventoryWithProbe({ status: 'empty' }, { status: 'idle' })).toEqual({ status: 'empty' });
    });
});
