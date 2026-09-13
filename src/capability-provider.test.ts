import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectHwProbeCapability, resolveHwProbe } from './capability-provider';
import {
    dumpversionArgv,
    FLATPAK_INFO_ARGV,
    FLATPAK_INVOCATION,
    PATH_DUMPVERSION_INVOCATION,
    userLocalInvocation,
} from './executable';
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

function accessDeniedError() {
    return { problem: 'access-denied', exit_status: null, exit_signal: null, message: '' };
}

function commandFailedError(exitStatus = 1) {
    return { problem: null, exit_status: exitStatus, exit_signal: null, message: '' };
}

function argvKey(args: readonly string[]): string {
    return JSON.stringify([...args]);
}

const PATH_DUMPVERSION_ARGV = dumpversionArgv(PATH_DUMPVERSION_INVOCATION);
const USER_LOCAL_HOME = '/home/testuser';
const USER_LOCAL_INVOCATION = userLocalInvocation(USER_LOCAL_HOME);
if (USER_LOCAL_INVOCATION == null)
    throw new Error('test fixture: user-local invocation must be constructible');
const USER_LOCAL_DUMPVERSION_ARGV = dumpversionArgv(USER_LOCAL_INVOCATION);
const FLATPAK_DUMPVERSION_ARGV = dumpversionArgv(FLATPAK_INVOCATION);

type FakeOutcome = { stdout?: string; error?: unknown; hang?: boolean };

