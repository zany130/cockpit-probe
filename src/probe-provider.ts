/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import { buildLocalProbeArgv, type HwProbeInvocation } from './executable';
import type { ProbeExecutionState } from './model';
import { normalizeProbeExecutionFailure, parseLocalProbePath } from './parser';
import {
    cockpitSpawn,
    HW_PROBE_SPAWN_ENVIRON,
    isSpawnFailure,
    NATIVE_PROBE_SUPERUSER,
    PROBE_TIMEOUT_MS,
    spawnControlled,
    type ControlledSpawn,
    type NativeProbeSuperuser,
    type SpawnFn,
} from './spawn';

export type ProbeStateListener = (state: ProbeExecutionState) => void;

export function buildProbeSpawnOptions(invocation: HwProbeInvocation): {
    superuser?: NativeProbeSuperuser;
} {
    if (invocation.kind === "native")
        return { superuser: NATIVE_PROBE_SUPERUSER };
    return {};
}

export interface ProbeController {
    getState: () => ProbeExecutionState;
    subscribe: (listener: ProbeStateListener) => () => void;
    run: (invocation: HwProbeInvocation) => Promise<void>;
    cancel: () => void;
}

export function createProbeController(options?: {
    spawn?: SpawnFn;
    now?: () => number;
    timeoutMs?: number;
}): ProbeController {
    const spawn = options?.spawn ?? cockpitSpawn;
    const now = options?.now ?? Date.now;
    const timeoutMs = options?.timeoutMs ?? PROBE_TIMEOUT_MS;

    let state: ProbeExecutionState = { status: "idle" };
    let handle: ControlledSpawn | null = null;
    let cancelRequested = false;
    const listeners = new Set<ProbeStateListener>();

    const setState = (next: ProbeExecutionState) => {
        state = next;
        for (const listener of listeners)
            listener(state);
    };

    return {
        getState: () => state,
        subscribe: (listener: ProbeStateListener) => {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            };
        },
        run: async (invocation: HwProbeInvocation) => {
            if (state.status === "running")
                return;

            const startedAt = now();
            cancelRequested = false;
            setState({ status: "running", startedAt });

            try {
                const argv = buildLocalProbeArgv(invocation);
                const controlled = spawnControlled(spawn, argv, {
                    timeoutMs,
                    environ: HW_PROBE_SPAWN_ENVIRON,
                    timeoutMessage: "hardware probe timed out",
                    ...buildProbeSpawnOptions(invocation),
                });
                handle = controlled;
                if (cancelRequested) {
                    controlled.close("cancelled");
                }
                const stdout = await controlled.promise;
                const completedAt = now();
                const artifactPath = parseLocalProbePath(stdout);
                const succeeded: ProbeExecutionState = {
                    status: "succeeded",
                    startedAt,
                    completedAt,
                };
                if (artifactPath !== undefined)
                    succeeded.artifactPath = artifactPath;
                setState(succeeded);
            } catch (error) {
                const completedAt = now();
                if (isSpawnFailure(error) && error.problem === "cancelled") {
                    setState({ status: "cancelled", startedAt, completedAt });
                    return;
                }
                const backend = invocation.kind === "flatpak" ? "flatpak" : "native";
                setState({
                    status: "failed",
                    startedAt,
                    completedAt,
                    error: normalizeProbeExecutionFailure(error, { backend }),
                });
            } finally {
                handle = null;
            }
        },
        cancel: () => {
            if (state.status !== "running")
                return;
            cancelRequested = true;
            handle?.close("cancelled");
        },
    };
}
