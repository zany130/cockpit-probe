/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import type { HwProbeCapability } from './model';
import { normalizeSpawnFailure, parseHwProbeVersion } from './parser';
import {
    CAPABILITY_TIMEOUT_MS,
    cockpitSpawn,
    HW_PROBE_DUMPVERSION_ARGV,
    HW_PROBE_SPAWN_ENVIRON,
    spawnWithTimeout,
    type SpawnFn,
} from './spawn';

export async function detectHwProbeCapability(
        spawn: SpawnFn = cockpitSpawn
): Promise<HwProbeCapability> {
    try {
        const stdout = await spawnWithTimeout(spawn, HW_PROBE_DUMPVERSION_ARGV, {
            timeoutMs: CAPABILITY_TIMEOUT_MS,
            environ: HW_PROBE_SPAWN_ENVIRON,
        });
        const parsed = parseHwProbeVersion(stdout);
        if (!parsed.ok)
            return { state: "error", error: parsed.error };

        return { state: "available", version: parsed.version };
    } catch (error) {
        const normalized = normalizeSpawnFailure(error);
        if (normalized.kind === "command-not-found")
            return { state: "unavailable", error: normalized };
        if (normalized.kind === "permission-denied")
            return { state: "permission-denied", error: normalized };
        if (normalized.kind === "timeout")
            return { state: "timeout", error: normalized };
        return { state: "error", error: normalized };
    }
}
