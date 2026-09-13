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

export interface HwProbeCapability {
    state: HwProbeState;
    version?: string;
    error?: HwProbeError;
}
