/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Parse hw-probe -upload stdout. Upstream uploadData() prints the
 * linux-hardware.org response, which typically contains probe=<id>,
 * and internally builds https://linux-hardware.org/?probe=<id>.
 */

import type { UploadError, UploadErrorKind, UploadResult } from './model';
import { isSpawnFailure, type SpawnFailure } from './spawn';

export const LINUX_HARDWARE_ORIGIN = "https://linux-hardware.org";
const PROBE_ID_RE = /^[A-Za-z0-9]{8,64}$/;
const FULL_URL_RE = /https:\/\/linux-hardware\.org\/\?probe=([A-Za-z0-9]{8,64})\b/i;
const PROBE_TOKEN_RE = /(?:^|\s)probe=([A-Za-z0-9]{8,64})\b/;

export function isValidProbeId(value: string): boolean {
    return PROBE_ID_RE.test(value);
}

export function linuxHardwareProbeUrl(probeId: string): string {
    return LINUX_HARDWARE_ORIGIN + "/?probe=" + probeId;
}

export function validateLinuxHardwareProbeUrl(value: string): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    if (trimmed === "")
        return undefined;

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return undefined;
    }

    if (url.protocol !== "https:")
        return undefined;
    if (url.username !== "" || url.password !== "")
        return undefined;
    if (url.hostname !== "linux-hardware.org")
        return undefined;
    if (url.port !== "")
        return undefined;
    if (url.pathname !== "/" && url.pathname !== "")
        return undefined;
    if (url.hash !== "")
        return undefined;

    const keys = [...url.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== "probe")
        return undefined;

    const probeId = url.searchParams.get("probe");
    if (probeId == null || !isValidProbeId(probeId))
        return undefined;

    return linuxHardwareProbeUrl(probeId);
}

export interface UploadParseResult {
    result: UploadResult;
    metadataRecognized: boolean;
}

export function parseUploadStdout(stdout: string): UploadParseResult {
    const empty: UploadParseResult = {
        result: {},
        metadataRecognized: false,
    };
    if (typeof stdout !== "string")
        return empty;

    const full = stdout.match(FULL_URL_RE);
    if (full) {
        const validated = validateLinuxHardwareProbeUrl(LINUX_HARDWARE_ORIGIN + "/?probe=" + full[1]);
        if (validated) {
            return {
                result: { url: validated, probeId: full[1] },
                metadataRecognized: true,
            };
        }
    }

    const token = stdout.match(PROBE_TOKEN_RE);
    if (token && isValidProbeId(token[1])) {
        return {
            result: {
                url: linuxHardwareProbeUrl(token[1]),
                probeId: token[1],
            },
            metadataRecognized: true,
        };
    }

    return empty;
}

function curlErrorCode(message: string): number | undefined {
    const match = message.match(/curl error code\s+"(\d+)"/i);
    if (!match)
        return undefined;
    const code = Number.parseInt(match[1], 10);
    if (!Number.isFinite(code))
        return undefined;
    return code;
}

export function classifyUploadStderr(message: string): UploadErrorKind | undefined {
    const text = message.toLowerCase();
    if (text.includes("please make probe first") || text.includes("devices' file is not found"))
        return "no-local-probe";

    const curl = curlErrorCode(message);
    if (curl === 6 || curl === 7 || curl === 28)
        return "network-unavailable";
    if (curl === 22)
        return "upstream-rejected";
    if (text.includes("failed to upload data"))
        return curl === undefined ? "command-failed" : "command-failed";
    return undefined;
}

function technicalUploadMessage(kind: UploadErrorKind, failure: SpawnFailure): string {
    switch (kind) {
    case "administrative-access-required":
        return "Administrative access is required to upload a native hardware probe";
    case "no-local-probe":
        return "hw-probe reported that no local probe is available to upload";
    case "network-unavailable":
        return "hw-probe could not reach linux-hardware.org";
    case "upstream-rejected":
        return "linux-hardware.org rejected the upload";
    case "timeout":
        return "hardware probe upload timed out";
    case "cancelled":
        return "hardware probe upload was cancelled";
    case "command-failed":
        if (typeof failure.exit_status === "number")
            return "hw-probe upload exited with status " + String(failure.exit_status);
        return "hw-probe upload exited unsuccessfully";
    default:
        return "hardware probe upload failed";
    }
}

export function normalizeUploadFailure(
    error: unknown,
    options: { backend: "native" | "flatpak" }
): UploadError {
    if (!isSpawnFailure(error)) {
        return {
            kind: "unknown",
            message: "hardware probe upload failed",
        };
    }

    if (error.problem === "cancelled") {
        return {
            kind: "cancelled",
            message: technicalUploadMessage("cancelled", error),
        };
    }

    if (error.problem === "timeout") {
        return {
            kind: "timeout",
            message: technicalUploadMessage("timeout", error),
        };
    }

    if (error.problem === "not-found") {
        return {
            kind: "command-failed",
            message: options.backend === "flatpak"
                ? "hw-probe Flatpak is installed but failed to launch for upload"
                : "hw-probe executable was not found",
        };
    }

    if (error.problem === "access-denied") {
        if (options.backend === "native") {
            return {
                kind: "administrative-access-required",
                message: technicalUploadMessage("administrative-access-required", error),
            };
        }
        return {
            kind: "command-failed",
            message: "execution of hw-probe upload was denied",
        };
    }

    const classified = classifyUploadStderr(error.message ?? "");
    if (classified) {
        return {
            kind: classified,
            message: technicalUploadMessage(classified, error),
        };
    }

    if (error.problem == null && typeof error.exit_status === "number" && error.exit_status !== 0) {
        return {
            kind: "command-failed",
            message: technicalUploadMessage("command-failed", error),
        };
    }

    return {
        kind: "unknown",
        message: technicalUploadMessage("unknown", error),
    };
}
