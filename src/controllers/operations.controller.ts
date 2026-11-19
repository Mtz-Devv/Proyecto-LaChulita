import {
    Body,
    ConflictException,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CurrentUser, Roles } from '../auth/guards.js';
import { FOR_UPDATE, countChildren, money, orFail, paginate } from '../common.js';
import {
    AddItemDto,
    CloseOrderDto,
    OpenOrderDto,
    PurchaseDto,
} from '../dto/index.js';
import {
    BarTable,
    Ingredient,
    IngredientSupplier,
    InventoryMovement,
    Order,
    OrderItem,
    Product,
    Purchase,
    PurchaseItem,
    Supplier,
    User,
} from '../entities/index.js';

/*
La operacion del bar: cuentas, barra, compras y el reporte del dia. Esto es lo que hace que el proyecto no sea un CRUD cualquiera chiavito,
agregar una margarita toca 4 tablas a la vez y si algo falla no se guarda nada (para eso son las transacciones)
*/
@Controller()
export class OperationsController {
    constructor(
        //El DataSource se usa para las transacciones
        private readonly dataSource: DataSource,
        @InjectRepository(Order)
        private readonly orderRepository: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemRepository: Repository<OrderItem>,
        @InjectRepository(Purchase)
        private readonly purchaseRepository: Repository<Purchase>,
        @InjectRepository(PurchaseItem)
        private readonly purchaseItemRepository: Repository<PurchaseItem>,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectRepository(Ingredient)
        private readonly ingredientRepository: Repository<Ingredient>,
        @InjectRepository(BarTable)
        private readonly barTableRepository: Repository<BarTable>,
    ) { }

    //Cuentas (admin y mesero)

    //GET /api/orders?status=abierta&date=2026-11-10&page=1
    @Get('orders')
    @Roles('admin', 'mesero')
    async listOrders(
        @CurrentUser() user: User,
        @Query('status') status?: string,
        @Query('date') date?: string,
        @Query('page') page?: string,
    ) {
        const query = this.orderRepository
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.bar_table', 'bar_table')
            .leftJoinAndSelect('o.user', 'u')
            .leftJoinAndSelect('o.payment_method', 'payment_method')
            .orderBy('o.id', 'DESC'); //Lo mas nuevo primero

        //El mesero solo ve SUS cuentas, el admin ve todas, no andes de chismoso
        if (user.role?.name === 'mesero') {
            query.andWhere('o.user_id = :userId', { userId: user.id });
        }
        if (status) {
            query.andWhere('o.status = :status', { status });
        }
        if (date) {
            query.andWhere('DATE(o.created_at) = :date', { date });
        }

        //Primero se pagina y despues se cuentan los renglones SOLO de las cuentas de esta pagina
        const result = await paginate(query, page);
        const counts = await countChildren(this.orderItemRepository, 'order_id', result.data.map((order) => order.id));
        for (const order of result.data) order.items_count = counts.get(order.id) ?? 0;
        return result;
    }

    //POST /api/orders { "bar_table_id": 3 } → abre una cuenta en una mesa libre
    @Post('orders')
    @Roles('admin', 'mesero')
    async createOrder(@Body() body: OpenOrderDto, @CurrentUser() user: User) {
        const id = await this.dataSource.transaction(async (manager) => {
            //Se aparta la mesa para que dos meseros no abran cuenta en la misma al mismo tiempo
            const table = orFail(
                await manager.findOne(BarTable, { where: { id: body.bar_table_id }, lock: FOR_UPDATE }),
                'La mesa',
            );
            if (table.status === 'ocupada') {
                throw new ConflictException(`La mesa ${table.number} ya tiene una cuenta abierta.`);
            }

            await manager.update(BarTable, table.id, { status: 'ocupada' });
            const order = await manager.save(
                manager.create(Order, { bar_table_id: table.id, user_id: user.id }),
            );
            return order.id;
        });
        return this.findOrder(id);
    }

