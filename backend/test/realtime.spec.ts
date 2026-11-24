import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, type FindOperator } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { OperationsController } from '../src/controllers/operations.controller.js';
import {
  BarTable,
  Ingredient,
  InventoryMovement,
  Order,
  OrderItem,
  Product,
  User,
  entities,
} from '../src/entities/index.js';
import { RealtimeController } from '../src/realtime/realtime.controller.js';
import { MAX_EVENTS, POLL_TIMEOUT_MS, RealtimeService } from '../src/realtime/realtime.service.js';
import type { PollResponse, RealtimeEvent, RealtimeUser } from '../src/realtime/realtime.types.js';

const admin: RealtimeUser = { id: 1, role: 'admin' };
const mesero: RealtimeUser = { id: 2, role: 'mesero' };
const cantinero: RealtimeUser = { id: 4, role: 'cantinero' };
const sinRol: RealtimeUser = { id: 7, role: null };

/** Deja que corran los microtasks y callbacks pendientes (con timers reales). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Permite revisar si una promesa ya se resolvió sin esperarla. */
const track = <T>(promise: Promise<T>) => {
  const state: { done: boolean; value?: T } = { done: false };
  void promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
};

const syncTopics = (events: RealtimeEvent[]) =>
  events.map((event) => (event.type === 'sync' ? event.data.topics : event.type));

