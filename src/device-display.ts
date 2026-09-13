/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from 'cockpit';

import type { HardwareDevice } from './model';

const _ = cockpit.gettext;

export function formatDeviceStatus(status: string): string {
    const normalized = status.trim().toLowerCase();
    if (normalized === "works")
        return _("Works");
    if (normalized === "detected" || normalized === "")
        return _("Detected");
    if (normalized === "failed")
        return _("Failed");
    if (normalized === "malfunc")
        return _("Malfunction");
    if (normalized === "limited")
        return _("Limited");
    if (normalized === "fixed")
        return _("Fixed");
    return status.charAt(0).toUpperCase() + status.slice(1);
}

export function deviceLabel(device: Pick<HardwareDevice, "vendor" | "device" | "type">): string {
    const vendor = device.vendor.trim();
    const name = device.device.trim();
    if (vendor && name) {
        if (name.toLowerCase().includes(vendor.toLowerCase()))
            return name;
        return vendor + " " + name;
    }
    return name || vendor || device.type;
}
