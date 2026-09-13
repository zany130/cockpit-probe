/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Upstream copies /proc/meminfo MemTotal into Sys.Ram_total. Linux reports
 * that value in kB units of 1024 bytes (KiB), despite the "kB" label.
 * See hw-probe.pl writeHost / meminfo handling and proc(5).
 */

const KIB_PER_MIB = 1024;
const KIB_PER_GIB = 1024 * 1024;

export function parseRamTotalKiB(value: string | undefined): number | undefined {
    if (value == null || value.trim() === "")
        return undefined;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0)
        return undefined;
    return parsed;
}

export function formatRamFromKiB(kib: number): string {
    if (!Number.isFinite(kib) || kib < 0)
        return "";

    if (kib >= KIB_PER_GIB) {
        const gib = kib / KIB_PER_GIB;
        const tenths = Math.round(gib * 10) / 10;
        if (Number.isInteger(tenths))
            return String(tenths) + " GiB";
        return tenths.toFixed(1) + " GiB";
    }

    const mib = kib / KIB_PER_MIB;
    const tenths = Math.round(mib * 10) / 10;
    if (Number.isInteger(tenths))
        return String(tenths) + " MiB";
    return tenths.toFixed(1) + " MiB";
}
