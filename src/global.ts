import * as mobx from 'mobx';
import ReactDOM from 'react-dom';

import {Zest} from './zest';

mobx.configure({
    useProxies: 'never',
    reactionScheduler: ReactDOM.unstable_batchedUpdates,
});

let zest: Zest | undefined;

export const withGlobalZest = (z: Zest, fn: Function) => {
    zest = z;
    const res = fn();
    zest = undefined;
    return res;
};

export const getGlobalZest = () => zest;
