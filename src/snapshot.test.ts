import * as mobx from 'mobx';

import {getSnapshot} from './snapshot';

describe(getSnapshot, () => {
    it('has 100% code coverage', () => {
        const input1 = mobx.observable([1, 2, 3]);
        const res1 = getSnapshot(input1);
        expect(mobx.isObservable(res1)).toBe(false);
        expect(res1).toEqual([1, 2, 3]);

        const input2 = mobx.observable({a: {b: 1}});
        const res2 = getSnapshot(input2);
        expect(mobx.isObservable(res2)).toBe(false);
        expect(res2).toEqual({a: {b: 1}});

        const input3 = mobx.observable(new Map([['a', {b: 1}]]));
        const res3 = getSnapshot(input3);
        expect(mobx.isObservable(res3)).toBe(false);
        expect(res3).toEqual(new Map([['a', {b: 1}]]));
    });
});