    //GET /api/orders/5 → la cuenta con sus productos
    @Get('orders/:id')
    @Roles('admin', 'mesero')
    async showOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
        const order = orFail(await this.findOrder(id), 'La cuenta');
        this.checkOwner(order, user);
        return order;
    }

    //POST /api/orders/5/items { "product_id": 3, "quantity": 2, "notes": "sin hielo" }
    @Post('orders/:id/items')
    @Roles('admin', 'mesero')
    @HttpCode(200)
    async addItem(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: AddItemDto,
        @CurrentUser() user: User,
    ) {
        await this.dataSource.transaction(async (manager) => {
            const order = orFail(
                await manager.findOne(Order, { where: { id }, lock: FOR_UPDATE }),
                'La cuenta',
            );
            this.checkOwner(order, user);
            if (order.status !== 'abierta') {
                throw new ConflictException('La cuenta ya está cerrada.');
            }

            const product = orFail(
                await manager.findOne(Product, {
                    where: { id: body.product_id },
                    relations: { recipe: true },
                }),
                'El producto',
            );
            if (!product.is_active) {
                throw new UnprocessableEntityException(`${product.name} no está disponible.`);
            }

            //1. Guardar el renglon con el precio de HOY, si manana sube el precio esta cuenta no cambia
            //Se guarda primero para tener su id y ligarle los movimientos de la bitacora
            const { identifiers } = await manager.insert(OrderItem, {
                order_id: order.id,
                product_id: product.id,
                quantity: body.quantity,
                unit_price: product.price,
                line_total: money(product.price * body.quantity),
                notes: body.notes ?? null,
            });
            const orderItemId = Number(identifiers[0].id);

            //2. Por cada insumo de la receta: revisar que alcance y descontarlo
            for (const line of product.recipe) {
                //line.quantity es lo que lleva UNA porcion (sale de ingredient_product), por eso se multiplica
                const needed = line.quantity * body.quantity;
                const ingredient = orFail(
                    await manager.findOne(Ingredient, {
                        where: { id: line.ingredient_id },
                        lock: FOR_UPDATE,
                    }),
                    'El insumo',
                );

                //Si no alcanza, el throw cancela TODA la transaccion y los descuentos anteriores se deshacen solos, ponte vrgas
                if (ingredient.stock < needed) {
                    throw new UnprocessableEntityException(
                        `No alcanza el insumo ${ingredient.name} para ${product.name}.`,
                    );
                }

                await manager.decrement(Ingredient, { id: ingredient.id }, 'stock', needed);
                await manager.insert(InventoryMovement, {
                    ingredient_id: ingredient.id,
                    user_id: user.id,
                    type: 'salida',
                    quantity: needed,
                    order_item_id: orderItemId,
                    reason: `Cuenta #${order.id}: ${body.quantity} x ${product.name}`,
                });
            }

            //3. Volver a sumar la cuenta
            await this.recalculate(manager, order.id);
        });

        //El front recibe la cuenta ya recalculada
        return this.findOrder(id);
    }

    //POST /api/orders/5/close { "payment_method_id": 1, "tip": 50 } → cobrar
    @Post('orders/:id/close')
    @Roles('admin', 'mesero')
    @HttpCode(200)
    async closeOrder(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: CloseOrderDto,
        @CurrentUser() user: User,
    ) {
        await this.dataSource.transaction(async (manager) => {
            const order = orFail(
                await manager.findOne(Order, { where: { id }, lock: FOR_UPDATE }),
                'La cuenta',
            );
            this.checkOwner(order, user);
            if (order.status !== 'abierta') {
                throw new ConflictException('La cuenta ya está cerrada.');
            }

            //Una cuenta vacia no se cobra, se cancela chiavito
            if ((await manager.count(OrderItem, { where: { order_id: id } })) === 0) {
                throw new UnprocessableEntityException('La cuenta está vacía; mejor cancélenla.');
            }

            await manager.update(Order, id, {
                payment_method_id: body.payment_method_id,
                tip: body.tip ?? 0,
                status: 'pagada',
                closed_at: new Date(),
            });

            //Se recalcula ya con la propina y se libera la mesa
            await this.recalculate(manager, id);
            await manager.update(BarTable, order.bar_table_id, { status: 'libre' });
        });
        return this.findOrder(id);
    }

    //POST /api/orders/5/cancel → regresa los insumos al inventario y libera la mesa
    @Post('orders/:id/cancel')
    @Roles('admin', 'mesero')
    @HttpCode(200)
    async cancelOrder(
        @Param('id', ParseIntPipe) id: number,
        @CurrentUser() user: User,
    ) {
        await this.dataSource.transaction(async (manager) => {
            const order = orFail(
                await manager.findOne(Order, { where: { id }, lock: FOR_UPDATE }),
                'La cuenta',
            );
            this.checkOwner(order, user);
            if (order.status !== 'abierta') {
                throw new ConflictException('Solo se pueden cancelar cuentas abiertas.');
            }

            const items = await manager.findBy(OrderItem, { order_id: id });

            //Regla de negocio por rol: el mesero solo puede cancelar cuentas VACIAS, no te hagas el listo
            if (user.role?.name === 'mesero' && items.length > 0) {
                throw new ForbiddenException(
                    'Solo el administrador puede cancelar una cuenta con productos.',
                );
            }

            //Regresa al inventario EXACTAMENTE lo que salio por esta cuenta (lo dice la bitacora), no lo que dice la receta de hoy
            const salidas = items.length
                ? await manager.findBy(InventoryMovement, {
                    order_item_id: In(items.map((item) => item.id)),
                    type: 'salida',
                })
                : [];
            for (const salida of salidas) {
                await manager.increment(Ingredient, { id: salida.ingredient_id }, 'stock', salida.quantity);
                await manager.insert(InventoryMovement, {
                    ingredient_id: salida.ingredient_id,
                    user_id: user.id,
                    type: 'entrada',
                    quantity: salida.quantity,
                    order_item_id: salida.order_item_id,
                    reason: `Cancelación de cuenta #${id}`,
                });
            }

            await manager.update(Order, id, { status: 'cancelada', closed_at: new Date() });
            await manager.update(BarTable, order.bar_table_id, { status: 'libre' });
        });
        return this.findOrder(id);
    }

    //El mesero solo puede ver y mover SUS cuentas, el admin puede con todas, no andes metiendote en las mesas de otro chiavito
    private checkOwner(order: Order, user: User) {
        if (user.role?.name === 'mesero' && order.user_id !== user.id) {
            throw new ForbiddenException('Esta cuenta es de otro mesero.');
        }
    }

    //Busca la cuenta completita: mesa, mesero, metodo de pago y productos en el orden en que se pidieron
    private findOrder(id: number) {
        return this.orderRepository.findOne({
            where: { id },
            relations: {
                bar_table: true,
                user: true,
                payment_method: true,
                items: { product: true },
            },
            order: { items: { id: 'ASC' } },
        });
    }

    //Vuelve a sumar la cuenta: subtotal = suma de renglones y total = subtotal + propina
    private async recalculate(manager: EntityManager, orderId: number) {
        const subtotal = (await manager.sum(OrderItem, 'line_total', { order_id: orderId })) ?? 0;
        const order = await manager.findOneByOrFail(Order, { id: orderId });
        await manager.update(Order, orderId, { subtotal: money(subtotal), total: money(subtotal + order.tip) });
    }

    //Barra (admin y cantinero)

    //GET /api/bar/queue → lo que falta preparar, el mas viejo primero para que nadie se quede esperando
    @Get('bar/queue')
    @Roles('admin', 'cantinero')
    barQueue() {
        return this.orderItemRepository.find({
            where: { status: 'pendiente', order: { status: 'abierta' } },
            relations: { product: true, order: { bar_table: true } },
            order: { id: 'ASC' },
        });
    }

    //PATCH /api/order-items/7/ready → marca un renglon como listo
    @Patch('order-items/:id/ready')
    @Roles('admin', 'cantinero')
    async markReady(@Param('id', ParseIntPipe) id: number) {
        const item = orFail(await this.orderItemRepository.findOneBy({ id }), 'El renglón');
        item.status = 'listo';
        await this.orderItemRepository.save(item);
        return this.orderItemRepository.findOne({ where: { id }, relations: { product: true } });
    }

    //Compras a proveedores (solo admin)

    //GET /api/purchases?page=1 → admin
    @Get('purchases')
    @Roles('admin')
    async listPurchases(@Query('page') page?: string) {
        const query = this.purchaseRepository
            .createQueryBuilder('purchase')
            .leftJoinAndSelect('purchase.supplier', 'supplier')
            .leftJoinAndSelect('purchase.user', 'u')
            .orderBy('purchase.id', 'DESC');

        //Igual que en las cuentas: se pagina primero y luego se cuentan los renglones de esta pagina
        const result = await paginate(query, page);
        const counts = await countChildren(this.purchaseItemRepository, 'purchase_id', result.data.map((purchase) => purchase.id));
        for (const purchase of result.data) purchase.items_count = counts.get(purchase.id) ?? 0;
        return result;
    }

    //POST /api/purchases
    //{ "supplier_id": 1, "items": [{ "ingredient_id": 1, "quantity": 3000, "unit_cost": 0.33 }] }
    @Post('purchases')
    @Roles('admin')
    async createPurchase(@Body() body: PurchaseDto, @CurrentUser() user: User) {
        //Un insumo no se repite en la misma compra, si compraste mas sube la cantidad chiavito
        const ids = body.items.map((line) => line.ingredient_id);
        if (new Set(ids).size !== ids.length) {
            throw new UnprocessableEntityException('Hay un insumo repetido en la compra.');
        }

        const id = await this.dataSource.transaction(async (manager) => {
            const supplier = orFail(
                await manager.findOneBy(Supplier, { id: body.supplier_id }),
                'El proveedor',
            );
            const purchase = await manager.save(
                manager.create(Purchase, { supplier_id: supplier.id, user_id: user.id, total: 0 }),
            );

            let total = 0;
            for (const line of body.items) {
                const ingredient = orFail(
                    await manager.findOne(Ingredient, {
                        where: { id: line.ingredient_id },
                        lock: FOR_UPDATE,
                    }),
                    'El insumo',
                );

                //Se redondea a 2 decimales para que no salgan centavos fantasma
                const lineTotal = money(line.quantity * line.unit_cost);
                total += lineTotal;

                //1. El renglon de la compra
                await manager.insert(PurchaseItem, {
                    purchase_id: purchase.id,
                    ingredient_id: ingredient.id,
                    quantity: line.quantity,
                    unit_cost: line.unit_cost,
                    line_total: lineTotal,
                });

                //2. Sube el inventario y guarda el ultimo costo
                await manager.update(Ingredient, ingredient.id, {
                    stock: ingredient.stock + line.quantity,
                    cost: line.unit_cost,
                });

                //3. MUCHOS A MUCHOS: precio de ESTE proveedor sin tocar a los demas, para que no te estafen (PONTE VRGAS)
                const link = await manager.findOneBy(IngredientSupplier, {
                    ingredient_id: ingredient.id,
                    supplier_id: supplier.id,
                });
                if (link) {
                    await manager.update(IngredientSupplier, link.id, { price: line.unit_cost });
                } else {
                    await manager.insert(IngredientSupplier, {
                        ingredient_id: ingredient.id,
                        supplier_id: supplier.id,
                        price: line.unit_cost,
                    });
                }

                //4. La bitacora
                await manager.insert(InventoryMovement, {
                    ingredient_id: ingredient.id,
                    user_id: user.id,
                    type: 'entrada',
                    quantity: line.quantity,
                    reason: `Compra #${purchase.id} a ${supplier.name}`,
                });
            }

            await manager.update(Purchase, purchase.id, { total: money(total) });
            return purchase.id;
        });
        return this.findPurchase(id);
    }

    //GET /api/purchases/1 → admin
    @Get('purchases/:id')
    @Roles('admin')
    async showPurchase(@Param('id', ParseIntPipe) id: number) {
        return orFail(await this.findPurchase(id), 'La compra');
    }

    //Busca la compra con su proveedor, quien la registro y sus insumos
    private findPurchase(id: number) {
        return this.purchaseRepository.findOne({
            where: { id },
            relations: { supplier: true, user: true, items: { ingredient: true } },
        });
    }

    //Reporte del dia (solo admin)

    //GET /api/dashboard
    @Get('dashboard')
    @Roles('admin')
    async dashboard() {
        //"Hoy" = de las 00:00 de hoy a las 00:00 de manana, con la hora de la compu
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const today = { start, end };

        //Ventas, propinas y numero de cuentas cobradas hoy
        const totalsQuery = this.orderRepository
            .createQueryBuilder('o')
            .select('COALESCE(SUM(o.total), 0)', 'sales')
            .addSelect('COALESCE(SUM(o.tip), 0)', 'tips')
            .addSelect('COUNT(o.id)', 'count')
            .where("o.status = 'pagada'")
            .andWhere('o.closed_at >= :start AND o.closed_at < :end', today)
            .getRawOne<{ sales: string; tips: string; count: string }>();

        //Los 5 productos que mas se vendieron hoy
        const topQuery = this.orderItemRepository
            .createQueryBuilder('item')
            .innerJoin('item.order', 'o')
            .select('item.product_id', 'product_id')
            .addSelect('SUM(item.quantity)', 'qty')
            .addSelect('SUM(item.line_total)', 'amount')
            .where("o.status = 'pagada'")
            .andWhere('o.closed_at >= :start AND o.closed_at < :end', today)
            .groupBy('item.product_id')
            .orderBy('qty', 'DESC')
            .limit(5)
            .getRawMany<{ product_id: string; qty: string; amount: string }>();

        //Las consultas no dependen una de otra, asi que se lanzan todas al mismo tiempo en vez de una por una chiavito
        const [totals, top, openOrders, busyTables, totalTables, lowIngredients] = await Promise.all([
            totalsQuery,
            topQuery,
            this.orderRepository.countBy({ status: 'abierta' }),
            this.barTableRepository.countBy({ status: 'ocupada' }),
            this.barTableRepository.count(),
            this.ingredientRepository
                .createQueryBuilder('ingredient')
                .where('ingredient.stock <= ingredient.min_stock')
                .orderBy('ingredient.name')
                .getMany(),
        ]);

        const ids = top.map((row) => Number(row.product_id));
        const products = ids.length ? await this.productRepository.findBy({ id: In(ids) }) : [];

        //MySQL regresa los SUM como texto, por eso todo pasa por Number() chiavito
        return {
            sales_today: Number(totals?.sales ?? 0),
            tips_today: Number(totals?.tips ?? 0),
            orders_today: Number(totals?.count ?? 0),
            open_orders: openOrders,
            busy_tables: busyTables,
            total_tables: totalTables,
            low_ingredients: lowIngredients,
            top_products: top.map((row) => ({
                product_id: Number(row.product_id),
                qty: Number(row.qty),
                amount: Number(row.amount),
                product: products.find((product) => product.id === Number(row.product_id)),
            })),
        };
    }
}

