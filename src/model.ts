/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

export type HwProbeState =
    | "available"
    | "unavailable"
    | "permission-denied"
    | "timeout"
    | "error";

export type HwProbeErrorKind =
    | "command-not-found"
    | "permission-denied"
    | "timeout"
    | "malformed-output"
    | "command-failed"
    | "unknown";

export interface HwProbeError {
    kind: HwProbeErrorKind;
    message: string;
}

export type HwProbeSource =
    | "native-path"
    | "user-local"
    | "flatpak";

export interface HwProbeCapability {
    state: HwProbeState;
    version?: string;
    source?: HwProbeSource;
    error?: HwProbeError;
}

export type ProbeExecutionErrorKind =
    | "command-not-found"
    | "permission-denied"
    | "timeout"
    | "command-failed"
    | "unknown";

export interface ProbeExecutionError {
    kind: ProbeExecutionErrorKind;
    message: string;
}

export type ProbeExecutionState =
    | { status: "idle" }
    | { status: "running"; startedAt: number }
    | {
        status: "succeeded";
        startedAt: number;
        completedAt: number;
        artifactPath?: string;
    }
    | { status: "cancelled"; startedAt: number; completedAt: number }
    | {
        status: "failed";
        startedAt: number;
        completedAt: number;
        error: ProbeExecutionError;
    };
