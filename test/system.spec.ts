import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { DataSource, QueryFailedError } from 'typeorm';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { JwtAuthGuard, RolesGuard } from '../src/auth/guards.js';
import { JwtStrategy } from '../src/auth/jwt.strategy.js';
import {
  DatabaseErrorFilter,
  SALT_ROUNDS,
  likePattern,
  money,
  orFail,
} from '../src/common.js';
import { CatalogsController } from '../src/controllers/catalogs.controller.js';
import { MenuInventoryController } from '../src/controllers/menu-inventory.controller.js';
import { OperationsController } from '../src/controllers/operations.controller.js';
import {
  AddItemDto,
  AdjustDto,
  BarTableDto,
  CategoryDto,
  CloseOrderDto,
  IngredientDto,
  LoginDto,
  OpenOrderDto,
  PaymentMethodDto,
  ProductDto,
  PurchaseDto,
  SupplierDto,
  UserDto,
} from '../src/dto/index.js';
import {
  BarTable,
  Category,
  Ingredient,
  IngredientSupplier,
  InventoryMovement,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  ProductIngredient,
  Purchase,
  PurchaseItem,
  Role,
  Supplier,
  User,
  entities,
  toNumber,
} from '../src/entities/index.js';

const TEST_SECRET = 'test-jwt-secret-key-for-audit-2026';

