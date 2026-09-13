/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import type { HwProbeCapability, HwProbeError } from './model';
import { cockpitUserHome, HW_PROBE_COMMAND_NAME, userLocalHwProbePath } from './executable';
import { normalizeSpawnFailure, parseHwProbeVersion } from './parser';
import {
    CAPABILITY_TIMEOUT_MS,
    cockpitSpawn,
    HW_PROBE_SPAWN_ENVIRON,
    HW_PROBE_VERSION_ARGUMENT,
    spawnWithTimeout,
    type SpawnFn,
} from './spawn';

export type UserHomeLookup = () => Promise<string>;

function dumpversionArgv(executable: string): string[] {
    return [executable, HW_PROBE_VERSION_ARGUMENT];
}

function fromNormalizedError(error: HwProbeError): HwProbeCapability {
    if (error.kind === "command-not-found")
        return { state: "unavailable", error };
    if (error.kind === "permission-denied")
        return { state: "permission-denied", error };
    if (error.kind === "timeout")
        return { state: "timeout", error };
    return { state: "error", error };
}

function homeLookupError(): HwProbeCapability {
    return {
        state: "error",
        error: {
            kind: "unknown",
            message: "authenticated user home directory is unavailable",
        },
    };
}

async function queryDumpversion(
    spawn: SpawnFn,
    executable: string
): Promise<HwProbeCapability> {
    const stdout = await spawnWithTimeout(spawn, dumpversionArgv(executable), {
        timeoutMs: CAPABILITY_TIMEOUT_MS,
        environ: HW_PROBE_SPAWN_ENVIRON,
    });
    const parsed = parseHwProbeVersion(stdout);
    if (!parsed.ok)
        return { state: "error", error: parsed.error };

    return { state: "available", version: parsed.version };
}

export async function detectHwProbeCapability(
    spawn: SpawnFn = cockpitSpawn,
    getUserHome: UserHomeLookup = cockpitUserHome
): Promise<HwProbeCapability> {
    try {
        return await queryDumpversion(spawn, HW_PROBE_COMMAND_NAME);
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind !== "command-not-found")
            return fromNormalizedError(normalized);
    }

    let home: string;
    try {
        home = await getUserHome();
    } catch {
        return homeLookupError();
    }

    const userLocalPath = userLocalHwProbePath(home);
    if (userLocalPath == null)
        return homeLookupError();

    try {
        return await queryDumpversion(spawn, userLocalPath);
    } catch (error) {
        return fromNormalizedError(normalizeSpawnFailure(error));
    }
}
