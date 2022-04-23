import React, {useRef, createContext, ReactNode, useContext, useCallback, useState} from 'react';
import * as mobx from 'mobx';
import {useObserver} from 'mobx-react-lite/lib/useObserver';
import {enableStaticRendering} from 'mobx-react-lite/lib/staticRendering';

import {FetchOptions, Query, Zest} from '../zest';
import * as t from '../types';
import {AnyEndpoint, Endpoint} from '../endpoint';
import {DeepWritable, restoreObservable, getSnapshot} from '../snapshot';
import {AnyModel, ModelKey} from '../model';
import {useLoadingBoundary} from './loading-boundary';

if (process.env.IS_SERVER) {
    enableStaticRendering(true);
}

export const ZestContext = createContext<Zest | undefined>(undefined);

export const useZest = () => {
    const zest = useContext(ZestContext);

    if (!zest) {
        throw new Error('Zest Context is not set');
    }

    return zest;
};

export const ZestProvider = ({children}: {children: ReactNode}) => {
    const zest = useRef<Zest | undefined>();
    if (!zest.current) {
        zest.current = new Zest();
    }

    return <ZestContext.Provider value={zest.current}>{children}</ZestContext.Provider>;
};

export interface UseQueryOptions<E extends AnyEndpoint> extends FetchOptions<E> {
    manualLoadingHandling?: boolean;
    manualErrorHandling?: boolean;
}

export type UseQueryResult<ParamsType extends t.AnyType, ResultType extends t.AnyType> = [
    Query<ParamsType, ResultType>['data'],
    Omit<Query<ParamsType, ResultType>, 'data'>,
];

/*
 * Хук, следящий за изменением params и осуществляющий запрос к Endpoint с текущим значением params.
 */
export function useQuery<ParamsType extends t.AnyType, ResultType extends t.AnyType>(
    endpoint: Endpoint<ParamsType, ResultType>,
    params: t.InternalOf<ParamsType> | null | undefined,
    opts: UseQueryOptions<Endpoint<ParamsType, ResultType>> = {},
): UseQueryResult<ParamsType, ResultType> {
    const zest = useZest();

    const [paramsBox] = useState(() => mobx.observable.box(params, {name: 'ParamsBox', deep: false}));
    mobx.runInAction(() => paramsBox.set(params || null));

    const [query] = useState(() => zest.query(endpoint, () => paramsBox.get(), opts));
    const [querySnapshot] = useState(() =>
        mobx.computed(
            () => ({
                loading: query.loading,
                error: query.error,
                params: query.params,
                data: query.data && (getSnapshot(query.data) as t.InternalOf<ResultType> | undefined),

                // Actions are non-enumerable
                refetch: query.refetch,
            }),
            {name: 'QueryStateSnapshot', equals: mobx.comparer.shallow},
        ),
    );

    const {data, ...rest} = useObserver(() => querySnapshot.get());

    useLoadingBoundary(
        opts.manualLoadingHandling ? false : rest.loading,
        opts.manualErrorHandling ? undefined : rest.error,
        rest.refetch,
    );
    return [data, rest];
}

export function useEndpoint<E extends AnyEndpoint>(endpoint: E) {
    const zest = useZest();

    const mutate = useCallback((params: t.InternalOf<E['params']>) => zest.request(endpoint, params), [zest]);

    return mutate;
}

export function useInstance<M extends AnyModel>(Model: M, key: ModelKey<M> | null | undefined) {
    const zest = useZest();

    return useObserver(() => (key ? getSnapshot(zest.getInstance(Model, key)) : undefined));
}

export function useFetchMore<ParamsType extends t.AnyType, ResultType extends t.AnyType>(
    endpoint: Endpoint<ParamsType, ResultType>,
    queryState: UseQueryResult<ParamsType, ResultType>,
    mergeMore: (
        data: DeepWritable<t.InternalOf<ResultType>>,
        moreData: t.InternalOf<ResultType>,
    ) => t.InternalOf<ResultType>,
) {
    const fetch = useEndpoint(endpoint);
    const [loadingMore, setLoading] = useState(false);
    const [error, setError] = useState<unknown>();
    const data = restoreObservable(queryState[0]);
    const {params} = queryState[1];
    const fetchMore = useCallback(
        async (moreParams: Partial<t.InternalOf<ParamsType>>) => {
            if (!data || !params) {
                return;
            }

            setError(undefined);
            setLoading(true);
            try {
                const moreData = await fetch({...params, ...moreParams});
                mobx.runInAction(() => {
                    const newData = mergeMore(data, moreData);
                    Object.assign(data, newData);
                });
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        },
        [data, params],
    );

    return [fetchMore, {loadingMore, error}] as const;
}
