import { ConflictException, Logger } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, type FindOperator } from 'typeorm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';
import type {
  NotifyEvent,
  RealtimeServer,
  RealtimeSocket,
  SocketData,
  SyncEvent,
} from '../src/realtime/realtime.types.js';

type Middleware = (socket: RealtimeSocket, next: (err?: Error) => void) => void;

interface ServerCall {
  op: 'emit' | 'socketsJoin' | 'socketsLeave' | 'disconnectSockets';
  rooms: string[];
  except: string[];
  args: unknown[];
}

const createFakeServer = () => {
  const calls: ServerCall[] = [];
  const operator = (rooms: string[], except: string[] = []) => {
    const record = (op: ServerCall['op']) => (...args: unknown[]) => {
      calls.push({ op, rooms, except, args });
      return true;
    };
    return {
      to: (room: string | string[]) => operator([...rooms, ...[room].flat()], except),
      except: (room: string | string[]) => operator(rooms, [...except, ...[room].flat()]),
      emit: record('emit'),
      socketsJoin: record('socketsJoin'),
      socketsLeave: record('socketsLeave'),
      disconnectSockets: record('disconnectSockets'),
    };
  };
  const server = {
    use: vi.fn<(fn: Middleware) => void>(),
    to: (room: string | string[]) => operator([room].flat()),
    in: (room: string | string[]) => operator([room].flat()),
  };
  return { server, io: server as unknown as RealtimeServer, calls };
};

const emitted = (calls: ServerCall[], event: string) =>
  calls.filter((call) => call.op === 'emit' && call.args[0] === event);

