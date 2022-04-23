import * as mobx from 'mobx';
import {fromEntries} from './utils';

export declare type Primitive = string | number | boolean | bigint | symbol | undefined | null;

export declare type Builtin = Primitive | Function | Date | Error | RegExp;

export declare type DeepReadonly<T> = T extends Builtin
    ? T
    : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends WeakMap<infer K, infer V>
    ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer U>
    ? ReadonlySet<DeepReadonly<U>>
    : T extends ReadonlySet<infer U>
    ? ReadonlySet<DeepReadonly<U>>
    : T extends WeakSet<infer U>
    ? WeakSet<DeepReadonly<U>>
    : T extends Promise<infer U>
    ? Promise<DeepReadonly<U>>
    : T extends {}
    ? {
          readonly [K in keyof T]: DeepReadonly<T[K]>;
      }
    : Readonly<T>;

export declare type DeepWritable<T> = T extends Builtin
    ? T
    : T extends Map<infer K, infer V>
    ? Map<DeepWritable<K>, DeepWritable<V>>
    : T extends ReadonlyMap<infer K, infer V>
    ? Map<DeepWritable<K>, DeepWritable<V>>
    : T extends WeakMap<infer K, infer V>
    ? WeakMap<DeepWritable<K>, DeepWritable<V>>
    : T extends Set<infer U>
    ? Set<DeepWritable<U>>
    : T extends ReadonlySet<infer U>
    ? Set<DeepWritable<U>>
    : T extends WeakSet<infer U>
    ? WeakSet<DeepWritable<U>>
    : T extends Promise<infer U>
    ? Promise<DeepWritable<U>>
    : T extends {}
    ? {
          -readonly [K in keyof T]: DeepWritable<T[K]>;
      }
    : T;

/*
 * Для каждого observable Хранит computed, возвращающий иммутабельный snapshot
 */
const snapshotComputeds = new WeakMap<any, any>();

/*
 * Реактивная функция, возвращающия иммутабельную snapshot observable'а
 */
export function getSnapshot<T>(obj: T): DeepReadonly<T> {
    if (!mobx.isObservable(obj)) {
        return obj as DeepReadonly<T>;
    }

    let computed = snapshotComputeds.get(obj);

    if (!computed) {
        // FIXME: В текущей реализации, если от снэпшота полностью отписаться, а потом запросить новый,
        // то создатся новый объект, который не пройдёт проверку на ссылочное равенство со старым. Это не очень хорошо,
        // но вряд ли приведёт к каким-либо проблемам.
        // Как вариант, можно попробовать использовать keepAlive: true, но тогда может течь память. Это надо проверить.
        computed = mobx.computed(() => {
            let res;
            if (mobx.isObservableArray(obj)) {
                res = mobx.values(obj).map((v) => (mobx.isObservable(v) ? getSnapshot(v) : v));
            } else if (mobx.isObservableMap(obj)) {
                res = new Map(mobx.entries(obj).map(([k, v]) => [k, mobx.isObservable(v) ? getSnapshot(v) : v]));
            } else {
                res = fromEntries(mobx.entries(obj).map(([k, v]) => [k, mobx.isObservable(v) ? getSnapshot(v) : v]));
            }
            observables.set(res, obj);
            return res;
        });

        snapshotComputeds.set(obj, computed);
    }

    return computed.get();
}

/*
 * Хранит ссылки со снепшотов на исходные observable
 */
const observables = new WeakMap<any, any>();

/*
 * Восстанавливает исходный observable из его иммутабельного снэпшота
 */
export function restoreObservable<T>(obj: T): DeepWritable<T> {
    return observables.get(obj);
}
