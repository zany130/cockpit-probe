type MockState =
    | 'available'
    | 'unavailable'
    | 'permission-denied'
    | 'timeout'
    | 'error'
    | 'loading';

function currentState(): MockState {
    if (typeof window === 'undefined')
        return 'available';
    const value = new URLSearchParams(window.location.search).get('state');
    if (value === 'unavailable' ||
            value === 'permission-denied' ||
            value === 'timeout' ||
            value === 'error' ||
            value === 'loading')
        return value;
    return 'available';
}

function spawn(_args: string[]) {
    const state = currentState();
    let close = (_problem?: string) => {};

    const promise = new Promise<string>((resolve, reject) => {
        close = (problem?: string) => {
            if (problem === 'timeout') {
                reject({
                    problem: 'timeout',
                    exit_status: null,
                    exit_signal: null,
                    message: '',
                });
            }
        };

        if (state === 'loading')
            return;

        window.setTimeout(() => {
            if (state === 'available') {
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
        }, 250);
    });

    return Object.assign(promise, { close: (problem?: string) => close(problem) });
}

const cockpit = {
    gettext: (message: string) => message,
    init: async () => undefined,
    info: {
        user: {
            home: '/home/preview',
        },
    },
    spawn,
};

export default cockpit;
