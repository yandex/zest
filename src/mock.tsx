import React, {FC} from 'react';
import * as mobx from 'mobx';
import {ModelKey, AnyModel, ModelIdentifierPropKeys, ModelIdentifierType} from './model';
import {Endpoint} from './endpoint';
import * as t from './types';
import {Zest} from './zest';
import {restoreObservable} from './snapshot';
import {ZestContext} from './react';
import {AnyEndpoint} from '.';
import {parseStrict} from '@frozen-int/parsers';
import {withGlobalZest} from './global';

export class Mocks {
    db = new Map<AnyModel, Record<string, InstanceType<AnyModel>>>();
    public endpoints = new Map<Endpoint<any, any>, Function>();
    public identifierCounters = new Map<string, number>();

    mockInstance<M extends AnyModel>(
        Model: M,
        // Тоже самое, что Omit<t.InternalOf<M['objectType'], ModelIdentifierPropKeys<M>>
        // но лучше раскрывается в подсказках IDE
        obj: {
            [K in keyof t.InternalOf<M['objectType']> as K extends ModelIdentifierPropKeys<M>
                ? never
                : K]: t.InternalOf<M['objectType']>[K];
        },
    ): InstanceType<M> {
        const identifiers: Partial<t.InternalOf<M['objectType']>> = {};
        for (const [key, prop] of Object.entries(Model.props) as Array<[keyof M['props'], t.AnyType]>) {
            const idProp = prop as ModelIdentifierType<t.Type<any>>;
            if (idProp.modelIdentifier) {
                const count = (this.identifierCounters.get(idProp.modelIdentifier) || 0) + 1;
                identifiers[key] = `${count}`;
                this.identifierCounters.set(idProp.modelIdentifier, count);
            }
        }
        const instance = restoreObservable(new Model({...identifiers, ...obj}));
        const instances = this.db.get(Model) || {};
        if (Object.keys(instances).length === 0) {
            this.db.set(Model, instances);
        }
        const stringKey = JSON.stringify(Model.modelKeyType.serialize(instance.$key));
        instances[stringKey] = instance;
        return instance;
    }

    mockEndpoint<E extends Endpoint<any, any>>(
        endpoint: E,
        fn: (params: t.InternalOf<E['params']>) => t.InternalOf<E['res']>,
    ) {
        if (this.endpoints.has(endpoint)) {
            throw new Error('Endpoint is already mocked');
        }
        return this.endpoints.set(endpoint, fn);
    }

    getInstances = <M extends AnyModel>(model: M): InstanceType<M>[] => {
        return Object.values(this.db.get(model) || {});
    };

    getInstance = <M extends AnyModel>(Model: M, key: ModelKey<M>): InstanceType<M> => {
        const instances = this.db.get(Model) || {};
        const stringKey = JSON.stringify(Model.modelKeyType.serialize(key));
        return instances[stringKey];
    };
}

export class ZestMock extends Zest {
    constructor(private mocks: Mocks) {
        super();
    }

    async request<E extends AnyEndpoint>(
        endpoint: E,
        params: t.InternalOf<E['params']>,
        signal?: AbortSignal,
        cb?: (data: t.InternalOf<E['res']>) => void,
    ) {
        const mock = this.mocks.endpoints.get(endpoint);
        if (!mock) {
            throw new Error('Endpoint was not mocked');
        }

        return mobx.runInAction(() => {
            // Serialize and parse data to put model instances to storage
            const raw = endpoint.res.serialize(mock(params));
            const data = withGlobalZest(this, () => parseStrict(endpoint.res.parser, raw, 'zest'));
            cb?.(data);
            return data;
        });
    }
}

export const ZestMockProvider: FC<{mocks: Mocks}> = ({mocks, children}) => (
    <ZestContext.Provider value={new ZestMock(mocks)} children={children} />
);