describe('RealtimeService (long polling)', () => {
  let service: RealtimeService;
  let cursor: string;
  let stream: string;

  const now = (user: RealtimeUser) => service.poll(user, cursor, { timeoutMs: 0 });

  beforeEach(async () => {
    service = new RealtimeService();
    ({ cursor } = await service.poll(admin));
    [stream] = cursor.split(':');
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('la primera petición responde al instante con reset y el cursor actual', async () => {
    expect(cursor).toMatch(/^[a-z0-9]+:0$/);
    expect(await service.poll(mesero)).toEqual({ cursor, reset: true, events: [] });
    expect(await now(mesero)).toEqual({ cursor, reset: false, events: [] });
  });

  it('pide reset con cursores de otro arranque, del futuro, mal formados o de otro tipo', async () => {
    service.sync(['tables'], { action: 'table.updated', id: 1, table_id: 1 });
    const otherBoot = (await new RealtimeService().poll(admin)).cursor;

    for (const bad of [otherBoot, `${stream}:2`, `${stream}:-1`, `${stream}:`, 'basura', '', 42, ['x']]) {
      expect(await service.poll(admin, bad, { timeoutMs: 0 })).toEqual({
        cursor: `${stream}:1`,
        reset: true,
        events: [],
      });
    }
  });

  it(`guarda como máximo ${MAX_EVENTS} eventos; quien se quedó más atrás recibe reset`, async () => {
    for (let id = 1; id <= MAX_EVENTS + 1; id++) service.sync(['tables'], { action: 'table.updated', id });

    expect(await now(admin)).toMatchObject({ cursor: `${stream}:${MAX_EVENTS + 1}`, reset: true, events: [] });

    const oldestKept = await service.poll(admin, `${stream}:1`, { timeoutMs: 0 });
    expect(oldestKept.reset).toBe(false);
    expect(oldestKept.events).toHaveLength(MAX_EVENTS);
    expect(oldestKept.events[0]).toMatchObject({ type: 'sync', data: { id: 2 } });
  });

  it('entrega a cada rol solo los temas que puede leer; sin rol no recibe sync', async () => {
    service.sync(['orders', 'bar-queue', 'movements'], { action: 'order.item_added', order_id: 7, actor_id: 2 });

    expect(syncTopics((await now(admin)).events)).toEqual([['orders', 'bar-queue', 'movements']]);
    expect(syncTopics((await now(mesero)).events)).toEqual([['orders']]);
    expect(syncTopics((await now(cantinero)).events)).toEqual([['bar-queue']]);
    expect((await now(sinRol)).events).toEqual([]);

    const [event] = (await now(mesero)).events;
    expect(event.data).toMatchObject({ action: 'order.item_added', order_id: 7, actor_id: 2 });
    expect((event.data as { at: string }).at).toBeTypeOf('string');
  });

  it('quita temas repetidos y no guarda eventos sin temas ni destinatarios', async () => {
    service.sync([], { action: 'nada' });
    service.notify({}, { kind: 'info', title: 'Nadie', message: 'Sin destino' });
    service.notify({ roles: [], userIds: [] }, { kind: 'info', title: 'Nadie', message: 'Sin destino' });
    expect((await now(admin)).cursor).toBe(cursor);

    service.sync(['users', 'movements', 'users'], { action: 'user.created', id: 3 });
    expect(syncTopics((await now(admin)).events)).toEqual([['users', 'movements']]);
    expect((await now(mesero)).events).toEqual([]);
  });

  it('notify respeta roles, usuarios y la exclusión del autor', async () => {
    service.notify(
      { roles: ['cantinero'], userIds: [2], exceptUserId: 4 },
      { kind: 'info', title: 'Nuevo pedido · Mesa 3', message: '1 × Margarita', topic: 'bar-queue', order_id: 9 },
    );
    service.notify({ userIds: [2] }, { kind: 'success', title: 'Listo para servir · Mesa 3', message: '1 × Margarita' });

    const titles = async (user: RealtimeUser) =>
      (await now(user)).events.map((event) => (event.type === 'notify' ? event.data.title : event.type));

    expect(await titles(mesero)).toEqual(['Nuevo pedido · Mesa 3', 'Listo para servir · Mesa 3']);
    expect(await titles({ id: 5, role: 'cantinero' })).toEqual(['Nuevo pedido · Mesa 3']);
    expect(await titles(cantinero)).toEqual([]);
    expect(await titles(admin)).toEqual([]);

    expect((await now(mesero)).events[0]).toEqual({
      type: 'notify',
      data: {
        kind: 'info',
        title: 'Nuevo pedido · Mesa 3',
        message: '1 × Margarita',
        topic: 'bar-queue',
        order_id: 9,
        at: expect.any(String),
      },
    });
  });

  it('avisa insumos por agotarse a admin y cantinero sin decimales fantasma', async () => {
    service.notifyLowStock([{ ingredient: { name: 'Limón', unit: 'ml', min_stock: 50 }, stock: 0.1 + 0.2 }]);

    for (const user of [admin, cantinero]) {
      expect((await now(user)).events).toEqual([
        {
          type: 'notify',
          data: {
            kind: 'warning',
            title: 'Insumo por agotarse',
            message: 'Limón: quedan 0.3 ml (mínimo 50)',
            topic: 'ingredients',
            at: expect.any(String),
          },
        },
      ]);
    }
    expect((await now(mesero)).events).toEqual([]);
  });

  it('sin eventos la petición espera y responde en cuanto llega algo visible, junto con lo del mismo tick', async () => {
    const forMesero = track(service.poll(mesero, cursor));
    const forCantinero = track(service.poll(cantinero, cursor));
    await flush();
    expect(forMesero.done).toBe(false);

    service.sync(['movements'], { action: 'ingredient.adjusted', id: 1 });
    await flush();
    expect(forMesero.done).toBe(false);
    expect(forCantinero.done).toBe(false);

    service.sync(['orders'], { action: 'order.opened', order_id: 1 });
    service.notify({ userIds: [2] }, { kind: 'info', title: 'Hola', message: 'Mesa 1' });
    await flush();

    expect(forMesero.value).toEqual({
      cursor: `${stream}:3`,
      reset: false,
      events: [
        { type: 'sync', data: expect.objectContaining({ topics: ['orders'], action: 'order.opened' }) },
        { type: 'notify', data: expect.objectContaining({ title: 'Hola' }) },
      ],
    });
    expect(forCantinero.done).toBe(false);

    service.onModuleDestroy();
    await flush();
    expect(forCantinero.value).toEqual({ cursor: `${stream}:3`, reset: false, events: [] });
  });

  it(`si no pasa nada responde vacía a los ${POLL_TIMEOUT_MS / 1000} s con el cursor al día`, async () => {
    vi.useFakeTimers();
    const pending = track(service.poll(mesero, cursor));
    service.sync(['users'], { action: 'user.created', id: 9 });

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - 1);
    expect(pending.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(pending.value).toEqual({ cursor: `${stream}:1`, reset: false, events: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si el cliente se va (abort) suelta la espera y no deja temporizadores', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = service.poll(admin, cursor, { signal: controller.signal });
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();
    await expect(pending).resolves.toEqual({ cursor, reset: false, events: [] });
    expect(vi.getTimerCount()).toBe(0);

    await expect(service.poll(admin, cursor, { signal: AbortSignal.abort() })).resolves.toEqual({
      cursor,
      reset: false,
      events: [],
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('userUpdated avisa la sesión solo a ese usuario y su espera ya filtra con el rol nuevo', async () => {
    const forUser = service.poll(mesero, cursor);
    const forAdmin = service.poll(admin, cursor);

    service.userUpdated(2, 'cantinero');
    service.sync(['bar-queue'], { action: 'order.item_added', order_id: 1 });

    expect(await forUser).toEqual({
      cursor: `${stream}:2`,
      reset: false,
      events: [
        { type: 'session', data: { action: 'updated' } },
        { type: 'sync', data: expect.objectContaining({ topics: ['bar-queue'] }) },
      ],
    });
    expect(syncTopics((await forAdmin).events)).toEqual([['bar-queue']]);
  });

  it('userDeleted avisa la sesión solo a ese usuario', async () => {
    service.userDeleted(2);
    expect((await now(mesero)).events).toEqual([{ type: 'session', data: { action: 'deleted' } }]);
    expect((await now(admin)).events).toEqual([]);
  });

  it('publicar sin nadie escuchando (seed o pruebas) no falla', () => {
    const detached = new RealtimeService();
    expect(() => {
      detached.sync(['orders'], { action: 'order.opened', order_id: 1 });
      detached.notify({ roles: ['admin'] }, { kind: 'info', title: 'Prueba', message: 'Sin clientes' });
      detached.notifyLowStock([{ ingredient: { name: 'Limón', unit: 'ml', min_stock: 50 }, stock: 10 }]);
      detached.userUpdated(1, 'admin');
      detached.userDeleted(1);
    }).not.toThrow();
  });
});

describe('RealtimeController (GET /realtime/poll por HTTP)', () => {
  const meseroUser = { id: 2, name: 'Mario Mesero', role: { id: 2, name: 'mesero' } } as unknown as User;
  const sinRolUser = { id: 7, name: 'Sin Rol', role: null } as unknown as User;

  let app: INestApplication;
  let realtime: RealtimeService;
  let baseUrl: string;
  let current: User = meseroUser;

  const request = (cursor?: string, init?: RequestInit) =>
    fetch(`${baseUrl}/realtime/poll${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, init);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RealtimeController],
      providers: [RealtimeService],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    // En la app real lo pone el JwtAuthGuard global; aquí se simula la sesión.
    app.use((req: { user?: User }, _res: unknown, next: () => void) => {
      req.user = current;
      next();
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    realtime = app.get(RealtimeService);
  });

  afterEach(() => {
    current = meseroUser;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requiere sesión (no es @Public) y no se limita por rol', () => {
    const handler = Object.getOwnPropertyDescriptor(RealtimeController.prototype, 'poll')?.value as object;
    expect(handler).toBeTypeOf('function');
    for (const target of [RealtimeController, handler]) {
      expect(Reflect.getMetadata('isPublic', target)).toBeUndefined();
      expect(Reflect.getMetadata('roles', target)).toBeUndefined();
    }
  });

  it('sin cursor responde reset; con cursor espera hasta que llega un evento de su rol', async () => {
    const first = await request();
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const { cursor, reset } = (await first.json()) as PollResponse;
    expect(reset).toBe(true);

    const poll = vi.spyOn(realtime, 'poll');
    const pending = request(cursor);
    await vi.waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
    expect(poll).toHaveBeenCalledWith({ id: 2, role: 'mesero' }, cursor, { signal: expect.any(AbortSignal) });

    realtime.sync(['dashboard'], { action: 'product.updated', id: 1 });
    realtime.sync(['orders'], { action: 'order.opened', order_id: 1 });

    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cursor: expect.stringMatching(/:2$/),
      reset: false,
      events: [{ type: 'sync', data: expect.objectContaining({ topics: ['orders'], action: 'order.opened' }) }],
    });
  });

  it('si el cliente corta la conexión el servidor suelta la espera', async () => {
    const { cursor } = (await (await request()).json()) as PollResponse;
    const poll = vi.spyOn(realtime, 'poll');
    const controller = new AbortController();

    const pending = request(cursor, { signal: controller.signal });
    await vi.waitFor(() => expect(poll).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toThrow();
    await expect(poll.mock.results[0].value).resolves.toEqual({ cursor, reset: false, events: [] });
  });

  it('un usuario sin rol hace polling con role null', async () => {
    current = sinRolUser;
    const poll = vi.spyOn(realtime, 'poll');
    expect((await request()).status).toBe(200);
    expect(poll).toHaveBeenCalledWith({ id: 7, role: null }, undefined, { signal: expect.any(AbortSignal) });
  });
});

describe('Emisiones en tiempo real de OperationsController', () => {
  interface OrderRow {
    id: number;
    bar_table_id: number;
    user_id: number;
    status: string;
    subtotal: number;
    tip: number;
    total: number;
  }
  interface ItemRow {
    id: number;
    order_id: number;
    product_id: number;
    quantity: number;
    line_total: number;
    status: string;
  }
  interface MovementRow {
    id: number;
    ingredient_id: number;
    order_item_id: number | null;
    type: string;
    quantity: number;
  }

  const admin = { id: 1, name: 'Ana Admin', role_id: 1, role: { id: 1, name: 'admin' } } as unknown as User;
  const mesero = { id: 2, name: 'Mario Mesero', role_id: 2, role: { id: 2, name: 'mesero' } } as unknown as User;
  const cantinero = { id: 4, name: 'Carla Cantinera', role_id: 3, role: { id: 3, name: 'cantinero' } } as unknown as User;

  const ORDER_ITEM_TOPICS = ['orders', 'tables', 'bar-queue', 'ingredients', 'movements', 'dashboard'];

  const db = {
    tables: [{ id: 3, number: 5, capacity: 4, status: 'libre' }],
    products: [
      { id: 1, name: 'Margarita', price: 120, is_active: true, recipe: [{ ingredient_id: 1, quantity: 60 }] },
    ],
    ingredients: [{ id: 1, name: 'Tequila blanco', unit: 'ml', stock: 220, min_stock: 100 }],
    orders: [] as OrderRow[],
    items: [] as ItemRow[],
    movements: [] as MovementRow[],
  };

  const byId = <T extends { id: number }>(rows: T[], id: number) => rows.find((row) => row.id === id) ?? null;

  const manager = {
    findOne: async (entity: unknown, { where }: { where: { id: number } }) => {
      if (entity === BarTable) return byId(db.tables, where.id);
      if (entity === Order) return byId(db.orders, where.id);
      if (entity === Product) return byId(db.products, where.id);
      if (entity === Ingredient) return byId(db.ingredients, where.id);
      return null;
    },
    findOneByOrFail: async (_entity: unknown, where: { id: number }) => byId(db.orders, where.id),
    findBy: async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === OrderItem) return db.items.filter((item) => item.order_id === where.order_id);
      if (entity === InventoryMovement) {
        const ids = (where.order_item_id as FindOperator<number[]>).value;
        return db.movements.filter(
          (movement) => movement.type === where.type && ids.includes(movement.order_item_id ?? 0),
        );
      }
      return [];
    },
    count: async (_entity: unknown, { where }: { where: { order_id: number } }) =>
      db.items.filter((item) => item.order_id === where.order_id).length,
    sum: async (_entity: unknown, _field: string, where: { order_id: number }) =>
      db.items
        .filter((item) => item.order_id === where.order_id)
        .reduce((total, item) => total + item.line_total, 0),
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    save: async (data: { bar_table_id: number; user_id: number }) => {
      const order = { id: db.orders.length + 1, ...data, status: 'abierta', subtotal: 0, tip: 0, total: 0 };
      db.orders.push(order);
      return order;
    },
    update: async (entity: unknown, id: number, partial: Record<string, unknown>) => {
      const rows: Array<{ id: number }> =
        entity === BarTable ? db.tables : entity === Order ? db.orders : entity === Ingredient ? db.ingredients : [];
      const row = byId(rows, id);
      if (row) Object.assign(row, partial);
    },
    insert: async (entity: unknown, row: Record<string, unknown>) => {
      if (entity === OrderItem) {
        const id = db.items.length + 1;
        db.items.push({ id, status: 'pendiente', ...row } as ItemRow);
        return { identifiers: [{ id }] };
      }
      const id = db.movements.length + 1;
      db.movements.push({ id, order_item_id: null, ...row } as MovementRow);
      return { identifiers: [{ id }] };
    },
    decrement: async (_entity: unknown, where: { id: number }, _field: string, amount: number) => {
      const ingredient = byId(db.ingredients, where.id);
      if (ingredient) ingredient.stock -= amount;
    },
    increment: async (_entity: unknown, where: { id: number }, _field: string, amount: number) => {
      const ingredient = byId(db.ingredients, where.id);
      if (ingredient) ingredient.stock += amount;
    },
  };

  const orderRepository = {
    findOne: async ({ where }: { where: { id: number } }) => {
      const order = byId(db.orders, where.id);
      if (!order) return null;
      return {
        ...order,
        bar_table: byId(db.tables, order.bar_table_id),
        items: db.items
          .filter((item) => item.order_id === order.id)
          .map((item) => ({ ...item, product: byId(db.products, item.product_id) })),
      };
    },
  };

  const orderItemRepository = {
    findOneBy: async ({ id }: { id: number }) => byId(db.items, id),
    findOne: async ({ where }: { where: { id: number } }) => {
      const item = byId(db.items, where.id);
      return item ? { ...item, product: byId(db.products, item.product_id) } : null;
    },
    save: async (item: ItemRow) => item,
  };

  let controller: OperationsController;
  let realtime: RealtimeService;
  let sync: MockInstance<RealtimeService['sync']>;
  let notify: MockInstance<RealtimeService['notify']>;
  let orderId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        RealtimeService,
        {
          provide: DataSource,
          useValue: { transaction: async (work: (entityManager: unknown) => Promise<unknown>) => work(manager) },
        },
        ...entities.map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: entity === Order ? orderRepository : entity === OrderItem ? orderItemRepository : {},
        })),
      ],
    }).compile();

    controller = moduleRef.get(OperationsController);
    realtime = moduleRef.get(RealtimeService);
  });

  beforeEach(() => {
    sync = vi.spyOn(realtime, 'sync');
    notify = vi.spyOn(realtime, 'notify');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abrir cuenta emite order.opened una sola vez y nada si la mesa ya está ocupada', async () => {
    const order = await controller.createOrder({ bar_table_id: 3 }, mesero);
    orderId = order!.id;

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(['tables', 'orders', 'dashboard'], {
      action: 'order.opened',
      order_id: orderId,
      table_id: 3,
      owner_id: 2,
      actor_id: 2,
    });
    expect(notify).not.toHaveBeenCalled();

    sync.mockClear();
    await expect(controller.createOrder({ bar_table_id: 3 }, mesero)).rejects.toThrow(ConflictException);
    expect(sync).not.toHaveBeenCalled();
  });

  it('agregar producto avisa a barra (menos al autor) y una vez cuando el insumo cruza el mínimo', async () => {
    await controller.addItem(orderId, { product_id: 1, quantity: 2, notes: 'sin sal' }, mesero);

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(ORDER_ITEM_TOPICS, {
      action: 'order.item_added',
      id: 1,
      order_id: orderId,
      table_id: 3,
      owner_id: 2,
      actor_id: 2,
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      { roles: ['cantinero'], exceptUserId: 2 },
      {
        kind: 'info',
        title: 'Nuevo pedido · Mesa 5',
        message: '2 × Margarita — sin sal',
        topic: 'bar-queue',
        order_id: orderId,
      },
    );
    expect(notify).toHaveBeenCalledWith(
      { roles: ['admin', 'cantinero'] },
      {
        kind: 'warning',
        title: 'Insumo por agotarse',
        message: 'Tequila blanco: quedan 100 ml (mínimo 100)',
        topic: 'ingredients',
      },
    );

    sync.mockClear();
    notify.mockClear();
    await controller.addItem(orderId, { product_id: 1, quantity: 1 }, mesero);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      { roles: ['cantinero'], exceptUserId: 2 },
      expect.objectContaining({ title: 'Nuevo pedido · Mesa 5', message: '1 × Margarita' }),
    );
  });

  it('marcar listo avisa solo al mesero dueño de la cuenta y responde igual que antes', async () => {
    const ready = await controller.markReady(1, cantinero);
    expect(ready?.status).toBe('listo');
    expect(ready?.product.name).toBe('Margarita');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(['orders', 'bar-queue'], {
      action: 'order_item.ready',
      id: 1,
      order_id: orderId,
      table_id: 3,
      owner_id: 2,
      actor_id: 4,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      { userIds: [2], exceptUserId: 4 },
      {
        kind: 'success',
        title: 'Listo para servir · Mesa 5',
        message: '2 × Margarita',
        topic: 'orders',
        order_id: orderId,
      },
    );
  });

  it('cancelar la cuenta de otro con pedidos pendientes avisa al dueño y a barra', async () => {
    await controller.cancelOrder(orderId, admin);

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(ORDER_ITEM_TOPICS, {
      action: 'order.cancelled',
      order_id: orderId,
      table_id: 3,
      owner_id: 2,
      actor_id: 1,
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      { userIds: [2] },
      {
        kind: 'warning',
        title: `Cuenta #${orderId} cancelada`,
        message: 'Mesa 5',
        topic: 'orders',
        order_id: orderId,
      },
    );
    expect(notify).toHaveBeenCalledWith(
      { roles: ['cantinero'], exceptUserId: 1 },
      {
        kind: 'warning',
        title: 'Cuenta cancelada · Mesa 5',
        message: 'Ya no prepares sus pedidos pendientes.',
        topic: 'bar-queue',
        order_id: orderId,
      },
    );
  });

  it('cobrar la cuenta de otro mesero le avisa con el total en pesos; la propia no', async () => {
    const order = await controller.createOrder({ bar_table_id: 3 }, mesero);
    await controller.addItem(order!.id, { product_id: 1, quantity: 1 }, mesero);
    sync.mockClear();
    notify.mockClear();

    await controller.closeOrder(order!.id, { payment_method_id: 1, tip: 30 }, admin);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(['orders', 'tables', 'bar-queue', 'dashboard'], {
      action: 'order.closed',
      order_id: order!.id,
      table_id: 3,
      owner_id: 2,
      actor_id: 1,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      { userIds: [2] },
      {
        kind: 'info',
        title: `Cuenta #${order!.id} cobrada`,
        message: 'Mesa 5 · Total $150.00',
        topic: 'orders',
        order_id: order!.id,
      },
    );

    const own = await controller.createOrder({ bar_table_id: 3 }, mesero);
    await controller.addItem(own!.id, { product_id: 1, quantity: 1 }, mesero);
    notify.mockClear();
    await controller.closeOrder(own!.id, { payment_method_id: 1 }, mesero);
    expect(notify).not.toHaveBeenCalled();
  });
});
