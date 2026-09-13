/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Trusted native probe-data locations. hw-probe 1.6 help reports
 * /root/HW_PROBE. LATEST is a directory containing hw.info/host and
 * hw.info/devices. Do not hardcode distro-specific root-home aliases
 * such as /var/roothome.
 */

export const NATIVE_PROBE_ROOT = "/root/HW_PROBE";
export const NATIVE_LATEST_HW_INFO = NATIVE_PROBE_ROOT + "/LATEST/hw.info";
export const NATIVE_HOST_PATH = NATIVE_LATEST_HW_INFO + "/host";
export const NATIVE_DEVICES_PATH = NATIVE_LATEST_HW_INFO + "/devices";

/*
 * Official Flatpak stores probes under $XDG_DATA_HOME/HW_PROBE (upstream
 * hw-probe.pl when -flatpak is set). Flatpak maps XDG_DATA_HOME to
 * ~/.var/app/<app-id>/data. This plugin only uses that documented suffix
 * plus the authenticated user's home. It does not guess other host paths.
 */
export const FLATPAK_HW_INFO_SUFFIX =
    "/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE/LATEST/hw.info";

export function flatpakHostPath(home: string): string {
    return home + FLATPAK_HW_INFO_SUFFIX + "/host";
}

export function flatpakDevicesPath(home: string): string {
    return home + FLATPAK_HW_INFO_SUFFIX + "/devices";
}
