import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    FLATPAK_INVOCATION,
    PATH_DUMPVERSION_INVOCATION,
    isUploadArgument,
} from './executable';
import {
    HW_PROBE_SPAWN_ENVIRON,
    NATIVE_PROBE_SUPERUSER,
    type SpawnFn,
    type SpawnProcess,
} from './spawn';
import { buildUploadSpawnOptions, createUploadController } from './upload-provider';

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

const NATIVE_UPLOAD_ARGV = ['hw-probe', '-upload'];
const USER_LOCAL_INVOCATION = {
    kind: 'native' as const,
    executable: '/home/testuser/.local/bin/hw-probe',
    source: 'user-local' as const,
};
const USER_LOCAL_UPLOAD_ARGV = ['/home/testuser/.local/bin/hw-probe', '-upload'];
const FLATPAK_UPLOAD_ARGV = ['flatpak', 'run', 'org.linux_hardware.hw-probe', '-upload'];
const SUCCESS_STDOUT = 'Probe URL: https://linux-hardware.org/?probe=b394035f90\n';

afterEach(() => {
    vi.useRealTimers();
});

describe('buildUploadSpawnOptions', () => {
    it('requires administrative access for native uploads', () => {
        expect(buildUploadSpawnOptions(PATH_DUMPVERSION_INVOCATION)).toEqual({
            superuser: NATIVE_PROBE_SUPERUSER,
        });
        expect(buildUploadSpawnOptions(USER_LOCAL_INVOCATION)).toEqual({
            superuser: NATIVE_PROBE_SUPERUSER,
        });
        expect(buildUploadSpawnOptions(FLATPAK_INVOCATION)).toEqual({});
    });
});

describe('createUploadController', () => {
    it('uploads a native PATH install with -upload and superuser require', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: SUCCESS_STDOUT });
        const controller = createUploadController({ spawn, now: () => 10 });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(calls[0].args).toEqual(NATIVE_UPLOAD_ARGV);
        expect(calls[0].spawnOptions).toMatchObject({
            superuser: 'require',
            environ: [...HW_PROBE_SPAWN_ENVIRON],
        });
        expect(controller.getState()).toMatchObject({
            status: 'succeeded',
            result: {
                url: 'https://linux-hardware.org/?probe=b394035f90',
                probeId: 'b394035f90',
            },
        });
    });

    it('uploads a user-local install with the exact argv', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: SUCCESS_STDOUT });
        const controller = createUploadController({ spawn });
        await controller.run(USER_LOCAL_INVOCATION);
        expect(calls[0].args).toEqual(USER_LOCAL_UPLOAD_ARGV);
        expect(calls[0].spawnOptions).toMatchObject({ superuser: 'require' });
    });

    it('uploads Flatpak without superuser', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: SUCCESS_STDOUT });
        const controller = createUploadController({ spawn });
        await controller.run(FLATPAK_INVOCATION);
        expect(calls[0].args).toEqual(FLATPAK_UPLOAD_ARGV);
        expect(calls[0].spawnOptions).not.toHaveProperty('superuser');
    });

    it('treats command success without a parseable URL as success', async () => {
        const { spawn } = fakeSpawn({ stdout: 'Ok\n' });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        const state = controller.getState();
        expect(state.status).toBe('succeeded');
        if (state.status !== 'succeeded')
            return;
        expect(state.result.url).toBeUndefined();
    });

    it('does not treat a foreign domain as a probe URL', async () => {
        const { spawn } = fakeSpawn({
            stdout: 'https://evil.example/?probe=b394035f90\n',
        });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        const state = controller.getState();
        expect(state.status).toBe('succeeded');
        if (state.status !== 'succeeded')
            return;
        expect(state.result.url).toBeUndefined();
    });

    it('records command failure', async () => {
        const { spawn } = fakeSpawn({
            error: { problem: null, exit_status: 1, exit_signal: null, message: 'failed to upload data' },
        });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'command-failed' },
        });
    });

    it('records a network-style curl failure', async () => {
        const { spawn } = fakeSpawn({
            error: {
                problem: null,
                exit_status: 1,
                exit_signal: null,
                message: 'failed to upload data, curl error code "7"',
            },
        });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'network-unavailable' },
        });
    });

    it('records privilege denial', async () => {
        const { spawn } = fakeSpawn({
            error: { problem: 'access-denied', exit_status: null, exit_signal: null, message: '' },
        });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'administrative-access-required' },
        });
    });

    it('times out a hung upload', async () => {
        vi.useFakeTimers();
        const { spawn } = fakeSpawn({ hang: true });
        const controller = createUploadController({ spawn, timeoutMs: 50, now: () => 1 });
        const running = controller.run(PATH_DUMPVERSION_INVOCATION);
        await vi.advanceTimersByTimeAsync(60);
        await running;
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'timeout' },
        });
    });

    it('cancels an in-flight upload', async () => {
        const { spawn, close } = fakeSpawn({ hang: true });
        const controller = createUploadController({ spawn, timeoutMs: 60_000 });
        const running = controller.run(PATH_DUMPVERSION_INVOCATION);
        controller.cancel();
        await running;
        expect(close).toHaveBeenCalledWith('cancelled');
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'cancelled' },
        });
    });

    it('records a missing local probe', async () => {
        const { spawn } = fakeSpawn({
            error: {
                problem: null,
                exit_status: 1,
                exit_signal: null,
                message: "ERROR: can't access '/root/HW_PROBE/LATEST/hw.info', please make probe first",
            },
        });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(controller.getState()).toMatchObject({
            status: 'failed',
            error: { kind: 'no-local-probe' },
        });
    });

    it('does not start a second upload while one is running', async () => {
        const { spawn, calls } = fakeSpawn({ hang: true });
        const controller = createUploadController({ spawn, timeoutMs: 60_000 });
        const first = controller.run(PATH_DUMPVERSION_INVOCATION);
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        expect(calls).toHaveLength(1);
        controller.cancel();
        await first;
    });

    it('never includes -all on the upload argv', async () => {
        const { spawn, calls } = fakeSpawn({ stdout: SUCCESS_STDOUT });
        const controller = createUploadController({ spawn });
        await controller.run(PATH_DUMPVERSION_INVOCATION);
        await controller.run(USER_LOCAL_INVOCATION);
        await controller.run(FLATPAK_INVOCATION);
        expect(calls).toHaveLength(3);
        for (const call of calls) {
            expect(call.args.some(isUploadArgument)).toBe(true);
            expect(call.args).toContain('-upload');
            expect(call.args).not.toContain('-all');
            expect(call.args[0]).not.toBe('sh');
            expect(call.args[0]).not.toBe('sudo');
            expect(call.args[0]).not.toBe('curl');
            expect(call.args[0]).not.toBe('wget');
        }
    });
});
