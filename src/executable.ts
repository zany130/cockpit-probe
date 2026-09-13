/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from 'cockpit';

export const HW_PROBE_COMMAND_NAME = "hw-probe";

export interface HwProbeExecutable {
    path: string;
    source: "path" | "user-local";
}

const USER_LOCAL_SUFFIX = "/.local/bin/hw-probe";

export function userLocalHwProbePath(home: string): string | null {
    if (typeof home !== "string")
        return null;

    const trimmed = home.trim();
    if (trimmed === "" || !trimmed.startsWith("/") || trimmed.includes("\0"))
        return null;

    const parts = trimmed.split("/").filter(part => part !== "");
    if (parts.some(part => part === "." || part === ".."))
        return null;

    const normalizedHome = "/" + parts.join("/");
    return normalizedHome + USER_LOCAL_SUFFIX;
}

export async function cockpitUserHome(): Promise<string> {
    await cockpit.init();
    const home = cockpit.info?.user?.home;
    if (typeof home !== "string" || home.trim() === "")
        throw new Error("authenticated user home directory is unavailable");
    return home;
}
