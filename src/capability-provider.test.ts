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
    const pending: {
        promise: Promise<T>;
        resolve: (value: T | PromiseLike<T>) => void;
        reject: (reason?: unknown) => void;
    } = {
        promise: Promise.resolve() as Promise<T>,
        resolve: () => undefined,
        reject: () => undefined,
    };
    pending.promise = new Promise<T>((resolve, reject) => {
        pending.resolve = resolve;
        pending.reject = reject;
    });
    return pending;
}

function notFoundError() {
    return { problem: 'not-found', exit_status: null, exit_signal: null, message: '' };
}

function fakeSpawn(options: {
    stdout?: string;
    error?: unknown;
    hang?: boolean;
    byExecutable?: Record<string, { stdout?: string; error?: unknown }>;
}): { spawn: SpawnFn; close: ReturnType<typeof vi.fn>; calls: Array<{ args: string[]; spawnOptions?: object }> } {
    const close = vi.fn();
    const calls: Array<{ args: string[]; spawnOptions?: object }> = [];

    const spawn: SpawnFn = (args, spawnOptions) => {
        const call: { args: string[]; spawnOptions?: object } = { args };
        if (spawnOptions !== undefined)
            call.spawnOptions = spawnOptions;
        calls.push(call);
        const result = deferred<string>();
        const selected = options.byExecutable?.[args[0]] ?? {
            stdout: options.stdout,
            error: options.error,
        };
        if (!options.hang) {
            if (selected.error !== undefined)
                queueMicrotask(() => result.reject(selected.error));
            else
                queueMicrotask(() => result.resolve(selected.stdout ?? ''));
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

    it('returns unavailable when PATH and user-local executables are missing', async () => {
        const { spawn, calls } = fakeSpawn({
            error: notFoundError(),
        });
        await expect(detectHwProbeCapability(spawn, async () => '/home/testuser')).resolves.toEqual({
            state: 'unavailable',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            ['hw-probe', '-dumpversion'],
            ['/home/testuser/.local/bin/hw-probe', '-dumpversion'],
        ]);
    });

    it('does not fall back when PATH lookup is permission-denied', async () => {
        const { spawn, calls } = fakeSpawn({
            error: { problem: 'access-denied', exit_status: null, exit_signal: null, message: '' },
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
            },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(['hw-probe', '-dumpversion']);
    });

    it('returns command-failed for a generic non-zero exit', async () => {
        const { spawn, calls } = fakeSpawn({
            error: { problem: null, exit_status: 1, exit_signal: null, message: '' },
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'command-failed',
                message: 'hw-probe exited with status 1',
            },
        });
        expect(calls).toHaveLength(1);
    });

    it('returns timeout when the version query hangs', async () => {
        vi.useFakeTimers();
        const { spawn, close } = fakeSpawn({ hang: true });
        const pending = detectHwProbeCapability(spawn);
        const expectTimeout = expect(pending).resolves.toEqual({
            state: 'timeout',
            error: {
                kind: 'timeout',
                message: 'hw-probe version query timed out',
            },
        });
        await vi.advanceTimersByTimeAsync(CAPABILITY_TIMEOUT_MS);
        await expectTimeout;
        expect(close).toHaveBeenCalledWith('timeout');
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

    it('does not require fallback when PATH lookup succeeds', async () => {
        const getUserHome = vi.fn(async () => '/home/testuser');
        const { spawn, calls } = fakeSpawn({ stdout: '1.6.6' });
        await expect(detectHwProbeCapability(spawn, getUserHome)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
        });
        expect(getUserHome).not.toHaveBeenCalled();
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(['hw-probe', '-dumpversion']);
    });

    it('falls back to ~/.local/bin/hw-probe after PATH command-not-found', async () => {
        const { spawn, calls } = fakeSpawn({
            byExecutable: {
                'hw-probe': { error: notFoundError() },
                '/home/testuser/.local/bin/hw-probe': { stdout: '1.6.6' },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => '/home/testuser')).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
        });
        expect(calls.map(call => call.args)).toEqual([
            ['hw-probe', '-dumpversion'],
            ['/home/testuser/.local/bin/hw-probe', '-dumpversion'],
        ]);
    });

    it('reports malformed-output from the user-local executable', async () => {
        const { spawn } = fakeSpawn({
            byExecutable: {
                'hw-probe': { error: notFoundError() },
                '/home/testuser/.local/bin/hw-probe': { stdout: '' },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => '/home/testuser')).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'malformed-output',
                message: 'hw-probe version output was malformed',
            },
        });
    });

    it('reports permission-denied from the user-local executable', async () => {
        const { spawn } = fakeSpawn({
            byExecutable: {
                'hw-probe': { error: notFoundError() },
                '/home/testuser/.local/bin/hw-probe': {
                    error: { problem: 'access-denied', exit_status: null, exit_signal: null, message: '' },
                },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => '/home/testuser')).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
            },
        });
    });

    it('returns a controlled error when user-home lookup fails', async () => {
        const { spawn, calls } = fakeSpawn({
            error: notFoundError(),
        });
        await expect(detectHwProbeCapability(spawn, async () => {
            throw new Error('no user info');
        })).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'unknown',
                message: 'authenticated user home directory is unavailable',
            },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(['hw-probe', '-dumpversion']);
    });

    it('returns a controlled error when the home directory is invalid', async () => {
        const { spawn } = fakeSpawn({
            error: notFoundError(),
        });
        await expect(detectHwProbeCapability(spawn, async () => '../not-a-home')).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'unknown',
                message: 'authenticated user home directory is unavailable',
            },
        });
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
