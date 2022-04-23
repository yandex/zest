import * as mobx from 'mobx';

import {parseStrict} from '@frozen-int/parsers';
import {AnyEndpoint, Endpoint} from './endpoint';
import * as t from './types';
import {isObjectObserved} from './utils';
import {withGlobalZest} from './global';
import {AnyModel, ModelKey} from './model';

/*
 * Resource - это QueryEndpoint с заданными, фиксированными значениями параметров. В большинстве случаев, это URL
 * с заданным query string. Один ресурс может загружаться множество раз.
 */
export class Resource<ParamsType extends t.AnyType, ResultType extends t.AnyType> {
    data: t.InternalOf<ResultType> | undefined = undefined;
    loading: boolean = false;
    error: any = undefined;

    private listeners = new Map<() => void, undefined>();
    private abortController?: AbortController;

    constructor(
        private readonly zest: Zest,
        private readonly endpoint: Endpoint<ParamsType, ResultType>,
        private readonly params: t.InternalOf<ParamsType>,
    ) {
        mobx.makeObservable(this, {
            data: mobx.observable,
            loading: mobx.observable,
        });
    }

    /*
     * Подписан ли сейчас кто-то на состояние этого ресурса.
     */
    get isUsed() {
        return Boolean(
            this.listeners.size ||
                mobx.getObserverTree(this, 'loading').observers?.length ||
                isObjectObserved(this.data),
        );
    }

    /*
     * Проверка, что ресурс в загруженном состоянии, т.е. у нас есть data, которую можно использовать.
     *
     * 1. Если на ресурс никто не был подписан, то считаем результат инвалидированным. Такой кэш будет использоваться
     * только в оффлайне.
     * 2. Если ресурс в состоянии загрузки, то считаем, что нужно ждать результата загрузки.
     * 3. Последняя загрузка могла завершиться с ошибкой, это не имеет значения. Если до этого было успешное выполнение,
     * можно использовать его результат.
     * Т.е. если кто-то подписывается на ресурс в состоянии загрузки, то он может в итоге завершиться ошибкой.
     * Но подписка уже после ошибки может завершиться успешно.
     */
    get isReady() {
        return Boolean(this.isUsed && !this.loading && this.data);
    }

    addListener(cb: () => void) {
        this.listeners.set(cb, undefined);
    }

    removeListener(cb: () => void) {
        this.listeners.delete(cb);

        if (!this.listeners.size) {
            this.abortController?.abort();
        }
    }

    private callListeners() {
        for (const cb of this.listeners.keys()) {
            cb();
        }
        this.listeners.clear();
    }

    async fetch(params: t.InternalOf<ParamsType>) {
        this.abortController?.abort();
        this.loading = true;
        if (typeof AbortController !== 'undefined') {
            this.abortController = new AbortController();
        }
        try {
            return await this.zest.request(this.endpoint, params, this.abortController?.signal, (data) => {
                this.data = data;
                this.loading = false;
                this.error = undefined;
                this.callListeners();
            });
        } catch (err) {
            if (process.env.NODE_ENV !== 'test') {
                console.error('Zest caught an error during fetch:', err);
            }

            mobx.runInAction(() => {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    this.error = err;
                }
                this.loading = false;
                this.callListeners();
            });
        } finally {
            this.abortController = undefined;
        }
    }
}

export interface FetchOptions<E extends AnyEndpoint> {
    /* Эти режимы копируют поведение Apollo:
     * https://www.apollographql.com/docs/react/data/queries/#supported-fetch-policies
     * Я не думаю, что они все нам нужны. Причина, по которой я их добавил - чтобы добиться достаточно гибкой реализации.
     * Позже можно выпилить ненужные и упростить код query.
     */
    fetchPolicy?: 'cache-first' | 'cache-only' | 'cache-and-network' | 'network-only' | 'no-cache';
    onFetched?(data: t.InternalOf<E['res']>, params: t.InternalOf<E['params']>): void;
}

export class Query<ParamsType extends t.AnyType, ResultType extends t.AnyType> {
    loading = false;
    error: any = undefined;
    params: t.InternalOf<ParamsType> | null | undefined = undefined;

    get data() {
        return this.internals.loadedResource?.data;
    }

    refetch = () => {
        return this.fetch(true);
    };

    // Internal observables
    private internals = {
        query: this,
        get params() {
            return this.query.paramsFn() ?? undefined;
        },
        get externalParams() {
            return this.params === undefined ? undefined : this.query.endpoint.params.serialize(this.params);
        },
        get resourceKey() {
            return this.externalParams === undefined ? undefined : JSON.stringify(this.externalParams);
        },
        loadedResource: undefined as Resource<ParamsType, ResultType> | undefined,
    };

    private resources: Record<string, Resource<ParamsType, ResultType>>;
    private currentResource: Resource<ParamsType, ResultType> | undefined;

    private handleResourceResult = () => {
        this.loading = false;
        this.params = this.internals.params;
        this.error = this.currentResource?.error;
        this.internals.loadedResource = this.currentResource;
    };

    private fetch = async (force?: boolean, params: t.InternalOf<ParamsType> | undefined = this.internals.params) => {
        if (!this.currentResource || params === undefined) {
            /* istanbul ignore next */
            return;
        }
        this.loading = true;
        this.currentResource?.addListener(this.handleResourceResult);
        if (!this.currentResource.loading || force) {
            const data = await this.currentResource.fetch(params);
            if (data) {
                this.opts?.onFetched?.(data, params);
            }
        }
    };

