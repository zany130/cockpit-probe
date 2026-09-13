/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Sanitized fixtures modeled on a real hw-probe 1.6 host/devices pair.
 * Sensitive identifiers are obvious fakes for filter regression tests.
 */

export const FAKE_HWADDR = "ffffffffffffffffffffffffffffffff";

export const VALID_HOST_FIXTURE = [
    "arch:x86_64",
    "boot_mode:EFI",
    "cores:6",
    "cpu_fan:2156",
    "cpu_temp:82.1",
    "display_manager:SDDM",
    "dual_boot:0",
    "dual_boot_win:1",
    "filesystem:overlay",
    "hwaddr:" + FAKE_HWADDR,
    "id:fake-test-hostname",
    "uuid:00000000-0000-4000-8000-000000000000",
    "kernel:7.2.3-ogc3.1.fc44.x86_64",
    "lang:C",
    "load_average:7.20, 7.73, 7.49",
    "model:B650M Pro RS WiFi",
    "monitors:3",
    "nics:2",
    "op_modes:32-bit, 64-bit",
    "probe_ver:1.6",
    "ram_total:32414356",
    "ram_used:13540064",
    "time:2026-09-13 12:00:00 UTC",
    "",
].join("\n");

export const HOST_WITH_COLON_VALUE = "kernel:6.12.0-custom:debug\narch:x86_64\n";

export const HOST_UNKNOWN_KEY = "arch:x86_64\nfuture_widget:enabled\n";

export const HOST_MALFORMED_LINE = "arch:x86_64\nthis line has no colon\nmodel:Test Board\n";

export const HOST_MISSING_OPTIONAL = "arch:x86_64\nkernel:6.12.0\n";

export const HOST_COMPLETELY_MALFORMED = "????\nnot a host file\n;;;\n";

export const HOST_CRLF_NO_FINAL_NEWLINE = "arch:x86_64\r\nmodel:Test Board\r\nkernel:6.12.0-custom:debug";

const CPU_ROW = "cpu:amd-ryzen-5-7600x;0b;works;cpu;;Advanced Micro Devices, Inc. [AMD];AMD Ryzen 5 7600X 6-Core Processor";

export function repeatedCpuRows(count: number): string[] {
    return Array.from({ length: count }, () => CPU_ROW);
}

export const VALID_DEVICES_FIXTURE = [
    "pci:1002-1478;06-04;works;bridge;pcieport;Advanced Micro Devices, Inc. [AMD/ATI];Navi 10 XL Upstream Port of PCI Express Switch",
    "pci:1002-1479-1002-1479;06-04;works;bridge;pcieport;Advanced Micro Devices, Inc. [AMD/ATI];Navi 10 XL Downstream Port of PCI Express Switch;ATI Technologies Inc",
    "pci:1002-744c-1849-5315;03-00;works;graphics card;amdgpu;Advanced Micro Devices, Inc. [AMD/ATI];VGA compatible controller;ASRock Incorporation",
    "pci:1002-ab30-1002-ab30;04-03;detected;sound;snd_hda_intel;Advanced Micro Devices, Inc. [AMD/ATI];Audio device;Advanced Micro Devices, Inc. [AMD/ATI]",
    "pci:1022-14d9-1022-14d9;08-06;detected;iommu;;Advanced Micro Devices, Inc. [AMD];IOMMU;Advanced Micro Devices, Inc. [AMD]",
    "pci:1022-43f7-1849-43f7;01-06;works;storage;ahci;Advanced Micro Devices, Inc. [AMD];SATA controller;ASRock Incorporation",
    "pci:1022-1649-1849-1649;01-08;works;storage;nvme;Advanced Micro Devices, Inc. [AMD];Non-Volatile memory controller;ASRock Incorporation",
    "pci:10ec-8125-1849-8125;02-00;works;network;r8169;Realtek Semiconductor Co., Ltd.;RTL8125 2.5GbE Controller",
    "pci:14c3-0616-1a3b-3610;02-80;works;network;mt7921e;MediaTek Inc.;MT7922 802.11ax PCI Express Wireless Network Adapter",
    "pci:1022-15c7;0c-03;works;usb controller;xhci_hcd;Advanced Micro Devices, Inc. [AMD];USB controller",
    "pci:10de-2204-10de-2204;03-00;works;graphics card;nouveau;NVIDIA Corporation;VGA compatible controller",
    "pci:1022-164a;10-80;detected;encryption controller;;Advanced Micro Devices, Inc. [AMD];PSP CCP",
    "pci:1022-790b;0c-05;detected;smbus;piix4_smbus;Advanced Micro Devices, Inc. [AMD];SMBus",
    ...repeatedCpuRows(12),
    "mem:slot-0;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s",
    "mem:slot-1;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s",
    "board:asrock-b650m;00;works;motherboard;;ASRock;B650M Pro RS WiFi",
    "bios:american-megatrends;00;works;bios;;American Megatrends International;BIOS",
    "ide:seagate-st4000vn006;01;works;disk;;Seagate;ST4000VN006 4TB",
    "nvme:kingston-snv3s1000g;01;works;disk;;KINGSTON;SNV3S1000G 1TB",
    "nvme:generic-ssd-1tb;01;works;disk;;Generic;NVMe SSD Drive 1TB",
    "nvme:generic-ssd-2tb;01;works;disk;;Generic;NVMe SSD Drive 2TB",
    "usb:1d6b-0003;09;works;hub;xhci_hcd;Linux Foundation;3.0 root hub",
    "usb:046d-c52b;03;works;human interface;usbhid;Logitech, Inc.;Unifying Receiver",
    "usb:046d-c31c;03;works;keyboard;usbhid;Logitech, Inc.;Keyboard K120",
    "usb:046d-c077;03;works;mouse;usbhid;Logitech, Inc.;M105 Optical Mouse",
    "usb:0b05-19af;e0;works;bluetooth;btusb;ASUSTek Computer, Inc.;Bluetooth Adapter",
    "usb:2040-826d;02;detected;tv card;;Hauppauge;WinTV",
    "mon:del-u2720q;00;works;monitor;;Dell Inc.;U2720Q",
    "usb:ffff-0001;ff;detected;flux capacitor;;ACME;Model Q",
    "",
].join("\n");