function fakeSpawn(options: {
    stdout?: string;
    error?: unknown;
    hang?: boolean;
    byExecutable?: Record<string, FakeOutcome>;
    byArgv?: Record<string, FakeOutcome>;
}): { spawn: SpawnFn; close: ReturnType<typeof vi.fn>; calls: Array<{ args: string[]; spawnOptions?: object }> } {
    const close = vi.fn();
    const calls: Array<{ args: string[]; spawnOptions?: object }> = [];

    const spawn: SpawnFn = (args, spawnOptions) => {
        const call: { args: string[]; spawnOptions?: object } = { args };
        if (spawnOptions !== undefined)
            call.spawnOptions = spawnOptions;
        calls.push(call);
        const result = deferred<string>();
        const selected = options.byArgv?.[argvKey(args)] ??
                (args[0] !== undefined ? options.byExecutable?.[args[0]] : undefined) ??
                {
                    stdout: options.stdout,
                    error: options.error,
                    hang: options.hang,
                };
        if (!selected.hang) {
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

function nativeAndUserLocalMissing(flatpak: Record<string, FakeOutcome> = {}): Record<string, FakeOutcome> {
    return {
        [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
        [argvKey(USER_LOCAL_DUMPVERSION_ARGV)]: { error: notFoundError() },
        ...flatpak,
    };
}

function expectNoShell(calls: Array<{ args: string[] }>) {
    for (const call of calls) {
        expect(call.args).not.toEqual(expect.arrayContaining(['sh', '-c']));
        expect(call.args).not.toEqual(expect.arrayContaining(['bash', '-c']));
        expect(call.args.join(' ')).not.toContain('-upload');
        expect(call.args.join(' ')).not.toContain('-all');
        expect(call.args.join(' ')).not.toContain('-check');
    }
}

afterEach(() => {
    vi.useRealTimers();
});

describe('detectHwProbeCapability', () => {
    it('returns available with a normalized version from PATH', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: '1.6.6' });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
            source: 'native-path',
        });
        expect(calls[0].args).toEqual([...HW_PROBE_DUMPVERSION_ARGV]);
        expect(calls[0].spawnOptions).toEqual({
            err: 'ignore',
            environ: [...HW_PROBE_SPAWN_ENVIRON],
        });
        expect(calls[0].spawnOptions).not.toHaveProperty('superuser');
    });

    it('does not request Cockpit administrative privilege during capability detection', async () => {
        const pathLookup = fakeSpawn({ stdout: '1.6' });
        await detectHwProbeCapability(pathLookup.spawn);
        expect(pathLookup.calls).toHaveLength(1);
        expect(pathLookup.calls[0].spawnOptions).not.toHaveProperty('superuser');

        const userLocal = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(USER_LOCAL_DUMPVERSION_ARGV)]: { stdout: '1.6' },
            },
        });
        await detectHwProbeCapability(userLocal.spawn, async () => USER_LOCAL_HOME);
        expect(userLocal.calls.length).toBeGreaterThan(0);
        for (const call of userLocal.calls)
            expect(call.spawnOptions).not.toHaveProperty('superuser');

        const flatpak = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { stdout: '1.6' },
            }),
        });
        await detectHwProbeCapability(flatpak.spawn, async () => USER_LOCAL_HOME);
        expect(flatpak.calls.some(call => call.args[0] === 'flatpak')).toBe(true);
        for (const call of flatpak.calls)
            expect(call.spawnOptions).not.toHaveProperty('superuser');
    });

    it('returns the resolved native invocation for later probe execution', async () => {
        const { spawn } = fakeSpawn({ stdout: '1.6.6' });
        await expect(resolveHwProbe(spawn)).resolves.toEqual({
            capability: {
                state: 'available',
                version: '1.6.6',
                source: 'native-path',
            },
            invocation: PATH_DUMPVERSION_INVOCATION,
        });
    });

    it('normalizes a version with a trailing newline', async () => {
        const { spawn } = fakeSpawn({ stdout: '1.6.6\n' });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
            source: 'native-path',
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

    it('returns unavailable when PATH, user-local, and Flatpak are all missing', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { error: notFoundError() },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'unavailable',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
        ]);
        expect(calls.some(call => call.args.join(' ') === FLATPAK_DUMPVERSION_ARGV.join(' '))).toBe(false);
        expectNoShell(calls);
    });

    it('does not fall back when PATH lookup is permission-denied', async () => {
        const { spawn, calls } = fakeSpawn({
            error: accessDeniedError(),
        });
        await expect(detectHwProbeCapability(spawn)).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
            },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(PATH_DUMPVERSION_ARGV);
    });

    it('returns command-failed for a generic non-zero exit', async () => {
        const { spawn, calls } = fakeSpawn({
            error: commandFailedError(1),
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
        expect(calls[0].args).toEqual(PATH_DUMPVERSION_ARGV);
        expectNoShell(calls);
    });

    it('does not require fallback when PATH lookup succeeds', async () => {
        const getUserHome = vi.fn(async () => USER_LOCAL_HOME);
        const { spawn, calls } = fakeSpawn({ stdout: '1.6.6' });
        await expect(detectHwProbeCapability(spawn, getUserHome)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
            source: 'native-path',
        });
        expect(getUserHome).not.toHaveBeenCalled();
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(PATH_DUMPVERSION_ARGV);
        expect(calls.some(call => call.args[0] === 'flatpak')).toBe(false);
    });

    it('falls back to ~/.local/bin/hw-probe after PATH command-not-found', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(USER_LOCAL_DUMPVERSION_ARGV)]: { stdout: '1.6.6' },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'available',
            version: '1.6.6',
            source: 'user-local',
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
        ]);
        expect(calls.some(call => call.args[0] === 'flatpak')).toBe(false);
    });

    it('reports malformed-output from the user-local executable', async () => {
        const { spawn } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(USER_LOCAL_DUMPVERSION_ARGV)]: { stdout: '' },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'malformed-output',
                message: 'hw-probe version output was malformed',
            },
        });
    });

    it('reports permission-denied from the user-local executable without trying Flatpak', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(USER_LOCAL_DUMPVERSION_ARGV)]: { error: accessDeniedError() },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
        ]);
        expect(calls.some(call => call.args[0] === 'flatpak')).toBe(false);
    });

    it('still tries Flatpak when user-home lookup fails, then reports the home error if Flatpak is also missing', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(FLATPAK_INFO_ARGV)]: { error: notFoundError() },
            },
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
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
        ]);
    });

    it('returns a controlled error when the home directory is invalid and Flatpak is missing', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(FLATPAK_INFO_ARGV)]: { error: commandFailedError(1) },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => '../not-a-home')).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'unknown',
                message: 'authenticated user home directory is unavailable',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
        ]);
    });

    it('uses Flatpak when home lookup fails but the official Flatpak is installed', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_DUMPVERSION_ARGV)]: { error: notFoundError() },
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { stdout: '1.6\n' },
            },
        });
        await expect(detectHwProbeCapability(spawn, async () => {
            throw new Error('no user info');
        })).resolves.toEqual({
            state: 'available',
            version: '1.6',
            source: 'flatpak',
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
            FLATPAK_DUMPVERSION_ARGV,
        ]);
    });

    it('discovers the official Flatpak after native PATH and user-local lookups fail', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { stdout: '1.6\n' },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'available',
            version: '1.6',
            source: 'flatpak',
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
            FLATPAK_DUMPVERSION_ARGV,
        ]);
        expect(calls[3].spawnOptions).toEqual({
            err: 'ignore',
            environ: [...HW_PROBE_SPAWN_ENVIRON],
        });
        expectNoShell(calls);
    });

    it('returns unavailable when Flatpak itself is missing', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { error: notFoundError() },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'unavailable',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
        ]);
        expect(calls.some(call => call.args.join(' ') === FLATPAK_DUMPVERSION_ARGV.join(' '))).toBe(false);
    });

    it('returns unavailable when Flatpak is present but the hw-probe app is not installed', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { error: commandFailedError(1) },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'unavailable',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
        ]);
        expect(calls.some(call => call.args.join(' ') === FLATPAK_DUMPVERSION_ARGV.join(' '))).toBe(false);
    });

    it('reports command-failed when the Flatpak app is installed but launch fails', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { error: commandFailedError(1) },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'command-failed',
                message: 'hw-probe exited with status 1',
            },
        });
        expect(calls.map(call => call.args)).toEqual([
            PATH_DUMPVERSION_ARGV,
            USER_LOCAL_DUMPVERSION_ARGV,
            [...FLATPAK_INFO_ARGV],
            FLATPAK_DUMPVERSION_ARGV,
        ]);
    });

    it('does not classify a post-install Flatpak not-found as missing', async () => {
        const { spawn } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { error: notFoundError() },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'command-failed',
                message: 'hw-probe Flatpak is installed but failed to launch',
            },
        });
    });

    it('reports malformed-output from the Flatpak version query', async () => {
        const { spawn } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { stdout: 'Probe for hardware ... Ok\n' },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'error',
            error: {
                kind: 'malformed-output',
                message: 'hw-probe version output was malformed',
            },
        });
    });

    it('reports timeout from the Flatpak version query', async () => {
        vi.useFakeTimers();
        const { spawn, close } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { hang: true },
            }),
        });
        const pending = detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME);
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

    it('reports permission-denied from the Flatpak version query', async () => {
        const { spawn } = fakeSpawn({
            byArgv: nativeAndUserLocalMissing({
                [argvKey(FLATPAK_INFO_ARGV)]: { stdout: 'app/org.linux_hardware.hw-probe/x86_64/stable\n' },
                [argvKey(FLATPAK_DUMPVERSION_ARGV)]: { error: accessDeniedError() },
            }),
        });
        await expect(detectHwProbeCapability(spawn, async () => USER_LOCAL_HOME)).resolves.toEqual({
            state: 'permission-denied',
            error: {
                kind: 'permission-denied',
                message: 'execution of hw-probe was denied',
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