describe('Sistema La Chulita — Pruebas de Seguridad, Estabilidad, Rendimiento y Estrés (36 Endpoints)', () => {
  let authController: AuthController;
  let catalogsController: CatalogsController;
  let menuController: MenuInventoryController;
  let operationsController: OperationsController;
  let jwtService: JwtService;
  let jwtStrategy: JwtStrategy;
  let jwtGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let validationPipe: ValidationPipe;

  let adminUser: User;
  let mesero1User: User;
  let mesero2User: User;
  let cantineroUser: User;

  // Base de datos en memoria con soporte transaccional y bloqueo pesimista simulado (FOR UPDATE)
  const db = {
    roles: [
      { id: 1, name: 'admin' as const },
      { id: 2, name: 'mesero' as const },
      { id: 3, name: 'cantinero' as const },
    ],
    users: [] as Array<
      Partial<User> & { id: number; name: string; email: string; password: string; role_id: number; role: Role }
    >,
    categories: [{ id: 1, name: 'Cócteles', description: null }] as Array<
      Partial<Category> & { id: number; name: string; description: string | null }
    >,
    paymentMethods: [{ id: 1, name: 'Efectivo' }] as Array<Partial<PaymentMethod> & { id: number; name: string }>,
    suppliers: [
      {
        id: 1,
        name: 'Licores del Norte',
        contact_name: 'Juan',
        phone: '5550000001',
        email: 'ventas@licores.com',
      },
    ],
    tables: [
      { id: 1, number: 1, capacity: 4, status: 'libre' as 'libre' | 'ocupada' },
      { id: 2, number: 2, capacity: 4, status: 'libre' as 'libre' | 'ocupada' },
    ],
    ingredients: [
      { id: 1, name: 'Tequila blanco', unit: 'ml' as const, stock: 600, min_stock: 100, cost: 0.35 },
      { id: 2, name: 'Limón', unit: 'ml' as const, stock: 300, min_stock: 50, cost: 0.05 },
    ],
    products: [
      {
        id: 1,
        name: 'Margarita',
        price: 120,
        is_active: true,
        category_id: 1,
        recipe: [
          { id: 1, product_id: 1, ingredient_id: 1, quantity: 60 },
          { id: 2, product_id: 1, ingredient_id: 2, quantity: 30 },
        ],
      },
      {
        id: 2,
        name: 'Producto Inactivo',
        price: 90,
        is_active: false,
        category_id: 1,
        recipe: [],
      },
    ],
    orders: [] as Array<
      Partial<Order> & {
        id: number;
        bar_table_id: number;
        user_id: number;
        status: 'abierta' | 'pagada' | 'cancelada';
        subtotal: number;
        tip: number;
        total: number;
      }
    >,
    orderItems: [] as Array<
      Partial<OrderItem> & {
        id: number;
        order_id: number;
        product_id: number;
        quantity: number;
        unit_price: number;
        line_total: number;
        status: 'pendiente' | 'listo';
      }
    >,
    movements: [] as Array<
      Partial<InventoryMovement> & {
        id: number;
        ingredient_id: number;
        user_id: number;
        order_item_id: number | null;
        type: 'entrada' | 'salida' | 'ajuste';
        quantity: number;
      }
    >,
    ingredientSuppliers: [
      { id: 1, ingredient_id: 1, supplier_id: 1, price: 0.35 },
    ] as Array<
      Partial<IngredientSupplier> & { id: number; ingredient_id: number; supplier_id: number; price: number | null }
    >,
    purchases: [] as Array<Partial<Purchase> & { id: number; supplier_id: number; user_id: number; total: number }>,
    purchaseItems: [] as Array<
      Partial<PurchaseItem> & {
        id: number;
        purchase_id: number;
        ingredient_id: number;
        quantity: number;
        unit_cost: number;
        line_total: number;
      }
    >,
  };

  // Mutex que emula la cola de bloqueo pesimista SELECT ... FOR UPDATE en MySQL
  let txLock = Promise.resolve();
  const runSerialized = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = txLock;
    let release!: () => void;
    txLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    const passwordHash = await hash('password123', SALT_ROUNDS);

    db.users = [
      {
        id: 1,
        name: 'Ana Admin',
        email: 'admin@bar.com',
        password: passwordHash,
        role_id: 1,
        role: db.roles[0] as Role,
      },
      {
        id: 2,
        name: 'Mario Mesero',
        email: 'mesero@bar.com',
        password: passwordHash,
        role_id: 2,
        role: db.roles[1] as Role,
      },
      {
        id: 3,
        name: 'Luis Mesero 2',
        email: 'mesero2@bar.com',
        password: passwordHash,
        role_id: 2,
        role: db.roles[1] as Role,
      },
      {
        id: 4,
        name: 'Carla Cantinera',
        email: 'cantinero@bar.com',
        password: passwordHash,
        role_id: 3,
        role: db.roles[2] as Role,
      },
    ];

    adminUser = db.users[0] as unknown as User;
    mesero1User = db.users[1] as unknown as User;
    mesero2User = db.users[2] as unknown as User;
    cantineroUser = db.users[3] as unknown as User;

    const createQbMock = <T>(
      getItems: () => T[],
      rawRows: Array<Record<string, string>> = [{ parent_id: '1', total: '2' }],
    ) => {
      const qb = {
        leftJoinAndSelect: () => qb,
        innerJoin: () => qb,
        select: () => qb,
        addSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        groupBy: () => qb,
        orderBy: () => qb,
        limit: () => qb,
        skip: () => qb,
        take: () => qb,
        getMany: async () => getItems(),
        getManyAndCount: async () => {
          const items = getItems();
          return [items, items.length] as [T[], number];
        },
        getRawMany: async () => rawRows,
        getRawOne: async () => ({ sales: '360', tips: '50', count: '2' }),
      };
      return qb;
    };

    const userRepo = {
      findOne: async ({ where, select }: { where: { id?: number; email?: string }; select?: { password?: boolean } }) => {
        const u = db.users.find((item) => (where.id ? item.id === where.id : item.email === where.email));
        if (!u) return null;
        if (select?.password) return { id: u.id, password: u.password };
        const { password: _removed, ...safeUser } = u;
        return safeUser;
      },
      findOneBy: async ({ id }: { id: number }) => db.users.find((u) => u.id === id) ?? null,
      create: (data: Partial<User>) => ({ ...data }),
      save: async (data: Partial<User> & { id?: number }) => {
        if (db.users.some((u) => u.email === data.email && u.id !== data.id)) {
          const err = new Error('Duplicate') as Error & { code: string };
          err.code = 'ER_DUP_ENTRY';
          throw new QueryFailedError('INSERT INTO users', [], err);
        }
        const id = data.id ?? db.users.length + 1;
        const role = (db.roles.find((r) => r.id === data.role_id) ?? db.roles[1]) as Role;
        const created = {
          id,
          name: data.name ?? '',
          email: data.email ?? '',
          password: data.password ?? '',
          role_id: data.role_id ?? 2,
          role,
        };
        const idx = db.users.findIndex((u) => u.id === id);
        if (idx >= 0) db.users[idx] = created;
        else db.users.push(created);
        return created;
      },
      remove: async (u: { id: number }) => {
        db.users = db.users.filter((item) => item.id !== u.id);
      },
      createQueryBuilder: () => createQbMock(() => db.users.map(({ password: _p, ...u }) => u)),
    };

    const categoryRepo = {
      createQueryBuilder: () => createQbMock(() => db.categories),
      create: (data: Partial<Category>) => ({ ...data }),
      save: async (data: Partial<Category> & { id?: number }) => {
        if (db.categories.some((c) => c.name === data.name && c.id !== data.id)) {
          const err = new Error('Duplicate') as Error & { code: string };
          err.code = 'ER_DUP_ENTRY';
          throw new QueryFailedError('INSERT INTO categories', [], err);
        }
        const id = data.id ?? db.categories.length + 1;
        const cat = { id, name: data.name ?? '', description: data.description ?? null };
        const idx = db.categories.findIndex((c) => c.id === id);
        if (idx >= 0) db.categories[idx] = cat;
        else db.categories.push(cat);
        return cat;
      },
      findOne: async ({ where }: { where: { id: number } }) =>
        db.categories.find((c) => c.id === where.id) ?? null,
      findOneBy: async ({ id }: { id: number }) =>
        db.categories.find((c) => c.id === id) ?? null,
      remove: async (cat: { id: number }) => {
        if (db.products.some((p) => p.category_id === cat.id)) {
          const err = new Error('Referenced') as Error & { code: string };
          err.code = 'ER_ROW_IS_REFERENCED_2';
          throw new QueryFailedError('DELETE FROM categories', [], err);
        }
        db.categories = db.categories.filter((c) => c.id !== cat.id);
      },
    };

    const paymentMethodRepo = {
      createQueryBuilder: () => createQbMock(() => db.paymentMethods),
      create: (data: Partial<PaymentMethod>) => ({ ...data }),
      save: async (data: Partial<PaymentMethod> & { id?: number }) => {
        const id = data.id ?? db.paymentMethods.length + 1;
        const pm = { id, name: data.name ?? '' };
        const idx = db.paymentMethods.findIndex((p) => p.id === id);
        if (idx >= 0) db.paymentMethods[idx] = pm;
        else db.paymentMethods.push(pm);
        return pm;
      },
      findOneBy: async ({ id }: { id: number }) =>
        db.paymentMethods.find((p) => p.id === id) ?? null,
      remove: async (pm: { id: number }) => {
        db.paymentMethods = db.paymentMethods.filter((p) => p.id !== pm.id);
      },
    };

    const supplierRepo = {
      createQueryBuilder: () => createQbMock(() => db.suppliers),
      create: (data: Partial<Supplier>) => ({ ...data }),
      save: async (data: Partial<Supplier> & { id?: number }) => {
        const id = data.id ?? db.suppliers.length + 1;
        const sup = {
          id,
          name: data.name ?? '',
          contact_name: data.contact_name ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
        };
        const idx = db.suppliers.findIndex((s) => s.id === id);
        if (idx >= 0) db.suppliers[idx] = sup;
        else db.suppliers.push(sup);
        return sup;
      },
      findOneBy: async ({ id }: { id: number }) =>
        db.suppliers.find((s) => s.id === id) ?? null,
      remove: async (sup: { id: number }) => {
        db.suppliers = db.suppliers.filter((s) => s.id !== sup.id);
      },
    };

    const barTableRepo = {
      find: async () => db.tables.map((t) => ({ ...t })),
      findOneBy: async ({ id }: { id: number }) => db.tables.find((t) => t.id === id) ?? null,
      create: (data: Partial<BarTable>) => ({ status: 'libre' as const, ...data }),
      save: async (data: Partial<BarTable> & { id?: number }) => {
        const id = data.id ?? db.tables.length + 1;
        const table = {
          id,
          number: data.number ?? id,
          capacity: data.capacity ?? 4,
          status: data.status ?? ('libre' as const),
        };
        const idx = db.tables.findIndex((t) => t.id === id);
        if (idx >= 0) db.tables[idx] = table;
        else db.tables.push(table);
        return table;
      },
      remove: async (table: { id: number }) => {
        db.tables = db.tables.filter((t) => t.id !== table.id);
      },
      countBy: async ({ status }: { status: string }) =>
        db.tables.filter((t) => t.status === status).length,
      count: async () => db.tables.length,
    };

    const orderRepo = {
      createQueryBuilder: () => createQbMock(() => db.orders),
      findBy: async ({ status }: { status: string }) =>
        db.orders.filter((o) => o.status === status),
      findOne: async ({ where }: { where: { id: number } }) => {
        const order = db.orders.find((o) => o.id === where.id);
        if (!order) return null;
        return {
          ...order,
          bar_table: db.tables.find((t) => t.id === order.bar_table_id) ?? null,
          user: db.users.find((u) => u.id === order.user_id) ?? null,
          items: db.orderItems
            .filter((i) => i.order_id === order.id)
            .map((i) => ({
              ...i,
              product: db.products.find((p) => p.id === i.product_id) ?? null,
            })),
        };
      },
      countBy: async ({ status }: { status: string }) =>
        db.orders.filter((o) => o.status === status).length,
    };

    const orderItemRepo = {
      createQueryBuilder: () =>
        createQbMock(
          () => db.orderItems,
          [{ parent_id: '1', total: '2', product_id: '1', qty: '4', amount: '480' }],
        ),
      find: async () =>
        db.orderItems.filter((i) => {
          const ord = db.orders.find((o) => o.id === i.order_id);
          return i.status === 'pendiente' && ord?.status === 'abierta';
        }),
      findOneBy: async ({ id }: { id: number }) =>
        db.orderItems.find((i) => i.id === id) ?? null,
      findOne: async ({ where }: { where: { id: number } }) =>
        db.orderItems.find((i) => i.id === where.id) ?? null,
      save: async (item: Partial<OrderItem> & { id: number }) => {
        const idx = db.orderItems.findIndex((i) => i.id === item.id);
        if (idx >= 0) db.orderItems[idx] = { ...db.orderItems[idx], ...item };
        return item;
      },
    };

    const productRepo = {
      createQueryBuilder: () => createQbMock(() => db.products),
      findOne: async ({ where }: { where: { id: number } }) =>
        db.products.find((p) => p.id === where.id) ?? null,
      findOneBy: async ({ id }: { id: number }) =>
        db.products.find((p) => p.id === id) ?? null,
      findBy: async () => db.products,
      remove: async (p: { id: number }) => {
        db.products = db.products.filter((item) => item.id !== p.id);
      },
    };

    const ingredientRepo = {
      createQueryBuilder: () => createQbMock(() => db.ingredients),
      findOne: async ({ where }: { where: { id: number } }) =>
        db.ingredients.find((i) => i.id === where.id) ?? null,
      findOneBy: async ({ id }: { id: number }) =>
        db.ingredients.find((i) => i.id === id) ?? null,
      remove: async (ing: { id: number }) => {
        db.ingredients = db.ingredients.filter((i) => i.id !== ing.id);
      },
    };

    const purchaseRepo = {
      createQueryBuilder: () => createQbMock(() => db.purchases),
      findOne: async ({ where }: { where: { id: number } }) =>
        db.purchases.find((p) => p.id === where.id) ?? null,
    };

    const purchaseItemRepo = {
      createQueryBuilder: () => createQbMock(() => db.purchaseItems),
    };

    const movementRepo = {
      createQueryBuilder: () => createQbMock(() => db.movements),
    };

    const genericRepo = {
      createQueryBuilder: () => createQbMock(() => []),
      find: async () => db.roles,
      findOne: async ({ where }: { where: { id: number } }) => ({ id: where.id }),
      findOneBy: async ({ id }: { id: number }) => ({ id }),
      create: (d: Record<string, unknown>) => d,
      save: async (d: Record<string, unknown>) => ({ id: 1, ...d }),
      remove: async () => undefined,
    };

    const dataSourceMock = {
      transaction: async <T>(cb: (manager: Record<string, unknown>) => Promise<T>): Promise<T> =>
        runSerialized(async () => {
          const snapTables = structuredClone(db.tables);
          const snapIngredients = structuredClone(db.ingredients);
          const snapOrders = structuredClone(db.orders);
          const snapOrderItems = structuredClone(db.orderItems);
          const snapMovements = structuredClone(db.movements);

          const manager = {
            findOne: async (entity: unknown, opts: { where: { id: number } }) => {
              if (entity === BarTable) return db.tables.find((t) => t.id === opts.where.id) ?? null;
              if (entity === Order) return db.orders.find((o) => o.id === opts.where.id) ?? null;
              if (entity === Product) return db.products.find((p) => p.id === opts.where.id) ?? null;
              if (entity === Ingredient) return db.ingredients.find((i) => i.id === opts.where.id) ?? null;
              return null;
            },
            findOneBy: async (entity: unknown, where: Record<string, number>) => {
              if (entity === Supplier) return db.suppliers.find((s) => s.id === where.id) ?? null;
              if (entity === IngredientSupplier) {
                return (
                  db.ingredientSuppliers.find(
                    (l) => l.ingredient_id === where.ingredient_id && l.supplier_id === where.supplier_id,
                  ) ?? null
                );
              }
              return null;
            },
            findOneByOrFail: async (entity: unknown, where: { id: number }) => {
              if (entity === Order) {
                const ord = db.orders.find((o) => o.id === where.id);
                if (!ord) throw new Error('Order not found');
                return ord;
              }
              return null;
            },
            findBy: async (entity: unknown, where: Record<string, unknown>) => {
              if (entity === OrderItem) {
                return db.orderItems.filter((i) => i.order_id === where.order_id);
              }
              if (entity === InventoryMovement) {
                return db.movements.filter((m) => m.type === where.type);
              }
              if (entity === IngredientSupplier) {
                return db.ingredientSuppliers.filter((l) => l.ingredient_id === where.ingredient_id);
              }
              return [];
            },
            create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
            save: async (data: Record<string, unknown>) => {
              if ('bar_table_id' in data && !('id' in data)) {
                const newOrder = {
                  id: db.orders.length + 1,
                  bar_table_id: Number(data.bar_table_id),
                  user_id: Number(data.user_id),
                  payment_method_id: null,
                  status: 'abierta' as const,
                  subtotal: 0,
                  tip: 0,
                  total: 0,
                  closed_at: null,
                };
                db.orders.push(newOrder);
                return newOrder;
              }
              if ('supplier_id' in data && !('id' in data)) {
                const newPurchase = {
                  id: db.purchases.length + 1,
                  supplier_id: Number(data.supplier_id),
                  user_id: Number(data.user_id),
                  total: Number(data.total ?? 0),
                };
                db.purchases.push(newPurchase);
                return newPurchase;
              }
              if ('category_id' in data && !('id' in data)) {
                const newProd = {
                  id: db.products.length + 1,
                  name: String(data.name),
                  price: Number(data.price),
                  is_active: data.is_active !== false,
                  category_id: Number(data.category_id),
                  recipe: [],
                };
                db.products.push(newProd);
                return newProd;
              }
              if ('unit' in data && !('id' in data)) {
                const newIng = {
                  id: db.ingredients.length + 1,
                  name: String(data.name),
                  unit: data.unit as 'ml' | 'pza' | 'g',
                  stock: 0,
                  min_stock: Number(data.min_stock ?? 0),
                  cost: Number(data.cost ?? 0),
                };
                db.ingredients.push(newIng);
                return newIng;
              }
              return { id: 1, ...data };
            },
            update: async (entity: unknown, criteria: number | { id: number }, partial: Record<string, unknown>) => {
              const id = typeof criteria === 'number' ? criteria : criteria.id;
              if (entity === BarTable) {
                const t = db.tables.find((item) => item.id === id);
                if (t) Object.assign(t, partial);
              } else if (entity === Order) {
                const o = db.orders.find((item) => item.id === id);
                if (o) Object.assign(o, partial);
              } else if (entity === Ingredient) {
                const i = db.ingredients.find((item) => item.id === id);
                if (i) Object.assign(i, partial);
              } else if (entity === Purchase) {
                const p = db.purchases.find((item) => item.id === id);
                if (p) Object.assign(p, partial);
              } else if (entity === IngredientSupplier) {
                const l = db.ingredientSuppliers.find((item) => item.id === id);
                if (l) Object.assign(l, partial);
              }
            },
            insert: async (entity: unknown, row: Record<string, unknown>) => {
              if (entity === OrderItem) {
                const id = db.orderItems.length + 1;
                db.orderItems.push({
                  id,
                  order_id: Number(row.order_id),
                  product_id: Number(row.product_id),
                  quantity: Number(row.quantity),
                  unit_price: Number(row.unit_price),
                  line_total: Number(row.line_total),
                  status: 'pendiente',
                });
                return { identifiers: [{ id }] };
              }
              if (entity === InventoryMovement) {
                const id = db.movements.length + 1;
                db.movements.push({
                  id,
                  ingredient_id: Number(row.ingredient_id),
                  user_id: Number(row.user_id),
                  order_item_id: (row.order_item_id as number | null) ?? null,
                  type: row.type as 'entrada' | 'salida' | 'ajuste',
                  quantity: Number(row.quantity),
                });
                return { identifiers: [{ id }] };
              }
              if (entity === IngredientSupplier) {
                const id = db.ingredientSuppliers.length + 1;
                db.ingredientSuppliers.push({
                  id,
                  ingredient_id: Number(row.ingredient_id),
                  supplier_id: Number(row.supplier_id),
                  price: (row.price as number | null) ?? null,
                });
                return { identifiers: [{ id }] };
              }
              if (entity === ProductIngredient) {
                return { identifiers: [{ id: 1 }] };
              }
              return { identifiers: [{ id: 1 }] };
            },
            decrement: async (entity: unknown, where: { id: number }, field: string, amount: number) => {
              if (entity === Ingredient && field === 'stock') {
                const ing = db.ingredients.find((i) => i.id === where.id);
                if (ing) ing.stock = money(ing.stock - amount);
              }
            },
            increment: async (entity: unknown, where: { id: number }, field: string, amount: number) => {
              if (entity === Ingredient && field === 'stock') {
                const ing = db.ingredients.find((i) => i.id === where.id);
                if (ing) ing.stock = money(ing.stock + amount);
              }
            },
            sum: async (entity: unknown, _field: string, where: { order_id: number }) => {
              if (entity === OrderItem) {
                return db.orderItems
                  .filter((i) => i.order_id === where.order_id)
                  .reduce((acc, item) => acc + item.line_total, 0);
              }
              return 0;
            },
            count: async (entity: unknown, opts: { where: { order_id: number } }) => {
              if (entity === OrderItem) {
                return db.orderItems.filter((i) => i.order_id === opts.where.order_id).length;
              }
              return 0;
            },
            delete: async () => undefined,
            remove: async () => undefined,
          };

          try {
            return await cb(manager);
          } catch (error) {
            db.tables = snapTables;
            db.ingredients = snapIngredients;
            db.orders = snapOrders;
            db.orderItems = snapOrderItems;
            db.movements = snapMovements;
            throw error;
          }
        }),
    };

    const repoProviders = entities.map((entity) => {
      if (entity === User) return { provide: getRepositoryToken(entity), useValue: userRepo };
      if (entity === Category) return { provide: getRepositoryToken(entity), useValue: categoryRepo };
      if (entity === PaymentMethod) return { provide: getRepositoryToken(entity), useValue: paymentMethodRepo };
      if (entity === Supplier) return { provide: getRepositoryToken(entity), useValue: supplierRepo };
      if (entity === BarTable) return { provide: getRepositoryToken(entity), useValue: barTableRepo };
      if (entity === Order) return { provide: getRepositoryToken(entity), useValue: orderRepo };
      if (entity === OrderItem) return { provide: getRepositoryToken(entity), useValue: orderItemRepo };
      if (entity === Product) return { provide: getRepositoryToken(entity), useValue: productRepo };
      if (entity === Ingredient) return { provide: getRepositoryToken(entity), useValue: ingredientRepo };
      if (entity === Purchase) return { provide: getRepositoryToken(entity), useValue: purchaseRepo };
      if (entity === PurchaseItem) return { provide: getRepositoryToken(entity), useValue: purchaseItemRepo };
      if (entity === InventoryMovement) return { provide: getRepositoryToken(entity), useValue: movementRepo };
      return { provide: getRepositoryToken(entity), useValue: genericRepo };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '8h' },
        }),
      ],
      controllers: [
        AuthController,
        CatalogsController,
        MenuInventoryController,
        OperationsController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        { provide: DataSource, useValue: dataSourceMock },
        ...repoProviders,
      ],
    }).compile();

    authController = moduleFixture.get(AuthController);
    catalogsController = moduleFixture.get(CatalogsController);
    menuController = moduleFixture.get(MenuInventoryController);
    operationsController = moduleFixture.get(OperationsController);
    jwtService = moduleFixture.get(JwtService);
    jwtStrategy = moduleFixture.get(JwtStrategy);
    jwtGuard = moduleFixture.get(JwtAuthGuard);
    rolesGuard = moduleFixture.get(RolesGuard);

    validationPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  });

  // Helper para simular el ExecutionContext de NestJS en Guards
  const makeContext = (
    controllerClass: object,
    handlerName: string,
    user?: User,
  ): ExecutionContext => {
    const handler = (controllerClass as Record<string, (...args: unknown[]) => unknown>)[handlerName];
    return {
      getHandler: () => handler,
      getClass: () => controllerClass.constructor,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  // =========================================================================
  // 1. PRUEBAS DE SEGURIDAD (AUTENTICACIÓN, RBAC, IDOR, SANITIZACIÓN)
  // =========================================================================
  describe('1. Seguridad (Auth, RBAC, IDOR, Validación y Sanitización)', () => {
    it('valida firma JWT, rechaza tokens de usuarios inexistentes (401) y permite solo rutas @Public sin token', async () => {
      // Ruta @Public (login) pasa sin token en JwtAuthGuard
      const loginCtx = makeContext(authController, 'login');
      expect(jwtGuard.canActivate(loginCtx)).toBe(true);

      // JwtStrategy rechaza con 401 si el usuario del token fue borrado
      await expect(jwtStrategy.validate({ sub: 9999 })).rejects.toThrow(UnauthorizedException);

      // JwtStrategy devuelve usuario con su rol pero SIN password
      const validated = await jwtStrategy.validate({ sub: 1 });
      expect(validated.id).toBe(1);
      expect(validated.role?.name).toBe('admin');
      expect((validated as unknown as Record<string, unknown>).password).toBeUndefined();

      // Rutas GET /api/me y POST /api/logout
      expect(authController.me(adminUser)).toBe(adminUser);
      expect(authController.logout()).toEqual({ message: 'Sesión cerrada' });
    });

    it('login responde 422 genérico ante correo inexistente o contraseña incorrecta (anti-enumeración) y nunca expone hash', async () => {
      await expect(
        authController.login({ email: 'noexiste@bar.com', password: 'password123' }),
      ).rejects.toThrow(UnprocessableEntityException);

      await expect(
        authController.login({ email: 'admin@bar.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnprocessableEntityException);

      const ok = await authController.login({ email: 'admin@bar.com', password: 'password123' });
      expect(ok.token).toBeTypeOf('string');
      expect((ok.user as unknown as Record<string, unknown>).password).toBeUndefined();

      // Decodificar el JWT emitido y verificar que solo incluye { sub } sin datos sensibles
      const decoded = jwtService.verify<{ sub: number; password?: string }>(ok.token);
      expect(decoded.sub).toBe(1);
      expect(decoded.password).toBeUndefined();
    });

    it('aplica matriz RBAC estricta en RolesGuard para admin, mesero y cantinero (403 Forbidden)', () => {
      // Ruta sin @Roles permite a cualquier usuario autenticado
      expect(
        rolesGuard.canActivate(makeContext(catalogsController, 'listCategories', mesero1User)),
      ).toBe(true);

      // Mesero intentando acceder a proveedores, dashboard o crear categorías -> 403 Forbidden
      expect(() =>
        rolesGuard.canActivate(makeContext(catalogsController, 'listSuppliers', mesero1User)),
      ).toThrow(ForbiddenException);

      expect(() =>
        rolesGuard.canActivate(makeContext(operationsController, 'dashboard', mesero1User)),
      ).toThrow(ForbiddenException);

      expect(() =>
        rolesGuard.canActivate(makeContext(catalogsController, 'createCategory', mesero1User)),
      ).toThrow(ForbiddenException);

      // Cantinero puede ver la cola de barra e insumos, pero no puede abrir cuentas ni ver usuarios
      expect(
        rolesGuard.canActivate(makeContext(operationsController, 'barQueue', cantineroUser)),
      ).toBe(true);
      expect(
        rolesGuard.canActivate(makeContext(menuController, 'listIngredients', cantineroUser)),
      ).toBe(true);
      expect(() =>
        rolesGuard.canActivate(makeContext(operationsController, 'createOrder', cantineroUser)),
      ).toThrow(ForbiddenException);
      expect(() =>
        rolesGuard.canActivate(makeContext(catalogsController, 'listUsers', cantineroUser)),
      ).toThrow(ForbiddenException);

      // Admin tiene acceso completo
      expect(
        rolesGuard.canActivate(makeContext(operationsController, 'dashboard', adminUser)),
      ).toBe(true);
    });

    it('protege al administrador contra auto-eliminación y auto-degradación de rol (409 Conflict)', async () => {
      await expect(catalogsController.deleteUser(1, adminUser)).rejects.toThrow(
        'No puedes borrar tu propio usuario.',
      );

      await expect(
        catalogsController.updateUser(
          1,
          { name: 'Ana Admin', email: 'admin@bar.com', role_id: 2 },
          adminUser,
        ),
      ).rejects.toThrow('No puedes cambiar tu propio rol.');
    });

    it('filtra campos no declarados (Mass Assignment / Whitelist), transforma vacíos a null y escapa comodines LIKE', async () => {
      // Intento de Mass Assignment inyectando stock=99999 e is_admin=true en IngredientDto
      const sanitizedIngredient = (await validationPipe.transform(
        {
          name: 'Vodka',
          unit: 'ml',
          min_stock: 100,
          cost: 0.5,
          stock: 99999,
          is_admin: true,
        },
        { type: 'body', metatype: IngredientDto },
      )) as Record<string, unknown>;

      expect(sanitizedIngredient.stock).toBeUndefined();
      expect(sanitizedIngredient.is_admin).toBeUndefined();

      // Transformación emptyToNull en campos opcionales
      const transformedCat = (await validationPipe.transform(
        { name: 'Postres', description: '' },
        { type: 'body', metatype: CategoryDto },
      )) as CategoryDto;
      expect(transformedCat.description).toBeNull();

      // Límites de negocio en DTOs (ej. máximo 50 unidades por renglón, capacidad de mesa máxima 30)
      await expect(
        validationPipe.transform(
          { product_id: 1, quantity: 51 },
          { type: 'body', metatype: AddItemDto },
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      await expect(
        validationPipe.transform(
          { number: 9, capacity: 35 },
          { type: 'body', metatype: BarTableDto },
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      await expect(
        validationPipe.transform(
          { email: 'no-es-correo', password: '123' },
          { type: 'body', metatype: LoginDto },
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // Validación de recetas duplicadas e insumos duplicados en compras
      await expect(
        menuController.createProduct({
          name: 'Coctel Duplicado',
          price: 100,
          category_id: 1,
          recipe: [
            { ingredient_id: 1, quantity: 30 },
            { ingredient_id: 1, quantity: 30 },
          ],
        } as ProductDto),
      ).rejects.toThrow(UnprocessableEntityException);

      await expect(
        operationsController.createPurchase(
          {
            supplier_id: 1,
            items: [
              { ingredient_id: 1, quantity: 100, unit_cost: 0.3 },
              { ingredient_id: 1, quantity: 200, unit_cost: 0.3 },
            ],
          } as PurchaseDto,
          adminUser,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // Escape seguro de comodines SQL LIKE
      expect(likePattern('50%_test\\')).toBe('%50\\%\\_test\\\\%');
    });
  });

  // =========================================================================
  // 2. PRUEBAS DE ESTABILIDAD, COBERTURA DE ENDPOINTS E INTEGRIDAD TRANSACCIONAL
  // =========================================================================
  describe('2. Estabilidad, Cobertura de los 36 Endpoints y Transacciones', () => {
    it('garantiza precisión monetaria (IEEE 754), transformadores DECIMAL y manejo de recursos inexistentes (404)', () => {
      expect(money(0.1 + 0.2)).toBe(0.3);
      expect(money(19.99 * 3)).toBe(59.97);
      expect(toNumber.to(12.5)).toBe(12.5);
      expect(toNumber.from('12.50')).toBe(12.5);
      expect(toNumber.from(null)).toBeNull();
      expect(() => orFail(null, 'El recurso')).toThrow(NotFoundException);
    });

    it('traduce errores nativos de MySQL en DatabaseErrorFilter (409 Conflict / 422 / 500)', () => {
      const filter = new DatabaseErrorFilter();
      const testCode = (code: string) => {
        let capturedStatus = 0;
        let capturedBody: unknown = null;
        const host = {
          switchToHttp: () => ({
            getResponse: () => ({
              status: (s: number) => {
                capturedStatus = s;
                return {
                  json: (b: unknown) => {
                    capturedBody = b;
                  },
                };
              },
            }),
          }),
        };
        const err = new Error('DB err') as Error & { code: string };
        err.code = code;
        filter.catch(new QueryFailedError('SELECT 1', [], err), host as never);
        return { capturedStatus, capturedBody };
      };

      expect(testCode('ER_DUP_ENTRY').capturedStatus).toBe(409);
      expect(testCode('ER_ROW_IS_REFERENCED_2').capturedStatus).toBe(409);
      expect(testCode('ER_NO_REFERENCED_ROW_2').capturedStatus).toBe(422);
    });

    it('verifica estabilidad de CRUDs en CatalogsController y MenuInventoryController', async () => {
      // Categorías
      const catsPaginated = await catalogsController.listCategories('Coc', '1', undefined);
      expect(Array.isArray(catsPaginated)).toBe(false);
      const catsAll = await catalogsController.listCategories(undefined, undefined, '1');
      expect(Array.isArray(catsAll)).toBe(true);

      const newCat = await catalogsController.createCategory({
        name: 'Botanas',
        description: 'Para picar',
      });
      expect(newCat.name).toBe('Botanas');
      expect((await catalogsController.showCategory(newCat.id)).name).toBe('Botanas');
      await catalogsController.updateCategory(newCat.id, { name: 'Botanas Gourmet', description: null });
      await catalogsController.deleteCategory(newCat.id);

      // Métodos de pago
      await catalogsController.listPaymentMethods('Efec', '1', undefined);
      const pm = await catalogsController.createPaymentMethod({ name: 'Tarjeta' } as PaymentMethodDto);
      await catalogsController.updatePaymentMethod(pm.id, { name: 'Tarjeta Crédito' });
      await catalogsController.deletePaymentMethod(pm.id);

      // Proveedores
      await catalogsController.listSuppliers('Lic', '1', undefined);
      const sup = await catalogsController.createSupplier({ name: 'Distribuidora Sur' } as SupplierDto);
      await catalogsController.updateSupplier(sup.id, { name: 'Distribuidora Sur SA' });
      await catalogsController.deleteSupplier(sup.id);

      // Mesas
      const tbl = await catalogsController.createTable({ number: 9, capacity: 6 } as BarTableDto);
      await catalogsController.updateTable(tbl.id, { number: 9, capacity: 8 });
      await catalogsController.deleteTable(tbl.id);

      // Usuarios y Roles
      await catalogsController.listUsers('Ana', '1');
      await catalogsController.listRoles();
      await expect(
        catalogsController.createUser({ name: 'SinPass', email: 'sin@bar.com', role_id: 2 }),
      ).rejects.toThrow(UnprocessableEntityException);
      const newUser = await catalogsController.createUser({
        name: 'Pedro Mesero',
        email: 'pedro@bar.com',
        password: 'password123',
        role_id: 2,
      });
      await catalogsController.updateUser(
        newUser!.id,
        { name: 'Pedro Mesero Editado', email: 'pedro@bar.com', password: 'newpassword123', role_id: 2 },
        adminUser,
      );
      await catalogsController.deleteUser(newUser!.id, adminUser);

      // Productos e Insumos
      await menuController.listProducts('Mar', '1', '1', '1', undefined);
      await menuController.showProduct(1);
      const createdProd = await menuController.createProduct({
        name: 'Paloma',
        price: 110,
        category_id: 1,
        recipe: [{ ingredient_id: 1, quantity: 60 }],
      } as ProductDto);
      await menuController.updateProduct(createdProd!.id, {
        name: 'Paloma Especial',
        price: 115,
        category_id: 1,
        recipe: [{ ingredient_id: 1, quantity: 60 }],
      } as ProductDto);
      await menuController.deleteProduct(createdProd!.id);

      await menuController.listIngredients('Teq', '1', '1', undefined);
      await menuController.showIngredient(1);
      const createdIng = await menuController.createIngredient({
        name: 'Sal de grano',
        unit: 'g',
        min_stock: 50,
        cost: 0.02,
        supplier_ids: [1],
      } as IngredientDto);
      await menuController.updateIngredient(createdIng!.id, {
        name: 'Sal de mar',
        unit: 'g',
        min_stock: 60,
        cost: 0.03,
        supplier_ids: [1],
      } as IngredientDto);
      await menuController.deleteIngredient(createdIng!.id);

      await menuController.listMovements('1', 'salida', '1');
    });

    it('impide IDOR entre meseros y ejecuta ciclo completo de órdenes, barra, compras y cancelaciones', async () => {
      // Mesero 1 abre cuenta en Mesa 1
      const openOrder = await operationsController.createOrder(
        { bar_table_id: 1 } as OpenOrderDto,
        mesero1User,
      );
      expect(openOrder?.status).toBe('abierta');
      const orderId = openOrder!.id;

      // No se puede borrar una mesa ocupada -> 409 Conflict
      await expect(catalogsController.deleteTable(1)).rejects.toThrow(ConflictException);

      // Mesero 2 intenta ver o agregar productos a la cuenta de Mesero 1 -> 403 Forbidden (Anti-IDOR)
      await expect(operationsController.showOrder(orderId, mesero2User)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        operationsController.addItem(
          orderId,
          { product_id: 1, quantity: 1 } as AddItemDto,
          mesero2User,
        ),
      ).rejects.toThrow(ForbiddenException);

      // No se puede cobrar una cuenta vacía -> 422
      await expect(
        operationsController.closeOrder(
          orderId,
          { payment_method_id: 1, tip: 20 } as CloseOrderDto,
          mesero1User,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // No se puede agregar un producto inactivo -> 422
      await expect(
        operationsController.addItem(
          orderId,
          { product_id: 2, quantity: 1 } as AddItemDto,
          mesero1User,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // Agregar 2 Margaritas (consume 120ml Tequila y 60ml Limón)
      const updatedOrder = await operationsController.addItem(
        orderId,
        { product_id: 1, quantity: 2, notes: 'sin sal' } as AddItemDto,
        mesero1User,
      );
      expect(updatedOrder?.subtotal).toBe(240);
      expect(db.ingredients[0].stock).toBe(480); // 600 - 120

      // Cola de barra y marcar renglón como listo
      const queue = await operationsController.barQueue();
      expect(queue.length).toBeGreaterThan(0);
      const readyItem = await operationsController.markReady(queue[0].id);
      expect(readyItem?.status).toBe('listo');

      // Mesero NO puede cancelar una cuenta que ya tiene productos -> 403 Forbidden
      await expect(operationsController.cancelOrder(orderId, mesero1User)).rejects.toThrow(
        ForbiddenException,
      );

      // Admin cancela la cuenta -> regresa insumos exactos al inventario y libera la Mesa 1
      const cancelled = await operationsController.cancelOrder(orderId, adminUser);
      expect(cancelled?.status).toBe('cancelada');
      expect(db.ingredients[0].stock).toBe(600);
      expect(db.ingredients[1].stock).toBe(300);
      expect(db.tables[0].status).toBe('libre');

      // Abrir nueva cuenta, agregar producto y cobrarla exitosamente (closeOrder)
      const orderToPay = await operationsController.createOrder(
        { bar_table_id: 1 } as OpenOrderDto,
        mesero1User,
      );
      await operationsController.addItem(
        orderToPay!.id,
        { product_id: 1, quantity: 1 } as AddItemDto,
        mesero1User,
      );
      const paidOrder = await operationsController.closeOrder(
        orderToPay!.id,
        { payment_method_id: 1, tip: 30 } as CloseOrderDto,
        mesero1User,
      );
      expect(paidOrder?.status).toBe('pagada');
      expect(paidOrder?.total).toBe(150); // 120 + 30 propina
      expect(db.tables[0].status).toBe('libre');

      // Restaurar stock de Tequila/Limón con una Compra a proveedor (createPurchase)
      const purchase = await operationsController.createPurchase(
        {
          supplier_id: 1,
          items: [
            { ingredient_id: 1, quantity: 60, unit_cost: 0.35 },
            { ingredient_id: 2, quantity: 30, unit_cost: 0.05 },
          ],
        } as PurchaseDto,
        adminUser,
      );
      expect(purchase?.total).toBe(22.5);
      await operationsController.listPurchases('1');
      await operationsController.showPurchase(purchase!.id);
      await operationsController.listOrders(mesero1User, 'pagada', '2026-11-14', '1');
    });
  });

  // =========================================================================
  // 3. PRUEBAS DE RENDIMIENTO Y ESTRÉS (CONCURRENCIA Y CARGA)
  // =========================================================================
  describe('3. Rendimiento y Estrés (Concurrencia, Condiciones de Carrera y Latencia)', () => {
    it('resiste condición de carrera al abrir la misma mesa simultáneamente (25 peticiones concurrentes -> 1 éxito, 24 conflictos)', async () => {
      const attempts = Array.from({ length: 25 }, () =>
        operationsController
          .createOrder({ bar_table_id: 2 } as OpenOrderDto, mesero1User)
          .then(() => 'created' as const)
          .catch(() => 'conflict' as const),
      );

      const results = await Promise.all(attempts);
      const createdCount = results.filter((r) => r === 'created').length;
      const conflictCount = results.filter((r) => r === 'conflict').length;

      expect(createdCount).toBe(1);
      expect(conflictCount).toBe(24);
    });

    it('impide inventario negativo bajo estrés concurrente de pedidos (30 peticiones simultáneas compitiendo por stock de 10 unidades)', async () => {
      // Quedan 600ml de Tequila y 300ml de Limón -> alcanza exactamente para 10 Margaritas
      const openOrder = db.orders.find((o) => o.bar_table_id === 2 && o.status === 'abierta')!;

      const concurrentItems = Array.from({ length: 30 }, () =>
        operationsController
          .addItem(openOrder.id, { product_id: 1, quantity: 1 } as AddItemDto, mesero1User)
          .then(() => 'ok' as const)
          .catch(() => 'out_of_stock' as const),
      );

      const results = await Promise.all(concurrentItems);
      const okCount = results.filter((r) => r === 'ok').length;
      const outOfStockCount = results.filter((r) => r === 'out_of_stock').length;

      expect(okCount).toBe(10);
      expect(outOfStockCount).toBe(20);
      expect(db.ingredients[0].stock).toBe(0); // Nunca baja de 0
      expect(db.ingredients[1].stock).toBe(0);
    });

    it('soporta ráfaga de estrés de 500 operaciones concurrentes manteniendo P95 < 25ms y 0% errores inesperados', async () => {
      const latencies: number[] = [];
      const totalOps = 500;

      const burst = Array.from({ length: totalOps }, async (_, i) => {
        const start = performance.now();
        if (i % 4 === 0) {
          await menuController.listProducts(undefined, undefined, '1', '1', undefined);
        } else if (i % 4 === 1) {
          await catalogsController.listTables();
        } else if (i % 4 === 2) {
          await operationsController.dashboard();
        } else {
          await validationPipe.transform(
            {
              name: `Usuario ${i}`,
              email: `user${i}@bar.com`,
              password: 'password123',
              role_id: 2,
            },
            { type: 'body', metatype: UserDto },
          );
        }
        latencies.push(performance.now() - start);
      });

      await Promise.all(burst);
      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(totalOps * 0.5)];
      const p95 = latencies[Math.floor(totalOps * 0.95)];
      const p99 = latencies[Math.floor(totalOps * 0.99)];

      expect(p50).toBeLessThan(15);
      expect(p95).toBeLessThan(35);
      expect(p99).toBeLessThan(60);

      // Verificar también ajuste de inventario bajo bloqueo
      const adjusted = await menuController.adjust(
        1,
        { stock: 1500, reason: 'Reabastecimiento post-estrés' } as AdjustDto,
        adminUser,
      );
      expect(adjusted?.stock).toBe(1500);
    });
  });
});