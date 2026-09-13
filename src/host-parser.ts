/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Line-oriented host file written by hw-probe writeHost():
 *   lc(key) + ":" + value + "\n"
 * Split on the first colon only. This format is an internal upstream
 * implementation detail, not a documented public API.
 */

import { isSensitiveHostKey } from './inventory-privacy';

export interface HostParseDiagnostics {
    skippedLines: number;
    unknownKeys: string[];
    discardedSensitiveKeys: string[];
}

export type HostParseResult =
    | { ok: true; fields: Record<string, string>; diagnostics: HostParseDiagnostics }
    | { ok: false; error: "malformed-host"; diagnostics: HostParseDiagnostics };

/*
 * Upstream readHost() uses /(\w+)\:(.*)/ — first colon, remainder is the
 * value. Split the same way so values such as timestamps keep extra colons.
 */
function splitHostLine(line: string): { key: string; value: string } | null {
    const colon = line.indexOf(":");
    if (colon <= 0)
        return null;
    const key = line.slice(0, colon).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        return null;
    return { key: key.toLowerCase(), value: line.slice(colon + 1) };
}

const KNOWN_HOST_KEYS = new Set([
    "arch",
    "boot_mode",
    "cores",
    "cpu_fan",
    "cpu_temp",
    "display_manager",
    "dual_boot",
    "dual_boot_win",
    "kernel",
    "lang",
    "load_average",
    "model",
    "monitors",
    "nics",
    "op_modes",
    "probe_ver",
    "ram_total",
    "ram_used",
    "type",
    "vendor",
    "system",
    "time",
]);

export function parseHostFile(text: string): HostParseResult {
    const diagnostics: HostParseDiagnostics = {
        skippedLines: 0,
        unknownKeys: [],
        discardedSensitiveKeys: [],
    };

    if (typeof text !== "string")
        return { ok: false, error: "malformed-host", diagnostics };

    const normalized = text.replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const fields: Record<string, string> = {};
    let valid = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line === "")
            continue;

        const parsedLine = splitHostLine(line);
        if (parsedLine == null) {
            diagnostics.skippedLines += 1;
            continue;
        }

        const key = parsedLine.key;
        const value = parsedLine.value;
        valid += 1;

        if (isSensitiveHostKey(key)) {
            diagnostics.discardedSensitiveKeys.push(key);
            continue;
        }

        if (!KNOWN_HOST_KEYS.has(key) && !diagnostics.unknownKeys.includes(key))
            diagnostics.unknownKeys.push(key);

        fields[key] = value;
    }

    if (valid === 0)
        return { ok: false, error: "malformed-host", diagnostics };

    return { ok: true, fields, diagnostics };
}

export function parseOptionalInt(value: string | undefined): number | undefined {
    if (value == null || value.trim() === "")
        return undefined;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed))
        return undefined;
    return parsed;
}