describe('RealtimeService', () => {
  let service: RealtimeService;
  let fake: ReturnType<typeof createFakeServer>;

  beforeEach(() => {
    service = new RealtimeService();
    fake = createFakeServer();
    service.attach(fake.io);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('manda a cada sala de rol solo los temas que ese rol puede leer', () => {
    service.sync(['orders', 'bar-queue', 'movements'], { action: 'order.item_added', order_id: 7, actor_id: 2 });

    const sent = emitted(fake.calls, 'sync');
    expect(sent).toHaveLength(3);
    expect(Object.fromEntries(sent.map((call) => [call.rooms.join(), (call.args[1] as SyncEvent).topics]))).toEqual({
      'role:admin': ['orders', 'bar-queue', 'movements'],
      'role:mesero': ['orders'],
      'role:cantinero': ['bar-queue'],
    });
    for (const call of sent) {
      expect(call.except).toEqual([]);
      expect(call.args[1]).toMatchObject({ action: 'order.item_added', order_id: 7, actor_id: 2 });
      expect((call.args[1] as SyncEvent).at).toBeTypeOf('string');
    }
  });

  it('quita temas repetidos y no manda nada a quien no puede leer ninguno', () => {
    service.sync(['users', 'movements', 'users'], { action: 'user.created', id: 3 });

    const sent = emitted(fake.calls, 'sync');
    expect(sent).toHaveLength(1);
    expect(sent[0].rooms).toEqual(['role:admin']);
    expect((sent[0].args[1] as SyncEvent).topics).toEqual(['users', 'movements']);

    fake.calls.length = 0;
    service.sync([], { action: 'nada' });
    expect(fake.calls).toEqual([]);
  });

  it('no hace nada si todavía no hay servidor (pruebas o seed)', () => {
    const detached = new RealtimeService();
    expect(() => {
      detached.sync(['orders'], { action: 'order.opened', order_id: 1 });
      detached.notify({ roles: ['admin'] }, { kind: 'info', title: 'Prueba', message: 'Sin servidor' });
      detached.notifyLowStock([{ ingredient: { name: 'Limón', unit: 'ml', min_stock: 50 }, stock: 10 }]);
      detached.userUpdated(1, 'admin');
      detached.userDeleted(1);
    }).not.toThrow();
  });

  it('nunca lanza el error a la petición aunque Socket.IO falle', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const broken = {
      to: () => {
        throw new Error('socket roto');
      },
      in: () => {
        throw new Error('socket roto');
      },
    };
    service.attach(broken as unknown as RealtimeServer);

    expect(() => {
      service.sync(['orders'], { action: 'order.opened', order_id: 1 });
      service.notify({ userIds: [2] }, { kind: 'info', title: 'Prueba', message: 'Falla' });
      service.userUpdated(2, 'mesero');
      service.userDeleted(2);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('notify respeta roles, usuarios y la exclusión del autor', () => {
    service.notify(
      { roles: ['cantinero'], userIds: [2], exceptUserId: 4 },
      { kind: 'info', title: 'Nuevo pedido · Mesa 3', message: '1 × Margarita', topic: 'bar-queue', order_id: 9 },
    );
    service.notify({ userIds: [2] }, { kind: 'success', title: 'Listo para servir · Mesa 3', message: '1 × Margarita' });
    service.notify({}, { kind: 'info', title: 'Nadie', message: 'Sin destino' });

    const sent = emitted(fake.calls, 'notify');
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ rooms: ['role:cantinero', 'user:2'], except: ['user:4'] });
    expect(sent[0].args[1]).toMatchObject({ kind: 'info', title: 'Nuevo pedido · Mesa 3', topic: 'bar-queue', order_id: 9 });
    expect((sent[0].args[1] as NotifyEvent).at).toBeTypeOf('string');
    expect(sent[1]).toMatchObject({ rooms: ['user:2'], except: [] });
  });

  it('avisa insumos por agotarse a admin y cantinero sin decimales fantasma', () => {
    service.notifyLowStock([{ ingredient: { name: 'Limón', unit: 'ml', min_stock: 50 }, stock: 0.1 + 0.2 }]);

    const sent = emitted(fake.calls, 'notify');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ rooms: ['role:admin', 'role:cantinero'], except: [] });
    expect(sent[0].args[1]).toMatchObject({
      kind: 'warning',
      title: 'Insumo por agotarse',
      message: 'Limón: quedan 0.3 ml (mínimo 50)',
      topic: 'ingredients',
    });
  });

  it('userUpdated saca los sockets de todos los roles, los mete al nuevo y avisa la sesión', () => {
    service.userUpdated(5, 'cantinero');
    expect(fake.calls).toEqual([
      { op: 'socketsLeave', rooms: ['user:5'], except: [], args: [['role:admin', 'role:mesero', 'role:cantinero']] },
      { op: 'socketsJoin', rooms: ['user:5'], except: [], args: ['role:cantinero'] },
      { op: 'emit', rooms: ['user:5'], except: [], args: ['session', { action: 'updated' }] },
    ]);

    fake.calls.length = 0;
    service.userUpdated(5, null);
    expect(fake.calls.map((call) => call.op)).toEqual(['socketsLeave', 'emit']);
  });

  it('userDeleted avisa la sesión y después desconecta los sockets del usuario', () => {
    service.userDeleted(5);
    expect(fake.calls).toEqual([
      { op: 'emit', rooms: ['user:5'], except: [], args: ['session', { action: 'deleted' }] },
      { op: 'disconnectSockets', rooms: ['user:5'], except: [], args: [true] },
    ]);
  });
});

describe('RealtimeGateway', () => {
  const SECRET = 'realtime-test-secret-2026';
  const users = [
    { id: 1, name: 'Ana Admin', role: { id: 1, name: 'admin' } },
    { id: 2, name: 'Mario Mesero', role: { id: 2, name: 'mesero' } },
    { id: 7, name: 'Sin Rol', role: null },
  ];

  let gateway: RealtimeGateway;
  let realtime: RealtimeService;
  let jwtService: JwtService;
  let fake: ReturnType<typeof createFakeServer>;
  let middleware: Middleware;
  let socketCount = 0;

  const createSocket = (
    auth: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    query: Record<string, string> = {},
  ) => {
    const socket = {
      id: `socket-${++socketCount}`,
      handshake: { auth, headers, query },
      data: {} as Partial<SocketData>,
      join: vi.fn<(rooms: string | string[]) => void>(),
      disconnect: vi.fn<(close?: boolean) => void>(),
    };
    return { socket, io: socket as unknown as RealtimeSocket };
  };

  const authenticate = (socket: RealtimeSocket) =>
    new Promise<Error | undefined>((resolve) => middleware(socket, resolve));

  const joinedRooms = (join: MockInstance<(rooms: string | string[]) => void>) =>
    join.mock.calls.flatMap(([rooms]) => [rooms].flat());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '8h' } })],
      providers: [
        RealtimeGateway,
        RealtimeService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: async ({ where }: { where: { id: number } }) =>
              users.find((user) => user.id === where.id) ?? null,
          },
        },
      ],
    }).compile();

    gateway = moduleRef.get(RealtimeGateway);
    realtime = moduleRef.get(RealtimeService);
    jwtService = moduleRef.get(JwtService);
  });

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    fake = createFakeServer();
    gateway.afterInit(fake.io);
    middleware = fake.server.use.mock.calls[0][0];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('al iniciar conecta RealtimeService con el servidor de Socket.IO', () => {
    realtime.sync(['tables'], { action: 'table.updated', id: 1, table_id: 1 });
    expect(new Set(emitted(fake.calls, 'sync').map((call) => call.rooms.join()))).toEqual(
      new Set(['role:admin', 'role:mesero', 'role:cantinero']),
    );
  });

  it('acepta el JWT por auth.token o por Authorization: Bearer y guarda al usuario en el socket', async () => {
    const token = await jwtService.signAsync({ sub: 1 });

    const fromAuth = createSocket({ token });
    await expect(authenticate(fromAuth.io)).resolves.toBeUndefined();
    expect(fromAuth.socket.data.user).toEqual({ id: 1, name: 'Ana Admin', role: 'admin' });
    expect(fromAuth.socket.data.exp).toBeTypeOf('number');

    const fromHeader = createSocket({}, { authorization: `Bearer ${token}` });
    await expect(authenticate(fromHeader.io)).resolves.toBeUndefined();
    expect(fromHeader.socket.data.user).toEqual({ id: 1, name: 'Ana Admin', role: 'admin' });
  });

  it('rechaza sin token, con token inválido, vencido, en query string o de un usuario que ya no existe', async () => {
    const otherSecret = new JwtService({ secret: 'otra-frase-secreta' });
    const rejected = [
      createSocket(),
      createSocket({ token: 'esto-no-es-un-jwt' }),
      createSocket({ token: await otherSecret.signAsync({ sub: 1 }) }),
      createSocket({ token: await jwtService.signAsync({ sub: 1 }, { expiresIn: -10 }) }),
      createSocket({}, {}, { token: await jwtService.signAsync({ sub: 1 }) }),
      createSocket({ token: await jwtService.signAsync({ sub: 999 }) }),
    ];

    for (const { socket, io } of rejected) {
      const error = await authenticate(io);
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('unauthorized');
      expect(socket.data.user).toBeUndefined();
    }
  });

  it('al conectar mete el socket a user:<id> y role:<rol>', async () => {
    const mesero = createSocket({ token: await jwtService.signAsync({ sub: 2 }) });
    await authenticate(mesero.io);
    gateway.handleConnection(mesero.io);
    expect(joinedRooms(mesero.socket.join)).toEqual(['user:2', 'role:mesero']);

    const withoutRole = createSocket({ token: await jwtService.signAsync({ sub: 7 }) });
    await authenticate(withoutRole.io);
    gateway.handleConnection(withoutRole.io);
    expect(joinedRooms(withoutRole.socket.join)).toEqual(['user:7']);

    gateway.handleDisconnect(mesero.io);
    gateway.handleDisconnect(withoutRole.io);
  });

  it('desconecta el socket cuando vence el JWT y cancela el temporizador si se va antes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const exp = Math.floor(Date.now() / 1000) + 60;

    const expiring = createSocket();
    expiring.socket.data = { user: { id: 2, name: 'Mario Mesero', role: 'mesero' }, exp };
    gateway.handleConnection(expiring.io);
    vi.advanceTimersByTime(59_999);
    expect(expiring.socket.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expiring.socket.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(expiring.io);

    const leaving = createSocket();
    leaving.socket.data = { user: { id: 1, name: 'Ana Admin', role: 'admin' }, exp };
    gateway.handleConnection(leaving.io);
    gateway.handleDisconnect(leaving.io);
    vi.advanceTimersByTime(120_000);
    expect(leaving.socket.disconnect).not.toHaveBeenCalled();

    const alreadyExpired = createSocket();
    alreadyExpired.socket.data = { user: { id: 1, name: 'Ana Admin', role: 'admin' }, exp: exp - 3600 };
    gateway.handleConnection(alreadyExpired.io);
    vi.advanceTimersByTime(1);
    expect(alreadyExpired.socket.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(alreadyExpired.io);
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
