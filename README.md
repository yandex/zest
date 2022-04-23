# zest (aka Цедра)

Библиотека для взаимодействия с серверным API.

## Простейший запрос

Вызвать /todo-titles, принимающий query-параметр filter и возвращающий массив строк. 

```tsx
import React, { FC } from 'react';
import { createRestQueryEndpoint, t, useQuery } from '@frozen-int/zest';

const todoTitlesEndpoint = createRestQueryEndpoint({
    params: t.object({ filter: t.string() }),
    req: ({ filter }) => ({ url: '/todo-titles', query: { filter } }),
    res: t.array(t.string()),
});

const TodoTitles: FC<{ filter: string }> = ({ title }) => {
    const [titles] = useQuery(todoTitlesEndpoint, ({filter}));

    return titles?.length ? 'Nothing found' : (
        <ul>
            {titles.map(t => <li>{t}</li>)}
        </ul>
    );
};
```

- Изменение значения filter будет отменять предыдущий запрос, если он не успел завершиться;
- если изменение filter произошло в результате печатания на клавиатуре, автоматически происходит debounce запросов (TBD, to be discussed);
- если где-то в другой компоненте параллельно выполняется такой же useQuery, запрос отправится один раз;
- если где-то в другой компоненте позже выполняется такой же useQuery, результат вернётся из кэша (настраиваемое поведение);
- индикация загрузки и ошибок запросов происходит автоматически в ближайшем по стеку компоненте `<LoadingBoundary>` (отключается опциями manualLoadingHandling и manualErrorHandling);
- возвращаемое из API значение будет проверяться на соответствие схеме ("парситься").

## Использование моделей

```tsx
import React, { FC } from 'react';
import { createQuery, t, useQuery, Model, modelKey, identifier, useInstance } from '@frozen-int/zest';

class Todo extends createRestModelClass(
    ({ id }) => `/todos/${id}`,
    {
        id: modelKey(identifier('TodoId', t.string())),
        title: t.string({ maxLength: 300 }),
    },
) {}

const todoListQuery = createRestQueryEndpoint({
    params: t.object({ filter: t.string() }),
    req: ({ filter }) => ({ url: '/todos', query: { filter } }),
    res: t.array(t.model(Todo)),
});

const TodoList: FC<{ filter: string }> = ({ title }) => {
    const [titles] = useQuery(todoListQuery, { filter });

    return titles?.length ? 'Nothing found' : (
        <ul>
            {titles.map(t => <li key={t.id}>{t.title}</li>)}
        </ul>
    );
};

const TodoModal: FC<{ todoId: Todo['id'] }> = ({ todoId }) => {
    const todo = useInstance(Todo, {id: todoId});

    return (
        <Modal>
            {todo ? <h1>{todo.title}</h1> : 'Loading'}
        </Modal>
    );    
}
```

- Ответ API внутри библиотеки нормализуется согласно схеме todoListQuery.
- Запросы в API, сделанные из других частей приложения, могут получать свежие, изменившиеся данные для инстансов моделей из кэша. При этом будет выполняться перерендер всех затронутых компонентов.

### Особенности моделей

- Модель описывается конструкцией `class Name extends createRestModelClass(...) {}`. Это позволяет Name использовать и как тип TS, и как рантаймовый объект. `createRestModelClass(...)` - это просто вызов функции, возвращающей основу для класса.
- Model вторым аргументом принимает схему модели. Схема - это широкое понятие, включающее в себя:
  - знание о том, в каком виде данные с сервера приходят,
  - знание о том, как их преобразовывать для внутреннего использования (например, преобразовать число в Date),
  - как следствие из предыдущего: TS-тип инстанса модели,
  - правила для валидации форм, работающих с инстансами данной модели,
  - дополнительная мета-информация, включающая разметку полей на:
    - ключи модели (modelKey) - поля, необходимые для запроса единичного инстанса из API
    - идентификатор (identifier) - поле, имеющее уникальное значение для каждого инстанса. Это знание используется для моков (см. раздел Моки). А ещё поле с идентификатором имеет уникальный Opaque-тип в TypeScript.
  Обычно эти вещи описываются поотдельности и имеют очень сильное пересечение, нарушая DRY.
- Первым аргументом Model принимает функцию, преобразующую ключ модели в адрес для запроса единичного инстанса.


## Мутации

```tsx
import React, { FC } from 'react';
import { createCustomEndpoint, t, useEndpoint } from '@frozen-int/zest';

const updateTodoEndpoint = createCustomEndpoint({
    params: t.object({
        id: Todo['id'],
        title: t.string(),
    }),
    req: ({ id, title }) => fetch({ url: `/todo/${id}`, body: { title } }),
    res: t.model(Todo),
});

const TodoTitles: FC<{ todo: Todo }> = ({ todo }) => {
    const updateTodo = useEndpoint(updateTodoEndpoint);
    const handleClick = useCallback(async () => {
        await updateTodo({ id: todo.id, title: 'New title' });
    });

    return (
        <button onClick={handleClick}>
            Create todo
        </button>
    );
};
```

## Моки

Идея моков в zest строится на том, чтобы наполнить псевдо базу данных, хранящуюся в памяти, нужными сущностями, и описать логику API над этой БД. Такой подход позволяет легко задать необходимое состояние.

```jsx
import React from 'react';
import { render } from 'react-dom';
import { mockZest, mockInstance, mockEndpoint, getInstances } from '@frozen-int/zest';

mockZest();

const publication = mockInstance(
    Todo,
    { title: 'Some test title' },
);

mockEndpoint(
    todoListQuery,
    ({ filter }) => getInstances(Todo).filter(todo => todo.title.includes(filter)),
);

render(<TodoList filter="test" />, document.body);
```
