import * as mobx from 'mobx';

import {getSnapshot} from './snapshot';

import * as t from './types';
import {fromEntries} from './utils';

/*
 * Пометка на тип, что поле является одним из ключей модели
 * Ключ - это поля, по которым инстансы запрашиваются из ручки и кэшируются
 */
export type ModelKeyPropType<T extends t.Type<any, any>> = T & {
    modelKeyProp: true;
};

export const modelKey = <T extends t.Type<any, any>>(type: T): ModelKeyPropType<T> =>
    Object.assign({}, type, {modelKeyProp: true as const});

/*
 * Пометка на тип, что поле является идентификатором
 * Идентификатор - это поле с Opaque-типом. Также идентификатор генерируется в моках автоматически.
 */
export type ModelIdentifierType<T extends t.Type<any, any>> = T & {
    modelIdentifier: string;
};

export const identifier = <UniqueName extends string, A, O = A>(name: UniqueName, type: t.Type<A, O>) =>
    Object.assign({}, t.opaque(name, type), {modelIdentifier: name});

export type ModelIdentifierPropKeys<M extends AnyModel> = keyof {
    [K in keyof M['objectType']['props'] as M['objectType']['props'][K] extends ModelIdentifierType<t.AnyType>
        ? K
        : never]: true;
};

export interface Model<T extends t.AnyObjectType> {
    objectType: T;
    props: T['props'];
    modelKeyType: t.ObjectType<PickModelKeyPropTypes<T>>;
    new (o: t.InternalOf<T>): t.InternalOf<T> & {$key: ModelKey<Model<T>>};
}

export type AnyModel = Model<t.AnyObjectType>;

type PickModelKeyPropTypes<T extends t.AnyObjectType> = {
    [K in keyof T['props'] as T['props'][K] extends ModelKeyPropType<t.AnyType> ? K : never]: T['props'][K];
};

export type ModelKey<M extends AnyModel> = t.InternalOf<M['modelKeyType']>;

function castAsConstructor<Args extends Array<unknown>, Result>(
    f: (...args: Args) => Result,
): {new (...args: Args): Result} {
    return f as any;
}

export const createModelClass = <T extends t.AnyObjectType>(objectType: T): Model<T> => {
    const {props} = objectType;
    const modelKeyPropTypes = fromEntries(
        Object.entries(props).filter(([_k, v]) => (v as ModelKeyPropType<any>).modelKeyProp),
    ) as PickModelKeyPropTypes<T>;

    function constructor(o: t.InternalOf<T>) {
        const key = fromEntries(Object.entries(o).filter(([k]) => k in modelKeyPropTypes)) as ModelKey<Model<T>>;
        const instance = mobx.observable(o);
        Object.defineProperty(instance, '$key', {value: key, enumerable: false, writable: false});
        return getSnapshot(instance);
    }

    return Object.assign(castAsConstructor(constructor), {
        objectType,
        props,
        modelKeyType: t.object(modelKeyPropTypes),
    });
};
