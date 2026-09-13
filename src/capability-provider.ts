/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import type { HwProbeCapability, HwProbeError } from './model';
import {
    cockpitUserHome,
    dumpversionArgv,
    FLATPAK_INFO_ARGV,
    FLATPAK_INVOCATION,
    PATH_DUMPVERSION_INVOCATION,
    userLocalInvocation,
    type HwProbeInvocation,
    type NativeHwProbeInvocation,
} from './executable';
import { normalizeSpawnFailure, parseHwProbeVersion } from './parser';
import {
    CAPABILITY_TIMEOUT_MS,
    cockpitSpawn,
    HW_PROBE_SPAWN_ENVIRON,
    spawnWithTimeout,
    type SpawnFn,
} from './spawn';

export type UserHomeLookup = () => Promise<string>;

type ProbeAttempt =
    | { status: "missing" }
    | { status: "done"; capability: HwProbeCapability };

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

function unavailableCapability(): HwProbeCapability {
    return {
        state: "unavailable",
        error: {
            kind: "command-not-found",
            message: "hw-probe executable was not found",
        },
    };
}

async function queryDumpversion(
    spawn: SpawnFn,
    invocation: HwProbeInvocation
): Promise<HwProbeCapability> {
    const stdout = await spawnWithTimeout(spawn, dumpversionArgv(invocation), {
        timeoutMs: CAPABILITY_TIMEOUT_MS,
        environ: HW_PROBE_SPAWN_ENVIRON,
    });
    const parsed = parseHwProbeVersion(stdout);
    if (!parsed.ok)
        return { state: "error", error: parsed.error };

    return {
        state: "available",
        version: parsed.version,
        source: invocation.source,
    };
}

async function tryNativeDumpversion(
    spawn: SpawnFn,
    invocation: NativeHwProbeInvocation
): Promise<ProbeAttempt> {
    try {
        return { status: "done", capability: await queryDumpversion(spawn, invocation) };
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind === "command-not-found")
            return { status: "missing" };
        return { status: "done", capability: fromNormalizedError(normalized) };
    }
}

async function tryFlatpakDumpversion(spawn: SpawnFn): Promise<ProbeAttempt> {
    try {
        await spawnWithTimeout(spawn, FLATPAK_INFO_ARGV, {
            timeoutMs: CAPABILITY_TIMEOUT_MS,
            environ: HW_PROBE_SPAWN_ENVIRON,
        });
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind === "command-not-found" || normalized.kind === "command-failed")
            return { status: "missing" };
        return { status: "done", capability: fromNormalizedError(normalized) };
    }

    try {
        return { status: "done", capability: await queryDumpversion(spawn, FLATPAK_INVOCATION) };
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind === "command-not-found") {
            return {
                status: "done",
                capability: {
                    state: "error",
                    error: {
                        kind: "command-failed",
                        message: "hw-probe Flatpak is installed but failed to launch",
                    },
                },
            };
        }
        return { status: "done", capability: fromNormalizedError(normalized) };
    }
}

export async function detectHwProbeCapability(
    spawn: SpawnFn = cockpitSpawn,
    getUserHome: UserHomeLookup = cockpitUserHome
): Promise<HwProbeCapability> {
    // Discovery order: native PATH, then ~/.local/bin, then official Flatpak.
    // Prefer native when both native and Flatpak installs exist. Do not fall
    // back after permission-denied, timeout, or command-failed.
    const pathAttempt = await tryNativeDumpversion(spawn, PATH_DUMPVERSION_INVOCATION);
    if (pathAttempt.status === "done")
        return pathAttempt.capability;

    let homeFailed = false;
    try {
        const invocation = userLocalInvocation(await getUserHome());
        if (invocation == null) {
            homeFailed = true;
        } else {
            const localAttempt = await tryNativeDumpversion(spawn, invocation);
            if (localAttempt.status === "done")
                return localAttempt.capability;
        }
    } catch {
        homeFailed = true;
    }

    const flatpakAttempt = await tryFlatpakDumpversion(spawn);
    if (flatpakAttempt.status === "done")
        return flatpakAttempt.capability;

    if (homeFailed)
        return homeLookupError();

    return unavailableCapability();
}
