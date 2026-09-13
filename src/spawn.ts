/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from 'cockpit';

import { HW_PROBE_VERSION_ARGUMENT } from './executable';

export const HW_PROBE_DUMPVERSION_ARGV = ["hw-probe", HW_PROBE_VERSION_ARGUMENT] as const;

export const CAPABILITY_TIMEOUT_MS = 8000;

/*
 * Upstream says extra operability checks (`-check`) take about a minute on
 * typical desktops. Local probes use documented `-all` without `-check`.
 * v0.4 does not execute `-check`. Ten minutes is a hang-protection ceiling
 * for slower machines and large inventories, not a target duration.
 */
export const PROBE_TIMEOUT_MS = 10 * 60 * 1000;

export const HW_PROBE_SPAWN_ENVIRON = ["LC_ALL=C", "LANG=C"] as const;

export interface SpawnProcess {
    then: (
        onfulfilled?: ((value: unknown) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise<unknown>;
    catch: (onrejected?: ((reason: unknown) => unknown) | null) => Promise<unknown>;
    close: (problem?: string) => void;
}

export type NativeProbeSuperuser = "require";

export const NATIVE_PROBE_SUPERUSER: NativeProbeSuperuser = "require";

export interface SpawnOptions {
    err?: "out" | "ignore" | "message";
    environ?: string[];
    superuser?: NativeProbeSuperuser;
}

export type SpawnFn = (args: string[], options?: SpawnOptions) => SpawnProcess;

export interface SpawnFailure {
    problem: string | null;
    exit_status: number | null;
    exit_signal: number | string | null;
    message: string;
}

export interface ControlledSpawn {
    promise: Promise<string>;
    close: (problem?: string) => void;
}

export function isSpawnFailure(value: unknown): value is SpawnFailure {
    if (typeof value !== "object" || value === null)
        return false;

    return "problem" in value;
}

export function timeoutFailure(message = "hw-probe version query timed out"): SpawnFailure {
    return {
        problem: "timeout",
        exit_status: null,
        exit_signal: null,
        message,
    };
}

export function cancelledFailure(): SpawnFailure {
    return {
        problem: "cancelled",
        exit_status: null,
        exit_signal: null,
        message: "hardware probe was cancelled",
    };
}

function asStringOutput(value: unknown): string {
    if (typeof value === "string")
        return value;
    if (value == null)
        return "";
    return String(value);
}

function closeProcess(process: SpawnProcess, problem?: string) {
    try {
        process.close(problem);
    } catch {
        // Closing a finished process is harmless; ignore close races.
    }
}

export function spawnControlled(
    spawn: SpawnFn,
    argv: readonly string[],
    options: {
        timeoutMs: number;
        environ?: readonly string[];
        timeoutMessage?: string;
        superuser?: NativeProbeSuperuser;
        err?: "out" | "ignore" | "message";
    }
): ControlledSpawn {
    const args = argv.slice();
    const spawnOptions: SpawnOptions = { err: options.err ?? "ignore" };
    if (options.environ)
        spawnOptions.environ = options.environ.slice();
    if (options.superuser === NATIVE_PROBE_SUPERUSER)
        spawnOptions.superuser = NATIVE_PROBE_SUPERUSER;
    const process = spawn(args, spawnOptions);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let outcome: "timeout" | "cancelled" | null = null;
    let settled = false;
    let finishReject: (error: unknown) => void = () => undefined;

    const timeoutMessage = options.timeoutMessage ?? "hw-probe version query timed out";

    const promise = new Promise<string>((resolve, reject) => {
        const finishResolve = (value: string) => {
            if (settled)
                return;
            settled = true;
            if (timeoutId !== undefined)
                clearTimeout(timeoutId);
            resolve(value);
        };
        finishReject = (error: unknown) => {
            if (settled)
                return;
            settled = true;
            if (timeoutId !== undefined)
                clearTimeout(timeoutId);
            reject(error);
        };

        timeoutId = setTimeout(() => {
            outcome = "timeout";
            closeProcess(process, "timeout");
            finishReject(timeoutFailure(timeoutMessage));
        }, options.timeoutMs);

        Promise.resolve(process)
                .then(asStringOutput)
                .then(finishResolve, error => {
                    if (outcome === "cancelled")
                        finishReject(cancelledFailure());
                    else if (outcome === "timeout")
                        finishReject(timeoutFailure(timeoutMessage));
                    else
                        finishReject(error);
                });
    });

    return {
        promise,
        close: (problem?: string) => {
            if (problem === "cancelled") {
                outcome = "cancelled";
                closeProcess(process, "cancelled");
                finishReject(cancelledFailure());
                return;
            }
            if (problem === "timeout")
                outcome = "timeout";
            closeProcess(process, problem);
        },
    };
}

export async function spawnWithTimeout(
    spawn: SpawnFn,
    argv: readonly string[],
    options: { timeoutMs: number; environ?: readonly string[] }
): Promise<string> {
    return spawnControlled(spawn, argv, options).promise;
}

export function cockpitSpawn(args: string[], options?: SpawnOptions): SpawnProcess {
    const spawnOptions: {
        err: "out" | "ignore" | "message";
        environ: string[];
        superuser?: NativeProbeSuperuser;
    } = {
        err: options?.err ?? "ignore",
        environ: options?.environ ?? [],
    };
    if (options?.superuser === NATIVE_PROBE_SUPERUSER)
        spawnOptions.superuser = NATIVE_PROBE_SUPERUSER;
    return cockpit.spawn(args, spawnOptions) as unknown as SpawnProcess;
}
