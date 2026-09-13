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
    | { status: "done"; capability: HwProbeCapability; invocation: HwProbeInvocation | null };

export interface ResolvedHwProbe {
    capability: HwProbeCapability;
    invocation: HwProbeInvocation | null;
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
        return { status: "done", capability: await queryDumpversion(spawn, invocation), invocation };
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind === "command-not-found")
            return { status: "missing" };
        return { status: "done", capability: fromNormalizedError(normalized), invocation };
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
        return { status: "done", capability: fromNormalizedError(normalized), invocation: null };
    }

    try {
        return {
            status: "done",
            capability: await queryDumpversion(spawn, FLATPAK_INVOCATION),
            invocation: FLATPAK_INVOCATION,
        };
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
                invocation: null,
            };
        }
        return { status: "done", capability: fromNormalizedError(normalized), invocation: null };
    }
}

export async function resolveHwProbe(
    spawn: SpawnFn = cockpitSpawn,
    getUserHome: UserHomeLookup = cockpitUserHome
): Promise<ResolvedHwProbe> {
    // Discovery order: native PATH, then ~/.local/bin, then official Flatpak.
    // Prefer native when both native and Flatpak installs exist. Do not fall
    // back after permission-denied, timeout, or command-failed.
    const pathAttempt = await tryNativeDumpversion(spawn, PATH_DUMPVERSION_INVOCATION);
    if (pathAttempt.status === "done")
        return toResolved(pathAttempt);

    let homeFailed = false;
    try {
        const invocation = userLocalInvocation(await getUserHome());
        if (invocation == null) {
            homeFailed = true;
        } else {
            const localAttempt = await tryNativeDumpversion(spawn, invocation);
            if (localAttempt.status === "done")
                return toResolved(localAttempt);
        }
    } catch {
        homeFailed = true;
    }

    const flatpakAttempt = await tryFlatpakDumpversion(spawn);
    if (flatpakAttempt.status === "done")
        return toResolved(flatpakAttempt);

    if (homeFailed)
        return { capability: homeLookupError(), invocation: null };

    return { capability: unavailableCapability(), invocation: null };
}

function toResolved(attempt: Extract<ProbeAttempt, { status: "done" }>): ResolvedHwProbe {
    if (attempt.capability.state === "available")
        return { capability: attempt.capability, invocation: attempt.invocation };
    return { capability: attempt.capability, invocation: null };
}

export async function detectHwProbeCapability(
    spawn: SpawnFn = cockpitSpawn,
    getUserHome: UserHomeLookup = cockpitUserHome
): Promise<HwProbeCapability> {
    const resolved = await resolveHwProbe(spawn, getUserHome);
    return resolved.capability;
}
