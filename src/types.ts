import * as parsers from '@frozen-int/parsers';
import {boxParser, Context, unboxParser} from '@frozen-int/parsers/utils/core';
import {Intersect} from '@frozen-int/parsers/utils/types';
import {getGlobalZest} from './global';

import {AnyModel} from './model';
import {restoreObservable} from './snapshot';

import {fromEntries} from './utils';

/*
 * Тип описывает двустороннее преобразование - сериализацию и парсинг JSON'а. Также он может содержать мета-информацию,
 * например, правила валидации поля в формах.
 */
export interface Type<Internal, External = Internal> {
    name: string;
    parser: parsers.Parser<Internal>;
    serialize(input: Internal): External;
}

export const simpleType = <T>(name: string, parser: parsers.Parser<T>): Type<T> => ({
    name,
    parser,
    serialize: (i) => i,
});

export const boolean = () => ({
    ...simpleType('boolean', parsers.boolean),
});

export const number = (opts?: {min?: number}) => ({
    ...simpleType('number', parsers.number),
    min: opts?.min,
});

export const string = (opts?: {maxLength?: number}) => ({
    ...simpleType('string', parsers.string),
    maxLength: opts?.maxLength,
});

const padForDate = (number: number) => (number < 10 ? `0${number}` : number);
export const isoDate = (): Type<Date, string> => ({
    name: 'isoDate',
    parser: boxParser((json: parsers.Json | undefined, ctx: Context) => {
        ctx.assert(typeof json === 'string' && json.length === 10, 'isoDate', typeof json);
        const date = new Date(json);
        ctx.assert(!isNaN(date.valueOf()), 'isoDate', typeof json);
        return date;
    }),
    serialize: (i) => `${i.getFullYear()}-${padForDate(i.getMonth() + 1)}-${padForDate(i.getDate())}`,
});

export const literal = <T extends string | number | boolean | null>(value: T): Type<T> => ({
    ...simpleType('literal', parsers.literal(value)),
});

export const enumValue = <TEnum extends Record<string, string | number>>(
    enumObject: TEnum,
): Type<TEnum[keyof TEnum]> => ({
    ...simpleType('enum', parsers.enumValue(enumObject)),
});

export const stringUnion = <TS extends string[]>(...strings: TS): Type<TS[number]> => ({
    ...simpleType('enum', parsers.stringUnion(...strings)),
});

export const opaque = <UniqueName extends string, I, E = I>(name: UniqueName, type: Type<I, E>) =>
    type as Type<I & {type: UniqueName}, E>;

export type AnyType = Type<any, any>;
export type PropTypes = {[K in string]: AnyType};

interface MaybeType<I, E = I> extends Type<I, E> {
    optional: true;
}

export const maybe = <I, E = I>(type: Type<I, E>): MaybeType<I | undefined, E | undefined> => ({
    ...type,
    parser: parsers.maybe(type.parser),
    serialize: (i) => (i === undefined ? undefined : type.serialize(i)),
    optional: true as const,
});

export const nullish = <I, E = I>(type: Type<I, E>): Type<I | null, E | null> => ({
    ...type,
    parser: parsers.nullish(type.parser),
    serialize: (i) => (i === null ? null : type.serialize(i)),
});

export type InternalOf<T extends AnyType> = T extends Type<infer I, any> ? I : never;
export type InternalOfProps<P extends PropTypes> = {
    [K in keyof P as P[K] extends MaybeType<any, any> ? K : never]?: InternalOf<P[K]>;
} & {
    [K in keyof P as P[K] extends MaybeType<any, any> ? never : K]: InternalOf<P[K]>;
};
export type ExternalOf<T extends AnyType> = T extends Type<any, infer E> ? E : never;
export type ExternalOfProps<P extends PropTypes> = {[K in keyof P]: ExternalOf<P[K]>};

export interface ObjectType<P extends PropTypes, I = InternalOfProps<P>, E = ExternalOfProps<P>> extends Type<I, E> {
    props: P;
}

export type AnyObjectType = ObjectType<any, any, any>;

