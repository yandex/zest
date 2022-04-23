import * as mobx from 'mobx';

export const isObjectObserved = (obj: any) => {
    if (typeof obj !== 'object') {
        return false;
    }
    const key = mobx.keys(obj)[0] as string;
    return Boolean(mobx.getObserverTree(obj, key).observers?.length);
};

export function fromEntries<T = any>(entries: Iterable<readonly [PropertyKey, T]>) {
    if (!entries || !entries[Symbol.iterator]) {
        throw new Error('Object.fromEntries() requires a single iterable argument');
    }

    const obj: {[k: string]: T} = {};
    for (const [key, value] of entries) {
        obj[key as string] = value;
    }

    return obj;
}

export function isNil<T>(v: T | null | undefined): v is null | undefined {
    return v === null || v === undefined;
}
