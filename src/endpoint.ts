import {Json} from '@frozen-int/parsers';
import * as t from './types';

/*
 * Endpoint - описывает ручку API.
 * params - схема параметров ручки
 * res - схема ответа ручки
 * req - асинхронная функция, дёргающая ручку. Принимает на вход параметры, описываемые схемой params.
 * Возвращает ответ, который будет распарсен по схеме res.
 */
export interface Endpoint<ParamsType extends t.AnyType, ResultType extends t.AnyType> {
    params: ParamsType;
    req(params: t.ExternalOf<ParamsType>, abortSignal?: AbortSignal): Promise<Json | undefined>;
    res: ResultType;
}

export type AnyEndpoint = Endpoint<t.AnyType, t.AnyType>;

export function createCustomEndpoint<ParamsType extends t.AnyType, ResultType extends t.AnyType>(opts: {
    params: ParamsType;
    req(params: t.ExternalOf<ParamsType>, abortSignal: AbortSignal): Promise<Json | undefined>;
    res: ResultType;
}): Endpoint<ParamsType, ResultType> {
    return {
        ...opts,
    };
}
