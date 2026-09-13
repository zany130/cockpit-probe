import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    buildLocalProbeArgv,
    FLATPAK_INVOCATION,
    PATH_DUMPVERSION_INVOCATION,
    isUploadArgument,
} from './executable';
import { buildProbeSpawnOptions, createProbeController } from './probe-provider';
import {
    HW_PROBE_SPAWN_ENVIRON,
    NATIVE_PROBE_SUPERUSER,
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

function argvKey(args: readonly string[]): string {
    return JSON.stringify([...args]);
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

type FakeOutcome = { stdout?: string; error?: unknown; hang?: boolean };

function fakeSpawn(options: {
    stdout?: string;
    error?: unknown;
    hang?: boolean;
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
        const selected = options.byArgv?.[argvKey(args)] ?? {
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

const USER_LOCAL_INVOCATION = {
    kind: 'native' as const,
    executable: '/home/testuser/.local/bin/hw-probe',
    source: 'user-local' as const,
};

const PATH_ABSOLUTE_INVOCATION = {
    kind: 'native' as const,
    executable: '/usr/bin/hw-probe',
    source: 'native-path' as const,
};

const NATIVE_PROBE_ARGV = buildLocalProbeArgv(PATH_DUMPVERSION_INVOCATION);
const PATH_ABSOLUTE_PROBE_ARGV = buildLocalProbeArgv(PATH_ABSOLUTE_INVOCATION);
const USER_LOCAL_PROBE_ARGV = buildLocalProbeArgv(USER_LOCAL_INVOCATION);
const FLATPAK_PROBE_ARGV = buildLocalProbeArgv(FLATPAK_INVOCATION);

const NATIVE_SPAWN_OPTIONS = {
    err: 'ignore',
    environ: [...HW_PROBE_SPAWN_ENVIRON],
    superuser: NATIVE_PROBE_SUPERUSER,
};

const FLATPAK_SPAWN_OPTIONS = {
    err: 'ignore',
    environ: [...HW_PROBE_SPAWN_ENVIRON],
};

const SUCCESS_STDOUT = [
    'Probe for hardware ... Ok',
    'Reading logs ... Ok',
    'Local probe path: /root/HW_PROBE/LATEST/hw.info',
    '',
].join('\n');

afterEach(() => {
    vi.useRealTimers();
});

describe('buildProbeSpawnOptions', () => {
    it('requires Cockpit administrative privilege for native probes', () => {
        expect(buildProbeSpawnOptions(PATH_DUMPVERSION_INVOCATION)).toEqual({
            superuser: 'require',
        });
        expect(buildProbeSpawnOptions(PATH_ABSOLUTE_INVOCATION)).toEqual({
            superuser: 'require',
        });
        expect(buildProbeSpawnOptions(USER_LOCAL_INVOCATION)).toEqual({
            superuser: 'require',
        });
        expect(buildProbeSpawnOptions(PATH_DUMPVERSION_INVOCATION).superuser).not.toBe('try');
    });

    it('does not privilege Flatpak probes', () => {
        expect(buildProbeSpawnOptions(FLATPAK_INVOCATION)).toEqual({});
        expect(buildProbeSpawnOptions(FLATPAK_INVOCATION)).not.toHaveProperty('superuser');
    });
});

describe('createProbeController', () => {
    it('runs a native PATH probe to success with privileged spawn', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(NATIVE_PROBE_ARGV)]: { stdout: SUCCESS_STDOUT },
            },
        });
        const controller = createProbeController({ spawn, now: () => 1000 });
        const states: string[] = [];
        controller.subscribe(state => states.push(state.status));

        await controller.run(PATH_DUMPVERSION_INVOCATION);

        expect(states).toEqual(['idle', 'running', 'succeeded']);
        expect(controller.getState()).toEqual({
            status: 'succeeded',
            startedAt: 1000,
            completedAt: 1000,
            artifactPath: '/root/HW_PROBE/LATEST/hw.info',
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toEqual(['hw-probe', '-all']);
        expect(calls[0].spawnOptions).toEqual(NATIVE_SPAWN_OPTIONS);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(JSON.stringify(calls[0].spawnOptions)).not.toContain('"try"');
    });

    it('runs a native /usr/bin/hw-probe install with -all and superuser require', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(PATH_ABSOLUTE_PROBE_ARGV)]: { stdout: SUCCESS_STDOUT },
            },
        });
        const controller = createProbeController({ spawn, now: () => 1001 });
        await controller.run(PATH_ABSOLUTE_INVOCATION);
        expect(calls[0].args).toEqual(['/usr/bin/hw-probe', '-all']);
        expect(calls[0].spawnOptions).toEqual(NATIVE_SPAWN_OPTIONS);
        expect(controller.getState().status).toBe('succeeded');
    });

    it('runs a user-local probe with the exact argv and privileged spawn', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(USER_LOCAL_PROBE_ARGV)]: { stdout: SUCCESS_STDOUT },
            },
        });
        const controller = createProbeController({ spawn, now: () => 5 });
        await controller.run(USER_LOCAL_INVOCATION);
        expect(calls.map(call => call.args)).toEqual([
            ['/home/testuser/.local/bin/hw-probe', '-all'],
        ]);
        expect(calls[0].spawnOptions).toEqual(NATIVE_SPAWN_OPTIONS);
        expect(controller.getState().status).toBe('succeeded');
    });

    it('runs a Flatpak probe unprivileged with flatpak run argv', async () => {
        const { spawn, calls } = fakeSpawn({
            byArgv: {
                [argvKey(FLATPAK_PROBE_ARGV)]: { stdout: SUCCESS_STDOUT },
            },
        });
        const controller = createProbeController({ spawn, now: () => 9 });
        await controller.run(FLATPAK_INVOCATION);
        expect(calls[0].args).toEqual([
            'flatpak',
            'run',
            'org.linux_hardware.hw-probe',
            '-all',
        ]);
        expect(calls[0].spawnOptions).toEqual(FLATPAK_SPAWN_OPTIONS);
        expect(calls[0].spawnOptions).not.toHaveProperty('superuser');
        expect(controller.getState()).toMatchObject({
            status: 'succeeded',
            artifactPath: '/root/HW_PROBE/LATEST/hw.info',
        });
    });

    it('normalizes a non-zero exit as a genuine command failure after privilege is granted', async () => {
        const { spawn, calls } = fakeSpawn({
            error: commandFailedError(1),
        });
        const controller = createProbeController({ spawn, now: () => 1 });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(controller.getState()).toEqual({
            status: 'failed',
            startedAt: 1,
            completedAt: 1,
            error: {
                kind: 'command-failed',
                message: 'hw-probe exited with status 1',
            },
        });
    });

    it('normalizes native privileged access-denied as administrative-access-required', async () => {
        const { spawn, calls } = fakeSpawn({ error: accessDeniedError() });
        const controller = createProbeController({ spawn, now: () => 2 });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(calls[0].args).toEqual(['hw-probe', '-all']);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(controller.getState()).toEqual({
            status: 'failed',
            startedAt: 2,
            completedAt: 2,
            error: {
                kind: 'administrative-access-required',
                message: 'Administrative access is required to run a native hardware probe',
            },
        });
    });

    it('normalizes user-local privileged access-denied as administrative-access-required', async () => {
        const { spawn, calls } = fakeSpawn({ error: accessDeniedError() });
        const controller = createProbeController({ spawn, now: () => 2 });
        await controller.run(USER_LOCAL_INVOCATION);
        expect(calls[0].args).toEqual(['/home/testuser/.local/bin/hw-probe', '-all']);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'administrative-access-required' },
        });
    });

    it('reports timeout when the probe exceeds the probe timeout', async () => {
        vi.useFakeTimers();
        const { spawn, close } = fakeSpawn({ hang: true });
        const controller = createProbeController({ spawn, now: () => 3, timeoutMs: 50 });
        const pending = controller.run(PATH_DUMPVERSION_INVOCATION);
        await vi.advanceTimersByTimeAsync(50);
        await pending;
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'timeout', message: 'hardware probe timed out' },
        });
        expect(close).toHaveBeenCalledWith('timeout');
    });

    it('cancels only the spawned process and reports cancelled', async () => {
        const { spawn, close } = fakeSpawn({ hang: true });
        const controller = createProbeController({ spawn, now: () => 4, timeoutMs: 60_000 });
        const pending = controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState().status).toBe('running');
        controller.cancel();
        await pending;
        expect(close).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledWith('cancelled');
        expect(controller.getState().status).toBe('cancelled');
    });

    it('does not start a second probe while one is running', async () => {
        const { spawn, calls } = fakeSpawn({ hang: true });
        const controller = createProbeController({ spawn, now: () => 6, timeoutMs: 60_000 });
        const first = controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState().status).toBe('running');
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(calls).toHaveLength(1);
        controller.cancel();
        await first;
    });

    it('reports a controlled error when the executable disappears after detection', async () => {
        const { spawn } = fakeSpawn({ error: notFoundError() });
        const controller = createProbeController({ spawn, now: () => 7 });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: {
                kind: 'command-not-found',
                message: 'hw-probe executable was not found',
            },
        });
    });

    it('reports a Flatpak launch failure instead of missing', async () => {
        const { spawn } = fakeSpawn({ error: notFoundError() });
        const controller = createProbeController({ spawn, now: () => 8 });
        await controller.run(FLATPAK_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: {
                kind: 'command-failed',
                message: 'hw-probe Flatpak is installed but failed to launch',
            },
        });
    });

    it('never sends an upload flag for native, user-local, or Flatpak probes', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: SUCCESS_STDOUT });
        const controller = createProbeController({ spawn, now: () => 10 });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        await controller.run(USER_LOCAL_INVOCATION);
        await controller.run(FLATPAK_INVOCATION);
        expect(calls).toHaveLength(3);
        for (const call of calls) {
            expect(call.args.some(isUploadArgument)).toBe(false);
            expect(call.args).toContain('-all');
            expect(call.args).not.toContain('-probe');
            expect(call.args.join(' ')).not.toContain('-upload');
            expect(call.args[0]).not.toBe('sh');
            expect(call.args[0]).not.toBe('bash');
            expect(call.args[0]).not.toBe('sudo');
            expect(call.args[0]).not.toBe('pkexec');
            expect(call.args).not.toContain('su');
        }
        expect(calls[0].args).toEqual(NATIVE_PROBE_ARGV);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(calls[1].args).toEqual(USER_LOCAL_PROBE_ARGV);
        expect(calls[1].spawnOptions).toMatchObject({ superuser: 'require' });
        expect(calls[2].args).toEqual(FLATPAK_PROBE_ARGV);
        expect(calls[2].spawnOptions).not.toHaveProperty('superuser');
    });
});
