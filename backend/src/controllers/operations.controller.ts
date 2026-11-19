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

@Controller()
export class OperationsController {
    constructor(

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
            .orderBy('o.id', 'DESC');

        if (user.role?.name === 'mesero') {
            query.andWhere('o.user_id = :userId', { userId: user.id });
        }
        if (status) {
            query.andWhere('o.status = :status', { status });
        }
        if (date) {
            query.andWhere('DATE(o.created_at) = :date', { date });
        }

        const result = await paginate(query, page);
        const counts = await countChildren(this.orderItemRepository, 'order_id', result.data.map((order) => order.id));
        for (const order of result.data) order.items_count = counts.get(order.id) ?? 0;
        return result;
    }

    @Post('orders')
    @Roles('admin', 'mesero')
    async createOrder(@Body() body: OpenOrderDto, @CurrentUser() user: User) {
        const id = await this.dataSource.transaction(async (manager) => {

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

    @Get('orders/:id')
    @Roles('admin', 'mesero')
    async showOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
        const order = orFail(await this.findOrder(id), 'La cuenta');
        this.checkOwner(order, user);
        return order;
    }

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

            const { identifiers } = await manager.insert(OrderItem, {
                order_id: order.id,
                product_id: product.id,
                quantity: body.quantity,
                unit_price: product.price,
                line_total: money(product.price * body.quantity),
                notes: body.notes ?? null,
            });
            const orderItemId = Number(identifiers[0].id);

            for (const line of product.recipe) {

                const needed = line.quantity * body.quantity;
                const ingredient = orFail(
                    await manager.findOne(Ingredient, {
                        where: { id: line.ingredient_id },
                        lock: FOR_UPDATE,
                    }),
                    'El insumo',
                );

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

            await this.recalculate(manager, order.id);
        });

        return this.findOrder(id);
    }

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

            if ((await manager.count(OrderItem, { where: { order_id: id } })) === 0) {
                throw new UnprocessableEntityException('La cuenta está vacía; mejor cancélenla.');
            }

            await manager.update(Order, id, {
                payment_method_id: body.payment_method_id,
                tip: body.tip ?? 0,
                status: 'pagada',
                closed_at: new Date(),
            });

            await this.recalculate(manager, id);
            await manager.update(BarTable, order.bar_table_id, { status: 'libre' });
        });
        return this.findOrder(id);
    }

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

            if (user.role?.name === 'mesero' && items.length > 0) {
                throw new ForbiddenException(
                    'Solo el administrador puede cancelar una cuenta con productos.',
                );
            }

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

    private checkOwner(order: Order, user: User) {
        if (user.role?.name === 'mesero' && order.user_id !== user.id) {
            throw new ForbiddenException('Esta cuenta es de otro mesero.');
        }
    }

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

    private async recalculate(manager: EntityManager, orderId: number) {
        const subtotal = (await manager.sum(OrderItem, 'line_total', { order_id: orderId })) ?? 0;
        const order = await manager.findOneByOrFail(Order, { id: orderId });
        await manager.update(Order, orderId, { subtotal: money(subtotal), total: money(subtotal + order.tip) });
    }

    @Get('bar/queue')
    @Roles('admin', 'cantinero')
    barQueue() {
        return this.orderItemRepository.find({
            where: { status: 'pendiente', order: { status: 'abierta' } },
            relations: { product: true, order: { bar_table: true } },
            order: { id: 'ASC' },
        });
    }

    @Patch('order-items/:id/ready')
    @Roles('admin', 'cantinero')
    async markReady(@Param('id', ParseIntPipe) id: number) {
        const item = orFail(await this.orderItemRepository.findOneBy({ id }), 'El renglón');
        item.status = 'listo';
        await this.orderItemRepository.save(item);
        return this.orderItemRepository.findOne({ where: { id }, relations: { product: true } });
    }

    @Get('purchases')
    @Roles('admin')
    async listPurchases(@Query('page') page?: string) {
        const query = this.purchaseRepository
            .createQueryBuilder('purchase')
            .leftJoinAndSelect('purchase.supplier', 'supplier')
            .leftJoinAndSelect('purchase.user', 'u')
            .orderBy('purchase.id', 'DESC');

        const result = await paginate(query, page);
        const counts = await countChildren(this.purchaseItemRepository, 'purchase_id', result.data.map((purchase) => purchase.id));
        for (const purchase of result.data) purchase.items_count = counts.get(purchase.id) ?? 0;
        return result;
    }

    @Post('purchases')
    @Roles('admin')
    async createPurchase(@Body() body: PurchaseDto, @CurrentUser() user: User) {

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

                const lineTotal = money(line.quantity * line.unit_cost);
                total += lineTotal;

                await manager.insert(PurchaseItem, {
                    purchase_id: purchase.id,
                    ingredient_id: ingredient.id,
                    quantity: line.quantity,
                    unit_cost: line.unit_cost,
                    line_total: lineTotal,
                });

                await manager.update(Ingredient, ingredient.id, {
                    stock: ingredient.stock + line.quantity,
                    cost: line.unit_cost,
                });

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

    @Get('purchases/:id')
    @Roles('admin')
    async showPurchase(@Param('id', ParseIntPipe) id: number) {
        return orFail(await this.findPurchase(id), 'La compra');
    }

    private findPurchase(id: number) {
        return this.purchaseRepository.findOne({
            where: { id },
            relations: { supplier: true, user: true, items: { ingredient: true } },
        });
    }

    @Get('dashboard')
    @Roles('admin')
    async dashboard() {

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const today = { start, end };

        const totalsQuery = this.orderRepository
            .createQueryBuilder('o')
            .select('COALESCE(SUM(o.total), 0)', 'sales')
            .addSelect('COALESCE(SUM(o.tip), 0)', 'tips')
            .addSelect('COUNT(o.id)', 'count')
            .where("o.status = 'pagada'")
            .andWhere('o.closed_at >= :start AND o.closed_at < :end', today)
            .getRawOne<{ sales: string; tips: string; count: string }>();

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
