/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import cockpit from 'cockpit';

export const HW_PROBE_COMMAND_NAME = "hw-probe";
export const HW_PROBE_VERSION_ARGUMENT = "-dumpversion";
export const FLATPAK_EXECUTABLE = "flatpak";
export const HW_PROBE_FLATPAK_APP_ID = "org.linux_hardware.hw-probe";

export type HwProbeInvocation =
    | {
        kind: "native";
        executable: string;
        source: "native-path" | "user-local";
    }
    | {
        kind: "flatpak";
        executable: "flatpak";
        appId: typeof HW_PROBE_FLATPAK_APP_ID;
        source: "flatpak";
    };

export type NativeHwProbeInvocation = Extract<HwProbeInvocation, { kind: "native" }>;
export type FlatpakHwProbeInvocation = Extract<HwProbeInvocation, { kind: "flatpak" }>;

export const PATH_DUMPVERSION_INVOCATION: NativeHwProbeInvocation = {
    kind: "native",
    executable: HW_PROBE_COMMAND_NAME,
    source: "native-path",
};

export const FLATPAK_INVOCATION: FlatpakHwProbeInvocation = {
    kind: "flatpak",
    executable: FLATPAK_EXECUTABLE,
    appId: HW_PROBE_FLATPAK_APP_ID,
    source: "flatpak",
};

export const FLATPAK_INFO_ARGV = [
    FLATPAK_EXECUTABLE,
    "info",
    "--show-ref",
    HW_PROBE_FLATPAK_APP_ID,
] as const;

const USER_LOCAL_SUFFIX = "/.local/bin/hw-probe";

export function normalizeAuthenticatedHome(home: string): string | null {
    if (typeof home !== "string")
        return null;

    const trimmed = home.trim();
    if (trimmed === "" || !trimmed.startsWith("/") || trimmed.includes("\0"))
        return null;

    const parts = trimmed.split("/").filter(part => part !== "");
    if (parts.some(part => part === "." || part === ".."))
        return null;

    return "/" + parts.join("/");
}

export function userLocalHwProbePath(home: string): string | null {
    const normalizedHome = normalizeAuthenticatedHome(home);
    if (normalizedHome == null)
        return null;
    return normalizedHome + USER_LOCAL_SUFFIX;
}

export function userLocalInvocation(home: string): NativeHwProbeInvocation | null {
    const executable = userLocalHwProbePath(home);
    if (executable == null)
        return null;

    return {
        kind: "native",
        executable,
        source: "user-local",
    };
}

/*
 * Current hw-probe 1.6 help documents `-all` as “Probe for hardware.”
 * The obsolete `-probe` flag is undocumented and is not used here.
 */
export const HW_PROBE_LOCAL_PROBE_ARGUMENTS = ["-all"] as const;

/*
 * Current hw-probe 1.6: `-upload` packages the existing DATA_DIR
 * (`LATEST/hw.info`) and POSTs it. It does not set Probe, so it does
 * not run another `-all`. Do not combine with `-all` here.
 */
export const HW_PROBE_UPLOAD_ARGUMENTS = ["-upload"] as const;

const UPLOAD_FLAGS = new Set([
    "-upload",
    "--upload",
    "-confirm-upload-of-hashed-ids",
    "--confirm-upload-of-hashed-ids",
]);

export function isUploadArgument(arg: string): boolean {
    if (UPLOAD_FLAGS.has(arg))
        return true;
    return arg.startsWith("-upload=") || arg.startsWith("--upload=");
}

export function buildHwProbeArgv(
    invocation: HwProbeInvocation,
    hwProbeArgs: readonly string[]
): string[] {
    if (invocation.kind === "native")
        return [invocation.executable, ...hwProbeArgs];

    return [invocation.executable, "run", invocation.appId, ...hwProbeArgs];
}

export function dumpversionArgv(invocation: HwProbeInvocation): string[] {
    return buildHwProbeArgv(invocation, [HW_PROBE_VERSION_ARGUMENT]);
}

export function buildLocalProbeArgv(invocation: HwProbeInvocation): string[] {
    for (const arg of HW_PROBE_LOCAL_PROBE_ARGUMENTS) {
        if (isUploadArgument(arg))
            throw new Error("local probe arguments must not request upload");
    }

    const argv = buildHwProbeArgv(invocation, HW_PROBE_LOCAL_PROBE_ARGUMENTS);
    if (argv.some(isUploadArgument))
        throw new Error("local probe argv must not request upload");
    if (argv.includes("-probe"))
        throw new Error("local probe argv must not use the obsolete undocumented probe flag");
    if (argv.includes("-check") || argv.includes("-check-extended"))
        throw new Error("local probe argv must not run hw-probe hardware checks");
    return argv;
}

export function buildUploadArgv(invocation: HwProbeInvocation): string[] {
    for (const arg of HW_PROBE_UPLOAD_ARGUMENTS) {
        if (arg !== "-upload")
            throw new Error("upload arguments must be exactly -upload");
    }

    const argv = buildHwProbeArgv(invocation, HW_PROBE_UPLOAD_ARGUMENTS);
    if (!argv.some(isUploadArgument))
        throw new Error("upload argv must request upload");
    if (argv.includes("-all"))
        throw new Error("upload argv must not run a new hardware probe");
    if (argv.includes("-probe"))
        throw new Error("upload argv must not use the obsolete undocumented probe flag");
    if (argv.includes("-check") || argv.includes("-check-extended"))
        throw new Error("upload argv must not run hw-probe hardware checks");
    if (argv.includes("-src") || argv.includes("-source") || argv.includes("--src") || argv.includes("--source"))
        throw new Error("upload argv must not take an arbitrary source path");
    return argv;
}

export async function cockpitUserHome(): Promise<string> {
    await cockpit.init();
    const home = cockpit.info?.user?.home;
    if (typeof home !== "string" || home.trim() === "")
        throw new Error("authenticated user home directory is unavailable");
    return home;
}
