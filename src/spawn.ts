/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from 'cockpit';

export const HW_PROBE_DUMPVERSION_ARGV = ["hw-probe", "-dumpversion"] as const;

export const CAPABILITY_TIMEOUT_MS = 8000;

export const HW_PROBE_SPAWN_ENVIRON = ["LC_ALL=C", "LANG=C"] as const;

export interface SpawnProcess {
    then: (
        onfulfilled?: ((value: unknown) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise<unknown>;
    catch: (onrejected?: ((reason: unknown) => unknown) | null) => Promise<unknown>;
    close: (problem?: string) => void;
}

export interface SpawnOptions {
    err?: "out" | "ignore" | "message";
    environ?: string[];
}

export type SpawnFn = (args: string[], options?: SpawnOptions) => SpawnProcess;

export interface SpawnFailure {
    problem: string | null;
    exit_status: number | null;
    exit_signal: number | string | null;
    message: string;
}

export function isSpawnFailure(value: unknown): value is SpawnFailure {
    if (typeof value !== "object" || value === null)
        return false;

    return "problem" in value;
}

export function timeoutFailure(): SpawnFailure {
    return {
        problem: "timeout",
        exit_status: null,
        exit_signal: null,
        message: "hw-probe version query timed out",
    };
}

function asStringOutput(value: unknown): string {
    if (typeof value === "string")
        return value;
    if (value == null)
        return "";
    return String(value);
}

export async function spawnWithTimeout(
        spawn: SpawnFn,
        argv: readonly string[],
        options: { timeoutMs: number; environ?: readonly string[] }
): Promise<string> {
    const args = argv.slice();
    const spawnOptions: SpawnOptions = { err: "ignore" };
    if (options.environ)
        spawnOptions.environ = options.environ.slice();
    const process = spawn(args, spawnOptions);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            try {
                process.close("timeout");
            } catch {
                // Closing a finished process is harmless; ignore close races.
            }
            reject(timeoutFailure());
        }, options.timeoutMs);
    });

    try {
        const output = await Promise.race([
            Promise.resolve(process).then(asStringOutput),
            timeoutPromise,
        ]);
        return output;
    } catch (error) {
        if (timedOut)
            throw timeoutFailure();
        throw error;
    } finally {
        if (timeoutId !== undefined)
            clearTimeout(timeoutId);
    }
}

export function cockpitSpawn(args: string[], options?: SpawnOptions): SpawnProcess {
    return cockpit.spawn(args, options) as SpawnProcess;
}