    private handleResource = (resourceKey: string | undefined) => {
        this.currentResource?.removeListener(this.handleResourceResult);

        if (!resourceKey || this.internals.params === undefined) {
            this.currentResource = undefined;
            this.internals.loadedResource = undefined;
            this.loading = false;
            this.error = undefined;
            return;
        }

        this.currentResource = undefined;

        if (this.opts?.fetchPolicy !== 'no-cache') {
            this.currentResource = this.resources[resourceKey];
        }

        if (!this.currentResource) {
            this.currentResource = new Resource(this.zest, this.endpoint, this.internals.params);
            if (this.opts?.fetchPolicy !== 'no-cache') {
                this.resources[resourceKey] = this.currentResource;
            }
        }

        if (
            (this.currentResource.isReady && this.opts?.fetchPolicy !== 'network-only') ||
            (this.currentResource.data && this.opts?.fetchPolicy === 'cache-only')
        ) {
            this.internals.loadedResource = this.currentResource;
            this.params = this.internals.params;

            if (this.opts?.fetchPolicy !== 'cache-and-network') {
                this.loading = false;
                return;
            }
        }
        if (this.opts?.fetchPolicy === 'cache-only') {
            throw new Error('Missing query data in cache');
        }

        this.fetch();
    };

    constructor(
        private zest: Zest,
        private endpoint: Endpoint<ParamsType, ResultType>,
        private paramsFn: () => t.InternalOf<ParamsType> | null | undefined,
        private opts?: FetchOptions<Endpoint<ParamsType, ResultType>>,
    ) {
        this.resources = zest.getEndpointResources(endpoint);

        mobx.makeObservable(this, {
            loading: true,
            error: true,
            params: true,
            data: true,
            refetch: true,
        });
        mobx.makeAutoObservable(this.internals, {query: false});

        const endpointQueries = zest.getEndpointQueriesMap(endpoint);
        let dispose: mobx.IReactionDisposer;
        mobx.onBecomeObserved(this, 'loading', () => {
            endpointQueries.set(this, null);
            dispose = mobx.reaction(() => this.internals.resourceKey, this.handleResource, {
                name: 'OnQueryParamsChange',
            });
            this.handleResource(this.internals.resourceKey);
        });
        mobx.onBecomeUnobserved(this, 'loading', () => {
            endpointQueries.delete(this);
            this.currentResource?.removeListener(this.handleResourceResult); // TODO: Cover with a test
            dispose();
        });
    }
}

export class Zest {
    instances = new Map<AnyModel, mobx.ObservableMap<string, InstanceType<AnyModel>>>();

    resources = new Map<AnyEndpoint, Record<string, Resource<t.AnyType, t.AnyType>>>();

    queries = new Map<AnyEndpoint, Map<Query<t.AnyType, t.AnyType>, null>>();

    getModelInstances<M extends AnyModel>(model: M) {
        let map = this.instances.get(model) as mobx.ObservableMap<string, InstanceType<M>> | undefined;
        if (!map) {
            map = mobx.observable.map();
            this.instances.set(model, map);
        }
        return map;
    }

    getEndpointResources<ParamsType extends t.AnyType, ResultType extends t.AnyType>(
        endpoint: Endpoint<ParamsType, ResultType>,
    ) {
        let map = this.resources.get(endpoint) as Record<string, Resource<ParamsType, ResultType>> | undefined;
        if (!map) {
            map = {};
            this.resources.set(endpoint, map);
        }
        return map;
    }

    getEndpointQueriesMap<ParamsType extends t.AnyType, ResultType extends t.AnyType>(
        endpoint: Endpoint<ParamsType, ResultType>,
    ) {
        let map = this.queries.get(endpoint) as Map<Query<ParamsType, ResultType>, null> | undefined;
        if (!map) {
            map = new Map();
            this.queries.set(endpoint, map);
        }
        return map;
    }

    getEndpointQueries<ParamsType extends t.AnyType, ResultType extends t.AnyType>(
        endpoint: Endpoint<ParamsType, ResultType>,
    ) {
        return this.getEndpointQueriesMap(endpoint).keys();
    }

    async request<E extends AnyEndpoint>(
        endpoint: E,
        params: t.InternalOf<E['params']>,
        signal?: AbortSignal,
        cb?: (data: t.InternalOf<E['res']>) => void,
    ): Promise<t.InternalOf<E['res']>> {
        const json = await endpoint.req(endpoint.params.serialize(params), signal);
        const data =
            json === undefined
                ? undefined // в поле url пусто - запрос отменён
                : mobx.runInAction(() => {
                      const data = withGlobalZest(this, () => parseStrict(endpoint.res.parser, json, 'zest'));
                      cb?.(data);
                      return data;
                  });
        return data;
    }

    getInstance = <T extends AnyModel>(Model: T, key: ModelKey<T>) => {
        const externalKey = Model.modelKeyType.serialize(key);
        const cacheKey = JSON.stringify(externalKey);
        const modelResources = this.getModelInstances(Model);
        return modelResources.get(cacheKey);
    };

    /*
     * Query - это декларативный загрузчик данных. Он вычисляет paramsFn и подписывается на соответствующий Resource.
     * paramsFn может использовать observable данные, тогда параметры запроса будут перевычисляться при изменении данных-зависимостей.
     * (т.е. внутри paramsFn оборачивается в computed).
     * При изменении параметров запроса происходит автоматическое переключение на соответствующий Resource.
     */
    query = <ParamsType extends t.AnyType, ResultType extends t.AnyType>(
        endpoint: Endpoint<ParamsType, ResultType>,
        paramsFn: () => t.InternalOf<ParamsType> | null | undefined,
        opts?: FetchOptions<Endpoint<ParamsType, ResultType>>,
    ) => {
        return new Query(this, endpoint, paramsFn, opts);
    };
}
