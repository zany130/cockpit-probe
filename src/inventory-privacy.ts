/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

const SENSITIVE_HOST_KEYS = new Set([
    "hwaddr",
    "hostname",
    "host_name",
    "name",
    "id",
    "serial",
    "serials",
    "serial_number",
    "uuid",
    "uuids",
    "machine_id",
    "machineid",
    "probe_id",
    "probeid",
    "ip",
    "ipv4",
    "ipv6",
    "wwn",
    "wwns",
    "filesystem",
    "fs_uuid",
    "hash",
    "hw_hash",
    "hardware_hash",
]);

export function isSensitiveHostKey(key: string): boolean {
    return SENSITIVE_HOST_KEYS.has(key.toLowerCase());
}

export function stripSerialFromDeviceId(id: string): string {
    return id.replace(/-serial-.+$/i, "");
}

export function summaryContainsSensitiveValue(value: unknown, needle: string): boolean {
    if (needle === "")
        return false;
    return JSON.stringify(value).includes(needle);
}
