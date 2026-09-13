/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Explicit hw-probe -upload. Never invoked by capability detection,
 * local -all, inventory read, or findings derivation.
 */

import { buildUploadArgv, type HwProbeInvocation } from './executable';
import type { UploadState } from './model';
import { normalizeUploadFailure, parseUploadStdout } from './upload-parser';
import {
    cockpitSpawn,
    HW_PROBE_SPAWN_ENVIRON,
    isSpawnFailure,
    NATIVE_PROBE_SUPERUSER,
    UPLOAD_TIMEOUT_MS,
    spawnControlled,
    type ControlledSpawn,
    type NativeProbeSuperuser,
    type SpawnFn,
} from './spawn';

export type UploadStateListener = (state: UploadState) => void;

export function buildUploadSpawnOptions(invocation: HwProbeInvocation): {
    superuser?: NativeProbeSuperuser;
} {
    if (invocation.kind === "native")
        return { superuser: NATIVE_PROBE_SUPERUSER };
    return {};
}

export interface UploadController {
    getState: () => UploadState;
    subscribe: (listener: UploadStateListener) => () => void;
    run: (invocation: HwProbeInvocation) => Promise<void>;
    cancel: () => void;
}

export function createUploadController(options?: {
    spawn?: SpawnFn;
    now?: () => number;
    timeoutMs?: number;
}): UploadController {
    const spawn = options?.spawn ?? cockpitSpawn;
    const now = options?.now ?? Date.now;
    const timeoutMs = options?.timeoutMs ?? UPLOAD_TIMEOUT_MS;

    let state: UploadState = { status: "idle" };
    let handle: ControlledSpawn | null = null;
    let cancelRequested = false;
    const listeners = new Set<UploadStateListener>();

    const setState = (next: UploadState) => {
        state = next;
        for (const listener of listeners)
            listener(state);
    };

    return {
        getState: () => state,
        subscribe: (listener: UploadStateListener) => {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            };
        },
        run: async (invocation: HwProbeInvocation) => {
            if (state.status === "uploading")
                return;

            const startedAt = now();
            cancelRequested = false;
            setState({ status: "uploading", startedAt });

            try {
                const argv = buildUploadArgv(invocation);
                const controlled = spawnControlled(spawn, argv, {
                    timeoutMs,
                    environ: HW_PROBE_SPAWN_ENVIRON,
                    timeoutMessage: "hardware probe upload timed out",
                    err: "message",
                    ...buildUploadSpawnOptions(invocation),
                });
                handle = controlled;
                if (cancelRequested)
                    controlled.close("cancelled");
                const stdout = await controlled.promise;
                const parsed = parseUploadStdout(stdout);
                setState({
                    status: "succeeded",
                    result: parsed.result,
                });
            } catch (error) {
                if (isSpawnFailure(error) && error.problem === "cancelled") {
                    setState({
                        status: "failed",
                        error: {
                            kind: "cancelled",
                            message: "hardware probe upload was cancelled",
                        },
                    });
                    return;
                }
                const backend = invocation.kind === "flatpak" ? "flatpak" : "native";
                setState({
                    status: "failed",
                    error: normalizeUploadFailure(error, { backend }),
                });
            } finally {
                handle = null;
            }
        },
        cancel: () => {
            if (state.status !== "uploading")
                return;
            cancelRequested = true;
            handle?.close("cancelled");
        },
    };
}
