import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectHwProbeCapability } from './capability-provider';
import {
    CAPABILITY_TIMEOUT_MS,
    HW_PROBE_DUMPVERSION_ARGV,
    HW_PROBE_SPAWN_ENVIRON,
    spawnWithTimeout,
    timeoutFailure,
    type SpawnFn,
    type SpawnProcess,
} from './spawn';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function fakeSpawn(options: {
    stdout?: string;
    error?: unknown;
    hang?: boolean;
}): { spawn: SpawnFn; close: ReturnType<typeof vi.fn>; calls: Array<{ args: string[]; spawnOptions?: object }> } {
    const close = vi.fn();
    const calls: Array<{ args: string[]; spawnOptions?: object }> = [];

    const spawn: SpawnFn = (args, spawnOptions) => {
        calls.push({ args, spawnOptions });
        const result = deferred<string>();
        if (!options.hang) {
            if (options.error !== undefined)
                queueMicrotask(() => result.reject(options.error));
            else
                queueMicrotask(() => result.resolve(options.stdout ?? ''));
        }

        const process = result.promise as unknown as SpawnProcess;
        process.close = close;
        return process;
    };

    return { spawn, close, calls };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('detectHwProbeCapability', () => {
    it('returns available with a normalized version', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: '1.6.6' });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
        });
        expect(calls[0].args).toEqual([...HW_PROBE_DUMPVERSION_ARGV]);
        expect(calls[0].spawnOptions).toEqual({
            err: 'ignore',
            environ: [...HW_PROBE_SPAWN_ENVIRON],
        });
    });

    it('normalizes a version with a trailing newline', async () => {
        const { spawn } = fakeSpawn({ stdout: '1.6.6\n' });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
        });
    });

    it('returns malformed-output for empty stdout', async () => {
        const { spawn } = fakeSpawn({ stdout: '' });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'malformed-output',
                message: 'hw-probe version output was malformed',
            },
        });
    });

    it('returns malformed-output for garbage stdout', async () => {
        const { spawn } = fakeSpawn({ stdout: 'Probe for hardware ... Ok\n' });
        await expect(detectHwProbeCapability(spawn)).resolves.toMatchObject({
            state: 'error',
            error: { kind: 'malformed-output' },
        });
    });

    it('returns unavailable for a missing executable', async () => {
        const { spawn } = fakeSpawn({
            error: { problem: 'not-found', exit_status: null, exit_signal: null, message: '' },
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'unavailable',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
    });

    it('returns permission-denied when execution is denied', async () => {
        const { spawn } = fakeSpawn({
            error: { problem: 'access-denied', exit_status: null, exit_signal: null, message: '' },
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
            },
        });
    });

    it('returns command-failed for a generic non-zero exit', async () => {
        const { spawn } = fakeSpawn({
            error: { problem: null, exit_status: 1, exit_signal: null, message: '' },
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'command-failed',
                message: 'hw-probe exited with status 1',
            },
        });
    });

    it('uses only the dumpversion argv', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: '1.6\n' });
        await detectHwProbeCapability(spawn);
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(['hw-probe', '-dumpversion']);
        expect(calls[0].args.join(' ')).not.toContain('-upload');
        expect(calls[0].args.join(' ')).not.toContain('-all');
        expect(calls[0].args.join(' ')).not.toContain('-check');
    });
});

describe('spawnWithTimeout', () => {
    it('closes the process and reports timeout when the query hangs', async () => {
        vi.useFakeTimers();
        const { spawn, close } = fakeSpawn({ hang: true });
        const pending = spawnWithTimeout(spawn, HW_PROBE_DUMPVERSION_ARGV, {
            timeoutMs: CAPABILITY_TIMEOUT_MS,
        });
        const expectTimeout = expect(pending).rejects.toEqual(timeoutFailure());
        await vi.advanceTimersByTimeAsync(CAPABILITY_TIMEOUT_MS);
        await expectTimeout;
        expect(close).toHaveBeenCalledWith('timeout');
    });

    it('clears the timer after a successful query', async () => {
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
        const { spawn } = fakeSpawn({ stdout: '1.6\n' });
        await expect(spawnWithTimeout(spawn, ['hw-probe', '-dumpversion'], { timeoutMs: 50 }))
                .resolves.toBe('1.6\n');
        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });
});
