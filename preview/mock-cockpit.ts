type MockState =
    | 'available'
    | 'unavailable'
    | 'permission-denied'
    | 'timeout'
    | 'error'
    | 'loading'
    | 'admin-denied';

function currentState(): MockState {
    if (typeof window === 'undefined')
        return 'available';
    const value = new URLSearchParams(window.location.search).get('state');
    if (value === 'unavailable' ||
            value === 'permission-denied' ||
            value === 'timeout' ||
            value === 'error' ||
            value === 'loading' ||
            value === 'admin-denied')
        return value;
    return 'available';
}

function spawn(args: string[]) {
    const state = currentState();
    let close = (_problem?: string) => {};

    const promise = new Promise<string>((resolve, reject) => {
        close = (problem?: string) => {
            if (problem === 'timeout' || problem === 'cancelled') {
                reject({
                    problem,
                    exit_status: null,
                    exit_signal: null,
                    message: '',
                });
            }
        };

        if (state === 'loading')
            return;

        if (args.includes('-upload') || args.includes('--upload')) {
            window.setTimeout(() => {
                reject({ problem: null, exit_status: 99, exit_signal: null, message: 'upload is not allowed' });
            }, 10);
            return;
        }

        const delay = args.includes('-all') ? 600 : 250;

        window.setTimeout(() => {
            if (state === 'available' || state === 'admin-denied') {
                if (args.includes('-all')) {
                    if (state === 'admin-denied') {
                        reject({ problem: 'access-denied', exit_status: null, exit_signal: null, message: '' });
                        return;
                    }
                    resolve(
                        'Probe for hardware ... Ok\nReading logs ... Ok\nLocal probe path: /root/HW_PROBE/LATEST/hw.info\n'
                    );
                    return;
                }
                resolve('1.6\n');
                return;
            }
            if (state === 'unavailable') {
                reject({ problem: 'not-found', exit_status: null, exit_signal: null, message: '' });
                return;
            }
            if (state === 'permission-denied') {
                reject({ problem: 'access-denied', exit_status: null, exit_signal: null, message: '' });
                return;
            }
            if (state === 'timeout')
                return;
            reject({ problem: null, exit_status: 1, exit_signal: null, message: '' });
        }, delay);
    });

    return Object.assign(promise, { close: (problem?: string) => close(problem) });
}

const cockpit = {
    gettext: (message: string) => message,
    format: (template: string, ...args: unknown[]) => {
        let index = 0;
        return template.replace(/\$\d+/g, () => String(args[index++]));
    },
    init: async () => undefined,
    info: {
        user: {
            home: '/home/preview',
        },
    },
    spawn,
};

export default cockpit;
