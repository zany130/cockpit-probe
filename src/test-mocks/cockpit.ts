const cockpit = {
    gettext: (message: string) => message,
    format: (template: string, ...args: unknown[]) => {
        let index = 0;
        return template.replace(/\$\d+/g, () => String(args[index++]));
    },
    init: async () => undefined,
    info: {
        user: {
            home: '/home/testuser',
        },
    },
    spawn: () => {
        throw new Error('cockpit.spawn is not available in unit tests; inject a spawn function');
    },
    file: () => {
        throw new Error('cockpit.file is not available in unit tests; inject a file reader');
    },
};

export default cockpit;
