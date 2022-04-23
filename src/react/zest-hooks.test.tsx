import {act, renderHook} from '@testing-library/react-hooks';
import React from 'react';
import FakePromise from 'fake-promise';

import {AnyModel, createModelClass, ModelKey, modelKey} from '../model';
import {AnyEndpoint, createCustomEndpoint} from '../endpoint';
import {useEndpoint, useQuery, useInstance, useFetchMore, ZestContext, ZestProvider} from './zest-hooks';
import * as t from '../types';
import {Json} from '@frozen-int/parsers';
import {Zest} from '../zest';
import {createLoadingBoundary, LoadingStatusProps} from './loading-boundary';

const simpleEndpointReq = jest.fn(() => new FakePromise<Json>());
const simpleEndpoint = createCustomEndpoint({
    params: t.object({param: t.number()}),
    req: simpleEndpointReq,
    res: t.object({res: t.number()}),
});
class TestModel extends createModelClass(
    t.object({
        id: modelKey(t.number()),
        val: t.number(),
    }),
) {}

const listEndpointReq = jest.fn(() => new FakePromise<Json>());
const listEndpoint = createCustomEndpoint({
    params: t.object({param: t.number()}),
    req: listEndpointReq,
    res: t.array(t.model(TestModel)),
});

const mutationEndpointReq = jest.fn(() => new FakePromise<Json>());
const mutationEndpoint = createCustomEndpoint({
    params: t.object({id: TestModel.props.id, val: t.number()}),
    req: mutationEndpointReq,
    res: t.model(TestModel),
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.AbortController = function () {
    return {abort};
};
const abort = jest.fn();

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.DOMException = class extends Error {
    constructor(public message: string, public name: string) {
        super();
    }
};

let zest = new Zest();

const LoadingIndicator = jest.fn(({pendingCount, errors, children}: LoadingStatusProps) => (
    <>
        {pendingCount ? 'loading' : null}
        {errors.length ? 'error' : null}
        {children}
    </>
));

const LoadingBoundary = createLoadingBoundary(LoadingIndicator);

const wrapper: React.FC<any> = ({children}) => (
    <ZestContext.Provider value={zest}>
        <LoadingBoundary>{children}</LoadingBoundary>
    </ZestContext.Provider>
);

const renderUseQuery = <E extends AnyEndpoint>(endpoint: E, initialProps?: t.InternalOf<E['params']>) =>
    renderHook((params: t.InternalOf<E['params']> | undefined) => useQuery(endpoint, params), {
        initialProps,
        wrapper,
    });

const renderUseInstance = <M extends AnyModel>(Model: M, initialProps?: ModelKey<M> | undefined) =>
    renderHook((params: ModelKey<M> | undefined) => useInstance(Model, params), {
        initialProps,
        wrapper,
    });

const renderUseEndpoint = <E extends AnyEndpoint>(endpoint: E, initialProps?: t.InternalOf<E['params']>) =>
    renderHook(() => useEndpoint(endpoint), {
        initialProps,
        wrapper,
    });

const renderUseFetchMore = <E extends AnyEndpoint>(endpoint: E, initialProps?: t.InternalOf<E['params']>) =>
    renderHook(
        (params: t.InternalOf<E['params']> | undefined) => {
            const query = useQuery(endpoint, params);
            const more = useFetchMore(endpoint, query, (data, moreData) => [...data, ...moreData]);
            return {query, more};
        },
        {initialProps, wrapper},
    );

type UseQueryState = ReturnType<typeof useQuery>;
let lastResult: UseQueryState;
function expectStateChange<T>(
    res: readonly [T, UseQueryState[1]],
    state?: Partial<UseQueryState[1]>,
    data?: T,
    resetData?: boolean,
) {
    lastResult = [resetData ? undefined : data ?? lastResult[0], Object.assign({}, lastResult[1], state)];
    expect(res).toEqual(lastResult);
}

describe('useQuery', () => {
    beforeEach(() => {
        abort.mockClear();
        simpleEndpointReq.mockClear();
        listEndpointReq.mockClear();
        LoadingIndicator.mockClear();
        zest = new Zest();
        lastResult = [
            undefined,
            {
                error: undefined,
                loading: false,
                params: undefined,
                refetch: expect.any(Function),
            },
        ];
    });

    it('fetches data', async () => {
        const {result, rerender, waitForNextUpdate} = renderUseQuery(simpleEndpoint);

        expectStateChange(result.current);
        expect(simpleEndpointReq).toBeCalledTimes(0);
        expect(LoadingIndicator).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 0,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        rerender({param: 1});
        expectStateChange(result.current, {loading: true});
        expect(simpleEndpointReq).toBeCalledTimes(1);
        expect(LoadingIndicator).toBeCalledTimes(2);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 1,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        simpleEndpointReq.mock.results[0].value.resolve({res: 1});
        simpleEndpointReq.mockClear();
        await waitForNextUpdate();
        expectStateChange(result.current, {loading: false, params: {param: 1}}, {res: 1});
        expect(LoadingIndicator).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 0,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        rerender({param: 2});
        expectStateChange(result.current, {loading: true});
        expect(simpleEndpointReq).toBeCalledTimes(1);
        expect(LoadingIndicator).toBeCalledTimes(2);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 1,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        simpleEndpointReq.mock.results[0].value.resolve({res: 2});
        simpleEndpointReq.mockClear();
        await waitForNextUpdate();
        expectStateChange(result.current, {loading: false, params: {param: 2}}, {res: 2});
        expect(LoadingIndicator).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 0,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        rerender({param: 3});
        expectStateChange(result.current, {loading: true});
        expect(simpleEndpointReq).toBeCalledTimes(1);
        LoadingIndicator.mockClear();

        simpleEndpointReq.mock.results[0].value.reject('error');
        simpleEndpointReq.mockClear();
        await waitForNextUpdate();
        expectStateChange(result.current, {error: 'error', loading: false, params: {param: 3}}, undefined, true);
        expect(abort).toBeCalledTimes(0);
        expect(LoadingIndicator).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 0,
                errors: ['error'],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );

        act(() => {
            LoadingIndicator.mock.calls[0][0].retry();
        });
        expectStateChange(result.current, {loading: true});
        expect(simpleEndpointReq).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 1,
                errors: ['error'],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
        LoadingIndicator.mockClear();

        simpleEndpointReq.mock.results[0].value.resolve({res: 3});
        simpleEndpointReq.mockClear();
        await waitForNextUpdate();
        expectStateChange(result.current, {loading: false, error: undefined, params: {param: 3}}, {res: 3});
        expect(LoadingIndicator).toBeCalledTimes(1);
        expect(LoadingIndicator).toHaveBeenLastCalledWith(
            {
                pendingCount: 0,
                errors: [],
                ownProps: expect.objectContaining({}),
                children: expect.anything(),
                retry: expect.any(Function),
            },
            {},
        );
    });

    it('cancels requests', async () => {
        const {rerender} = renderUseQuery(simpleEndpoint, {param: 1});

        expect(abort).toBeCalledTimes(0);
        rerender({param: 2});
        simpleEndpointReq.mock.results[0].value.reject(new DOMException('abort', 'AbortError'));
        expect(abort).toBeCalledTimes(1);
    });

    it('deduplicates requests', async () => {
        const hook1 = renderUseQuery(simpleEndpoint, {param: 1});

        const hook2 = renderUseQuery(simpleEndpoint, {param: 1});

        expect(simpleEndpointReq).toBeCalledTimes(1);
        expectStateChange(hook1.result.current, {loading: true});
        expectStateChange(hook2.result.current);

        simpleEndpointReq.mock.results[0].value.resolve({res: 1});
        await hook1.waitForNextUpdate();
        expectStateChange(hook1.result.current, {loading: false, params: {param: 1}}, {res: 1});
        expectStateChange(hook2.result.current);
    });

    it('normalizes and updates model instances', async () => {
        const listHook = renderUseQuery(listEndpoint, {param: 1});

        listEndpointReq.mock.results[0].value.resolve([{id: 1, val: 1}]);
        await listHook.waitForNextUpdate();

        const instanceHook = renderUseInstance(TestModel, {id: 1});

        listEndpointReq.mockClear();
        expect(instanceHook.result.current).toEqual({id: 1, val: 1});

        act(() => {
            listHook.result.current[1].refetch();
        });
        expect(listEndpointReq).toBeCalledTimes(1);
        listEndpointReq.mock.results[0].value.resolve([{id: 1, val: 2}]);
        listEndpointReq.mockClear();
        await instanceHook.waitForNextUpdate();
        expect(instanceHook.result.current).toEqual({id: 1, val: 2});
        expectStateChange(listHook.result.current, {params: {param: 1}}, [{id: 1, val: 2} as TestModel]);

        instanceHook.rerender({id: 2});
        expect(instanceHook.result.current).toEqual(undefined);

        listHook.rerender({param: 2});
        expectStateChange(listHook.result.current, {loading: true, params: {param: 1}}, [{id: 1, val: 2} as TestModel]);
        expect(listEndpointReq).toBeCalledTimes(1);

        listEndpointReq.mock.results[0].value.resolve([{id: 2, val: 2}]);
        await listHook.waitForNextUpdate();
        expect(instanceHook.result.current).toEqual({id: 2, val: 2});

        const {
            result: {current: mutate},
        } = renderUseEndpoint(mutationEndpoint);
        mutate({id: 2, val: 4});
        expect(mutationEndpointReq).toBeCalledTimes(1);
        mutationEndpointReq.mock.results[0].value.resolve({id: 2, val: 5});

        await listHook.waitForNextUpdate();
        expectStateChange(listHook.result.current, {loading: false, params: {param: 2}}, [
            {id: 2, val: 5} as TestModel,
        ]);
        expect(instanceHook.result.current).toEqual({id: 2, val: 5});

        instanceHook.rerender({id: 1});
        expect(instanceHook.result.current).toEqual({id: 1, val: 2});
    });

    it('fetches more data', async () => {
        const {result, rerender, waitForNextUpdate} = renderUseFetchMore(listEndpoint, {param: 1});

        listEndpointReq.mock.results[0].value.resolve([{id: 1, val: 1}]);
        await waitForNextUpdate();

        expectStateChange(result.current.query, {params: {param: 1}, loading: false}, [{id: 1, val: 1} as TestModel]);
        // expect(LoadingIndicator).toBeCalledTimes(1);
        listEndpointReq.mockClear();
        LoadingIndicator.mockClear();

        act(() => {
            result.current.more[0]({param: 2});
        });
        expectStateChange(result.current.query, {params: {param: 1}, loading: false}, [{id: 1, val: 1} as TestModel]);
        expect(result.current.more[1]).toEqual({loadingMore: true});
        expect(LoadingIndicator).toBeCalledTimes(0);

        listEndpointReq.mock.results[0].value.reject('Error');
        await waitForNextUpdate();
        expectStateChange(result.current.query);
        expect(result.current.more[1]).toEqual({loadingMore: false, error: 'Error'});
        expect(LoadingIndicator).toBeCalledTimes(0);

        listEndpointReq.mockClear();
        act(() => {
            result.current.more[0]({param: 2});
        });
        expectStateChange(result.current.query);

        listEndpointReq.mock.results[0].value.resolve([{id: 2, val: 2}]);
        await waitForNextUpdate();
        expectStateChange(result.current.query, {params: {param: 1}, error: undefined, loading: false}, [
            {id: 1, val: 1},
            {id: 2, val: 2},
        ] as TestModel[]);
        expect(LoadingIndicator).toBeCalledTimes(0);

        listEndpointReq.mockClear();
        rerender({param: 3});
        expectStateChange(result.current.query, {loading: true});

        listEndpointReq.mock.results[0].value.resolve([{id: 3, val: 3}]);
        await waitForNextUpdate();
        expectStateChange(result.current.query, {params: {param: 3}, loading: false}, [{id: 3, val: 3} as TestModel]);
    });

    it('has 100% code coverage', () => {
        const queryHook = renderHook(() => useQuery(simpleEndpoint, undefined));
        expect(queryHook.result.error).toBeInstanceOf(Error);

        const mutationHook = renderHook(() => useEndpoint(mutationEndpoint));
        expect(mutationHook.result.error).toBeInstanceOf(Error);

        const boundaryHook = renderHook(() => useQuery(simpleEndpoint, undefined), {wrapper: ZestProvider});
        expect(boundaryHook.result.error).toBeInstanceOf(Error);

        const providerHook = renderHook(() => useQuery(simpleEndpoint, undefined), {
            wrapper: ({children}) => (
                <ZestProvider>
                    <LoadingBoundary>{children}</LoadingBoundary>
                </ZestProvider>
            ),
        });
        expect(providerHook.result.current).toBeDefined();
    });
});
