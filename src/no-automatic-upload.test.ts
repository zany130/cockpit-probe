import { describe, expect, it } from 'vitest';

import { isUploadArgument } from './executable';
import capabilitySource from './capability-provider.ts?raw';
import probeSource from './probe-provider.ts?raw';
import inventorySource from './inventory-provider.ts?raw';
import inventoryNormalizerSource from './inventory-normalizer.ts?raw';
import inventoryPathsSource from './inventory-paths.ts?raw';
import findingsSource from './findings-normalizer.ts?raw';
import parserSource from './parser.ts?raw';
import hostParserSource from './host-parser.ts?raw';
import deviceParserSource from './device-parser.ts?raw';
import findingsViewSource from './hardware-findings-view.tsx?raw';
import probeViewSource from './probe-execution-view.tsx?raw';

const LOCAL_ONLY_SOURCES: Record<string, string> = {
    'capability-provider.ts': capabilitySource,
    'probe-provider.ts': probeSource,
    'inventory-provider.ts': inventorySource,
    'inventory-normalizer.ts': inventoryNormalizerSource,
    'inventory-paths.ts': inventoryPathsSource,
    'findings-normalizer.ts': findingsSource,
    'parser.ts': parserSource,
    'host-parser.ts': hostParserSource,
    'device-parser.ts': deviceParserSource,
    'hardware-findings-view.tsx': findingsViewSource,
    'probe-execution-view.tsx': probeViewSource,
};

describe('no automatic upload', () => {
    it('keeps -upload out of capability, probe, parse, inventory, and findings sources', () => {
        for (const [name, text] of Object.entries(LOCAL_ONLY_SOURCES)) {
            expect(text, name).not.toMatch(/["']-upload["']/);
            expect(text, name).not.toMatch(/--upload/);
            expect(text, name).not.toMatch(/confirm-upload-of-hashed-ids/);
            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('*') || trimmed.startsWith('//'))
                    continue;
                expect(line, name + ': ' + line).not.toMatch(/(^|[^A-Za-z-])-upload([^A-Za-z-]|$)/);
            }
        }
    });

    it('treats only the documented upload flag as an upload argument', () => {
        expect(isUploadArgument('-upload')).toBe(true);
        expect(isUploadArgument('-all')).toBe(false);
        expect(isUploadArgument('-dumpversion')).toBe(false);
        expect(isUploadArgument('-check')).toBe(false);
    });
});