export const DEVICE_EMPTY_DRIVER = "pci:1022-14d9-1022-14d9;08-06;detected;iommu;;Advanced Micro Devices, Inc. [AMD];IOMMU;Advanced Micro Devices, Inc. [AMD]";

export const DEVICE_OPTIONAL_TRAILING = "pci:1002-1479-1002-1479;06-04;works;bridge;pcieport;Advanced Micro Devices, Inc. [AMD/ATI];Navi 10 XL Downstream Port of PCI Express Switch;ATI Technologies Inc";

export const DEVICE_EXTRA_FIELDS = "pci:10ec-8125;02-00;works;network;r8169;Realtek;RTL8125;Subvendor;Subdevice;future-field;another";

export const DEVICE_MALFORMED_ROW = "not-a-device-row";

export const DEVICE_COMPLETELY_MALFORMED = "hello world\n;;;\nno-colons-here\n";

export const DEVICE_FAILED_NO_DRIVER =
    "pci:10de-ffff;03-00;failed;graphics card;;NVIDIA Corporation;Unbound GPU";

export const DEVICE_FAILED_DISK =
    "ide:seagate-st1000-failed;01;failed;disk;;Seagate;ST1000DM003 1TB";

export const DEVICE_DETECTED_DISK =
    "nvme:untested-ssd;01;detected;disk;;Generic;NVMe SSD Drive 512GB";

export const DEVICE_MALFUNC_BATTERY =
    "bat:acme-cell;00;malfunc;battery;;ACME;Battery 10 Wh";

export const DEVICE_LIMITED_NETWORK =
    "pci:8086-24fd;02-80;limited;network;iwlwifi;Intel Corporation;Wireless 8265";

export const DEVICE_FIXED_INPUT =
    "usb:046d-c52b-fixed;03;fixed;human interface;usbhid;Logitech, Inc.;Unifying Receiver";

export const DEVICE_UNKNOWN_STATUS =
    "usb:ffff-0002;ff;glitchy;flux capacitor;;ACME;Model Q";

export const DEVICE_DETECTED_BRIDGE =
    "pci:1002-1478-detected;06-04;detected;bridge;pcieport;Advanced Micro Devices, Inc. [AMD/ATI];Navi 10 XL Upstream Port of PCI Express Switch";

export const DEVICE_MISSING_STATUS =
    "pci:1022-14d9-nostatus;08-06;;iommu;;Advanced Micro Devices, Inc. [AMD];IOMMU";

export function mixedFindingsDevices(): string {
    return [
        ...repeatedCpuRows(12),
        DEVICE_FAILED_NO_DRIVER,
        DEVICE_MALFUNC_BATTERY,
        DEVICE_LIMITED_NETWORK,
        DEVICE_FIXED_INPUT,
        DEVICE_UNKNOWN_STATUS,
        DEVICE_DETECTED_BRIDGE,
        "pci:1002-744c-1849-5315;03-00;works;graphics card;amdgpu;Advanced Micro Devices, Inc. [AMD/ATI];VGA compatible controller",
        "mem:slot-0;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s",
        "mem:slot-1;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s",
        "pci:10ec-8125-1849-8125;02-00;detected;network;r8169;Realtek Semiconductor Co., Ltd.;RTL8125 2.5GbE Controller",
        "ide:seagate-st4000vn006;01;works;disk;;Seagate;ST4000VN006 4TB",
        DEVICE_EMPTY_DRIVER,
        "",
    ].join("\n");
}
