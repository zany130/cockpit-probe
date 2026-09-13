/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import type { HwProbeError, HwProbeErrorKind, ProbeExecutionError } from './model';
import { isSpawnFailure, type SpawnFailure } from './spawn';

/*
 * Upstream `hw-probe -dumpversion` prints `$TOOL_VERSION` plus a newline.
 * Current upstream `$TOOL_VERSION` is `1.6`. Fedora packages the tool as
 * 1.6.5-*, and AppImage builds use strings such as `1.6.5-189`. Accept those
 * dotted/release variants; reject empty, multiline, and non-version text.
 */
const VERSION_RE = /^[0-9]+(?:\.[0-9]+)*(?:-[0-9A-Za-z.]+)?$/;

export type VersionParseResult =
    | { ok: true; version: string }
    | { ok: false; error: HwProbeError };

function malformedOutputError(): HwProbeError {
    return {
        kind: "malformed-output",
        message: "hw-probe version output was malformed",
    };
}

function hasDisallowedCharacters(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        const isNewline = code === 10 || code === 13;
        const isTab = code === 9;
        const isPrintableAscii = code >= 32 && code <= 126;
        if (!isNewline && !isTab && !isPrintableAscii)
            return true;
    }
    return false;
}

export function parseHwProbeVersion(stdout: string): VersionParseResult {
    if (typeof stdout !== "string")
        return { ok: false, error: malformedOutputError() };

    if (hasDisallowedCharacters(stdout))
        return { ok: false, error: malformedOutputError() };

    const normalized = stdout
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const contentLines = lines.filter(line => line.trim() !== "");

    if (contentLines.length !== 1)
        return { ok: false, error: malformedOutputError() };

    const version = contentLines[0].trim();
    if (!VERSION_RE.test(version))
        return { ok: false, error: malformedOutputError() };

    return { ok: true, version };
}

export function parseLocalProbePath(stdout: string): string | undefined {
    if (typeof stdout !== "string" || hasDisallowedCharacters(stdout))
        return undefined;

    const match = stdout.match(/^Local probe path:\s+(\/\S+)\s*$/m);
    if (!match)
        return undefined;

    const path = match[1];
    if (path.includes("..") || path.includes("\0"))
        return undefined;
    return path;
}

function technicalMessage(kind: HwProbeErrorKind, failure: SpawnFailure): string {
    switch (kind) {
    case "command-not-found":
        return "hw-probe executable was not found";
    case "permission-denied":
        return "execution of hw-probe was denied";
    case "timeout":
        return "hw-probe version query timed out";
    case "command-failed":
        if (typeof failure.exit_status === "number")
            return "hw-probe exited with status " + String(failure.exit_status);
        return "hw-probe exited unsuccessfully";
    default:
        return "hw-probe version query failed";
    }
}

export function normalizeSpawnFailure(error: unknown): HwProbeError {
    if (!isSpawnFailure(error)) {
        return {
            kind: "unknown",
            message: "hw-probe version query failed",
        };
    }

    if (error.problem === "not-found")
        return { kind: "command-not-found", message: technicalMessage("command-not-found", error) };

    if (error.problem === "access-denied")
        return { kind: "permission-denied", message: technicalMessage("permission-denied", error) };

    if (error.problem === "timeout")
        return { kind: "timeout", message: technicalMessage("timeout", error) };

    if (error.problem == null && typeof error.exit_status === "number" && error.exit_status !== 0)
        return { kind: "command-failed", message: technicalMessage("command-failed", error) };

    return { kind: "unknown", message: technicalMessage("unknown", error) };
}

export function normalizeProbeExecutionFailure(
    error: unknown,
    options: { backend: "native" | "flatpak" }
): ProbeExecutionError {
    if (!isSpawnFailure(error)) {
        return {
            kind: "unknown",
            message: "hardware probe failed",
        };
    }

    if (error.problem === "not-found") {
        if (options.backend === "flatpak") {
            return {
                kind: "command-failed",
                message: "hw-probe Flatpak is installed but failed to launch",
            };
        }
        return {
            kind: "command-not-found",
            message: "hw-probe executable was not found",
        };
    }

    if (error.problem === "access-denied") {
        return {
            kind: "permission-denied",
            message: "execution of hw-probe was denied",
        };
    }

    if (error.problem === "timeout") {
        return {
            kind: "timeout",
            message: "hardware probe timed out",
        };
    }

    if (error.problem == null && typeof error.exit_status === "number" && error.exit_status !== 0) {
        return {
            kind: "command-failed",
            message: "hw-probe exited with status " + String(error.exit_status),
        };
    }

    return {
        kind: "unknown",
        message: "hardware probe failed",
    };
}
