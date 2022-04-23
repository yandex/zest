import React, {
    useEffect,
    useRef,
    useState,
    createContext,
    useContext,
    useMemo,
    useCallback,
    PropsWithChildren,
    useLayoutEffect,
} from 'react';

interface LoadingState {
    pending: boolean;
    error: any;
    retry(): void;
}

const LoadingContext = createContext<
    | {
          loadingStates: Record<number, LoadingState>;
          setLoadingState(id: number, state: LoadingState | undefined): void;
      }
    | undefined
>(undefined);

export type LoadingStatusProps<OwnProps = {}> = PropsWithChildren<{
    pendingCount: number;
    errors: unknown[];
    ownProps: OwnProps;
    retry: () => void;
}>;

export const createLoadingBoundary = <OwnProps extends {}>(
    LoadingStatus: React.ComponentType<LoadingStatusProps<Omit<OwnProps, 'children'>>>,
) => {
    if (process.env.NODE_ENV === 'development') {
        LoadingStatus.displayName = 'LoadingBoundary';
    }
    return ({children, ...ownProps}: {children: React.ReactNode} & OwnProps) => {
        const [childLoadingStates, setChildLoadingStates] = useState<Record<number, LoadingState>>({});
        const setLoadingState = React.useCallback(
            (id: number, state: LoadingState | undefined) => {
                setChildLoadingStates((v) => {
                    const newStates = {...v};
                    if (state) {
                        newStates[id] = state;
                    } else {
                        delete newStates[id];
                    }
                    return newStates;
                });
            },
            [setChildLoadingStates],
        );

        const parentLoadingStates = useContext(LoadingContext)?.loadingStates ?? {};
        const contextValue = useMemo(
            () => ({
                loadingStates: {...parentLoadingStates, ...childLoadingStates},
                setLoadingState,
            }),
            [parentLoadingStates, childLoadingStates, setLoadingState],
        );
        const isParentActive = Object.values(parentLoadingStates).some((s) => s.pending || s.error);
        const childPendingCount = Object.values(childLoadingStates).filter((s) => s.pending).length;
        const childErrors = Object.values(childLoadingStates)
            .map((s) => s.error)
            .filter(Boolean);

        const childLoadingStatesRef = useRef(childLoadingStates);
        childLoadingStatesRef.current = childLoadingStates;
        const retryFailed = useCallback(() => {
            Object.values(childLoadingStatesRef.current)
                .filter((s) => s.error)
                .forEach((s) => s.retry());
        }, [childLoadingStatesRef]);

        return (
            <LoadingContext.Provider value={contextValue}>
                <LoadingStatus
                    ownProps={ownProps}
                    pendingCount={isParentActive ? 0 : childPendingCount}
                    errors={isParentActive ? [] : childErrors}
                    retry={retryFailed}
                >
                    {children}
                </LoadingStatus>
            </LoadingContext.Provider>
        );
    };
};

let loadingIdCounter = 1;

export const useLoadingBoundary = (pending: boolean, error: any, retry: () => Promise<void>) => {
    const context = useContext(LoadingContext);
    if (!context) {
        throw new Error('Not wrapped in LoadingBoundary');
    }

    const {setLoadingState} = context;
    const [id] = React.useState(() => loadingIdCounter++);
    const previousPendingRef = React.useRef(false);
    const previousErrorRef = React.useRef(undefined);

    useLayoutEffect(() => {
        if (pending !== previousPendingRef.current || error !== previousErrorRef.current) {
            setLoadingState(id, {pending, error, retry});
        }

        previousPendingRef.current = pending;
        previousErrorRef.current = error;
    }, [setLoadingState, pending, error]);

    useEffect(
        () => () => {
            setLoadingState(id, undefined);
        },
        [],
    );
};
