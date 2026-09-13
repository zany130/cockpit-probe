/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Semicolon-separated devices file written by hw-probe writeDevs():
 *   ID;Class;Status;Type;Driver;Vendor;Device[;SVendor[;SDevice]]
 * Semicolons inside field values are replaced with spaces before join.
 * This format is an internal upstream implementation detail.
 */

import type { HardwareDevice } from './model';
import { stripSerialFromDeviceId } from './inventory-privacy';

export interface DeviceParseDiagnostics {
    skippedRows: number;
    totalRows: number;
}

export type DeviceParseResult =
    | { ok: true; devices: HardwareDevice[]; diagnostics: DeviceParseDiagnostics }
    | { ok: false; error: "malformed-devices"; diagnostics: DeviceParseDiagnostics };

function emptyToNull(value: string | undefined): string | null {
    if (value == null)
        return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

function emptyToString(value: string | undefined): string {
    if (value == null)
        return "";
    return value.trim();
}

function busFromId(id: string): string {
    const colon = id.indexOf(":");
    if (colon <= 0)
        return "unknown";
    return id.slice(0, colon).toLowerCase();
}

export function parseDeviceRow(line: string): HardwareDevice | null {
    const trimmed = line.trim();
    if (trimmed === "")
        return null;

    const fields = trimmed.split(";");
    if (fields.length < 5)
        return null;

    const rawId = emptyToString(fields[0]);
    if (rawId === "" || !rawId.includes(":"))
        return null;

    const id = stripSerialFromDeviceId(rawId);
    const device: HardwareDevice = {
        bus: busFromId(id),
        id,
        className: emptyToString(fields[1]),
        status: emptyToString(fields[2]) || "detected",
        type: emptyToString(fields[3]) || "unknown",
        driver: emptyToNull(fields[4]),
        vendor: emptyToString(fields[5]),
        device: emptyToString(fields[6]),
    };

    const subvendor = emptyToNull(fields[7]);
    if (subvendor != null)
        device.subvendor = subvendor;
    const subdevice = emptyToNull(fields[8]);
    if (subdevice != null)
        device.subdevice = subdevice;

    return device;
}

export function parseDevicesFile(text: string): DeviceParseResult {
    const diagnostics: DeviceParseDiagnostics = { skippedRows: 0, totalRows: 0 };

    if (typeof text !== "string")
        return { ok: false, error: "malformed-devices", diagnostics };

    const normalized = text.replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const devices: HardwareDevice[] = [];

    for (const rawLine of lines) {
        if (rawLine.trim() === "")
            continue;
        diagnostics.totalRows += 1;
        const parsed = parseDeviceRow(rawLine);
        if (parsed == null) {
            diagnostics.skippedRows += 1;
            continue;
        }
        devices.push(parsed);
    }

    if (devices.length === 0)
        return { ok: false, error: "malformed-devices", diagnostics };

    return { ok: true, devices, diagnostics };
}
