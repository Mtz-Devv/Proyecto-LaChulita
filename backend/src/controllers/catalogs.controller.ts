import {
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { CurrentUser, Roles } from '../auth/guards.js';
import { SALT_ROUNDS, countChildren, likePattern, orFail, paginate } from '../common.js';
import {
    BarTableDto,
    CategoryDto,
    PaymentMethodDto,
    SupplierDto,
    UserDto,
} from '../dto/index.js';
import {
    BarTable,
    Category,
    Order,
    PaymentMethod,
    Product,
    Role,
    Supplier,
    User,
} from '../entities/index.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Controller()
export class CatalogsController {
    constructor(
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectRepository(PaymentMethod)
        private readonly paymentMethodRepository: Repository<PaymentMethod>,
        @InjectRepository(Supplier)
        private readonly supplierRepository: Repository<Supplier>,
        @InjectRepository(BarTable)
        private readonly barTableRepository: Repository<BarTable>,
        @InjectRepository(Order)
        private readonly orderRepository: Repository<Order>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        private readonly realtime: RealtimeService,
    ) { }

    @Get('categories')
    async listCategories(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {
        const query = this.categoryRepository
            .createQueryBuilder('category')
            .orderBy('category.name');

        if (search) {
            query.where('category.name LIKE :search', { search: likePattern(search) });
        }

        const result = all === '1' ? await query.getMany() : await paginate(query, page);
        const list = Array.isArray(result) ? result : result.data;

        const counts = await countChildren(this.productRepository, 'category_id', list.map((category) => category.id));
        for (const category of list) category.products_count = counts.get(category.id) ?? 0;
        return result;
    }

    @Post('categories')
    @Roles('admin')
    async createCategory(@Body() body: CategoryDto) {
        const category = await this.categoryRepository.save(this.categoryRepository.create(body));
        this.realtime.sync(['categories'], { action: 'category.created', id: category.id });
        return category;
    }

    @Get('categories/:id')
    @Roles('admin')
    async showCategory(@Param('id', ParseIntPipe) id: number) {
        const category = await this.categoryRepository.findOne({
            where: { id },
            relations: { products: true },
        });
        return orFail(category, 'La categoría');
    }

    @Put('categories/:id')
    @Roles('admin')
    async updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: CategoryDto,
    ) {
        const category = orFail(await this.categoryRepository.findOneBy({ id }), 'La categoría');

        const saved = await this.categoryRepository.save(Object.assign(category, body));
        this.realtime.sync(['categories', 'products'], { action: 'category.updated', id });
        return saved;
    }

    @Delete('categories/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteCategory(@Param('id', ParseIntPipe) id: number) {
        const category = orFail(await this.categoryRepository.findOneBy({ id }), 'La categoría');
        await this.categoryRepository.remove(category);
        this.realtime.sync(['categories'], { action: 'category.deleted', id });
    }

    @Get('payment-methods')
    listPaymentMethods(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {
        const query = this.paymentMethodRepository
            .createQueryBuilder('method')
            .orderBy('method.name');

        if (search) {
            query.where('method.name LIKE :search', { search: likePattern(search) });
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    @Post('payment-methods')
    @Roles('admin')
    async createPaymentMethod(@Body() body: PaymentMethodDto) {
        const method = await this.paymentMethodRepository.save(this.paymentMethodRepository.create(body));
        this.realtime.sync(['payment-methods'], { action: 'payment_method.created', id: method.id });
        return method;
    }

    @Put('payment-methods/:id')
    @Roles('admin')
    async updatePaymentMethod(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: PaymentMethodDto,
    ) {
        const method = orFail(await this.paymentMethodRepository.findOneBy({ id }), 'El método de pago');
        const saved = await this.paymentMethodRepository.save(Object.assign(method, body));
        this.realtime.sync(['payment-methods'], { action: 'payment_method.updated', id });
        return saved;
    }

    @Delete('payment-methods/:id')
    @Roles('admin')
    @HttpCode(204)
    async deletePaymentMethod(@Param('id', ParseIntPipe) id: number) {
        const method = orFail(await this.paymentMethodRepository.findOneBy({ id }), 'El método de pago');
        await this.paymentMethodRepository.remove(method);
        this.realtime.sync(['payment-methods'], { action: 'payment_method.deleted', id });
    }

    @Get('suppliers')
    @Roles('admin')
    listSuppliers(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {
        const query = this.supplierRepository
            .createQueryBuilder('supplier')
            .orderBy('supplier.name');

        if (search) {
            query.where('supplier.name LIKE :search', { search: likePattern(search) });
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    @Post('suppliers')
    @Roles('admin')
    async createSupplier(@Body() body: SupplierDto) {
        const supplier = await this.supplierRepository.save(this.supplierRepository.create(body));
        this.realtime.sync(['suppliers'], { action: 'supplier.created', id: supplier.id });
        return supplier;
    }

    @Put('suppliers/:id')
    @Roles('admin')
    async updateSupplier(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: SupplierDto,
    ) {
        const supplier = orFail(await this.supplierRepository.findOneBy({ id }), 'El proveedor');
        const saved = await this.supplierRepository.save(Object.assign(supplier, body));
        this.realtime.sync(['suppliers', 'ingredients'], { action: 'supplier.updated', id });
        return saved;
    }

    @Delete('suppliers/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteSupplier(@Param('id', ParseIntPipe) id: number) {
        const supplier = orFail(await this.supplierRepository.findOneBy({ id }), 'El proveedor');
        await this.supplierRepository.remove(supplier);
        this.realtime.sync(['suppliers', 'ingredients'], { action: 'supplier.deleted', id });
    }

    @Get('bar-tables')
    async listTables() {
        const tables = await this.barTableRepository.find({ order: { number: 'ASC' } });
        const openOrders = await this.orderRepository.findBy({ status: 'abierta' });

        for (const table of tables) {
            table.current_order = openOrders.find((order) => order.bar_table_id === table.id) ?? null;
        }
        return tables;
    }

    @Post('bar-tables')
    @Roles('admin')
    async createTable(@Body() body: BarTableDto) {
        const table = await this.barTableRepository.save(this.barTableRepository.create(body));
        this.realtime.sync(['tables', 'dashboard'], { action: 'table.created', id: table.id, table_id: table.id });
        return table;
    }

    @Put('bar-tables/:id')
    @Roles('admin')
    async updateTable(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: BarTableDto,
    ) {
        const table = orFail(await this.barTableRepository.findOneBy({ id }), 'La mesa');
        const saved = await this.barTableRepository.save(Object.assign(table, body));
        this.realtime.sync(['tables', 'orders', 'bar-queue', 'dashboard'], { action: 'table.updated', id, table_id: id });
        return saved;
    }

    @Delete('bar-tables/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteTable(@Param('id', ParseIntPipe) id: number) {
        const table = orFail(await this.barTableRepository.findOneBy({ id }), 'La mesa');
        if (table.status === 'ocupada') {
            throw new ConflictException('No se puede borrar una mesa ocupada.');
        }
        await this.barTableRepository.remove(table);
        this.realtime.sync(['tables', 'dashboard'], { action: 'table.deleted', id, table_id: id });
    }

    @Get('users')
    @Roles('admin')
    listUsers(@Query('search') search?: string, @Query('page') page?: string) {
        const query = this.userRepository
            .createQueryBuilder('u')
            .leftJoinAndSelect('u.role', 'role')
            .orderBy('u.name');

        if (search) {
            query.where('u.name LIKE :search', { search: likePattern(search) });
        }
        return paginate(query, page);
    }

    @Post('users')
    @Roles('admin')
    async createUser(@Body() body: UserDto) {
        if (!body.password) {
            throw new UnprocessableEntityException('La contraseña es obligatoria.');
        }
        const { password, ...data } = body;
        const user = await this.userRepository.save(
            this.userRepository.create({ ...data, password: await hash(password, SALT_ROUNDS) }),
        );
        this.realtime.sync(['users'], { action: 'user.created', id: user.id });

        return this.userRepository.findOne({ where: { id: user.id }, relations: { role: true } });
    }

    @Put('users/:id')
    @Roles('admin')
    async updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UserDto,
        @CurrentUser() me: User,
    ) {

        if (id === me.id && body.role_id !== me.role_id) {
            throw new ConflictException('No puedes cambiar tu propio rol.');
        }

        const user = orFail(await this.userRepository.findOneBy({ id }), 'El usuario');
        const { password, ...data } = body;
        Object.assign(user, data);

        if (password) user.password = await hash(password, SALT_ROUNDS);

        await this.userRepository.save(user);
        const updated = await this.userRepository.findOne({ where: { id }, relations: { role: true } });
        this.realtime.sync(['users', 'orders'], { action: 'user.updated', id, actor_id: me.id });
        this.realtime.userUpdated(id, updated?.role?.name ?? null);
        return updated;
    }

    @Delete('users/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteUser(
        @Param('id', ParseIntPipe) id: number,
        @CurrentUser() me: User,
    ) {
        if (id === me.id) {
            throw new ConflictException('No puedes borrar tu propio usuario.');
        }
        const user = orFail(await this.userRepository.findOneBy({ id }), 'El usuario');
        await this.userRepository.remove(user);
        this.realtime.sync(['users'], { action: 'user.deleted', id, actor_id: me.id });
        this.realtime.userDeleted(id);
    }

    @Get('roles')
    @Roles('admin')
    listRoles() {
        return this.roleRepository.find({ order: { name: 'ASC' } });
    }
}