export const emptyObject = (): Type<Record<never, unknown>> => ({
    name: 'emptyObject',
    parser: parsers.emptyObject,
    serialize: () => '{}',
});

export const object = <P extends PropTypes>(props: P): ObjectType<P> => ({
    name: 'object',
    props,
    parser: parsers.object(
        fromEntries(Object.entries(props).map(([key, type]) => [key, type.parser])),
    ) as parsers.Parser<InternalOfProps<P>>,
    serialize: (i: InternalOfProps<P>) =>
        fromEntries(
            Object.entries(props).map(([key, type]) => [key, type.serialize(i[key as keyof InternalOfProps<P>])]),
        ) as ExternalOfProps<P>,
});

export type PropsOf<T extends AnyObjectType> = T extends ObjectType<infer P, any, any> ? P : never;

export const intersection = <T extends AnyObjectType[]>(
    ...types: T
): ObjectType<PropsOf<T[number]>, Intersect<InternalOf<T[number]>>, Intersect<ExternalOf<T[number]>>> => ({
    name: 'intersection',
    props: Object.assign({}, ...types.map((t) => t.props)),
    parser: parsers.intersection(...types.map((t) => t.parser)),
    serialize: (i) => Object.assign({}, ...types.map((t) => t.serialize(i))),
});

export const union = <T extends Record<string, AnyType>>(
    types: T,
): Type<InternalOf<T[keyof T]>, ExternalOf<T[keyof T]>> => ({
    name: 'union',
    parser: parsers.union(fromEntries(Object.entries(types).map(([key, t]) => [key, t.parser]))),
    serialize: (i) => {
        for (const [, t] of Object.entries(types)) {
            try {
                return t.serialize(i);
                // eslint-disable-next-line no-empty
            } catch (e) {}
        }
        throw new Error('Could not serialize union type');
    },
});

export const disjointUnion = <K extends string, O extends Record<string, AnyObjectType>>(
    key: K,
    types: O,
): Type<
    {[L in keyof O]: {[M in K]: L} & InternalOf<O[L]>}[keyof O],
    {[L in keyof O]: {[M in K]: L} & ExternalOf<O[L]>}[keyof O]
> => ({
    name: 'disjointUnion',
    parser: parsers.disjointUnion(key, fromEntries(Object.entries(types).map(([k, t]) => [k, t.parser]))),
    serialize: (i) => ({...types[i[key]].serialize(i), [key]: i[key]}),
});

export const array = <T, O = T>(type: Type<T, O>): Type<Array<T>, Array<O>> => ({
    name: 'array',
    parser: parsers.array(type.parser),
    serialize: (i) => i.map(type.serialize),
});

export const map = <T, O = T>(type: Type<T, O>): Type<Map<string, T>, Record<string, O>> => ({
    name: 'map',
    parser: boxParser((json, ctx) => {
        const record = unboxParser(parsers.record(type.parser))(json, ctx);
        return new Map(Object.entries(record));
    }),
    serialize: (i) => fromEntries([...i].map(([k, v]) => [k, type.serialize(v)])),
});

export type ModelType<M extends AnyModel> = Type<InstanceType<M>, ExternalOf<M['objectType']>>;

export const model = <M extends AnyModel>(Model: M): ModelType<M> => ({
    name: 'model',
    parser: boxParser((json, ctx) => {
        const zest = getGlobalZest();
        if (!zest) {
            throw new Error('Parsing model instance outside of zest');
        }
        const obj = unboxParser(Model.objectType.parser)(json, ctx);
        const externalKey = Model.modelKeyType.serialize(obj);
        const cacheKey = JSON.stringify(externalKey);

        const modelInstances = zest.getModelInstances(Model);
        const instance = modelInstances.get(cacheKey);
        if (instance) {
            Object.assign(instance, obj);
            return instance;
        }

        const newInstance = restoreObservable(new Model(obj));
        modelInstances.set(cacheKey, newInstance);

        return newInstance;
    }),
    serialize: (input) => Model.objectType.serialize(input),
});
