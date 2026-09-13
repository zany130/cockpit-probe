const cockpit = {
    gettext: (message: string) => message,
    format: (template: string, ...args: unknown[]) => {
        let index = 0;
        return template.replace(/\$\d+/g, () => String(args[index++]));
    },
    spawn: () => {
        throw new Error('cockpit.spawn is not available in unit tests; inject a spawn function');
    },
};

export default cockpit;
