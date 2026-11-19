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

//Los CRUD sencillos: categorias, metodos de pago, proveedores, mesas, usuarios y roles. Categorias es el modelo y los demas son la misma receta chiavito
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
    ) { }

    //Categorias (el CRUD modelo)

    //GET /api/categories?search=cer&page=2&all=1 → los 3 roles
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

        //all=1 regresa todo sin paginar (para llenar los <select> del front)
        const result = all === '1' ? await query.getMany() : await paginate(query, page);
        const list = Array.isArray(result) ? result : result.data;

        //products_count no es columna: se cuenta con un solo GROUP BY en vez de traer todos los productos chiavito
        const counts = await countChildren(this.productRepository, 'category_id', list.map((category) => category.id));
        for (const category of list) category.products_count = counts.get(category.id) ?? 0;
        return result;
    }

    //POST /api/categories → admin
    @Post('categories')
    @Roles('admin')
    createCategory(@Body() body: CategoryDto) {
        return this.categoryRepository.save(this.categoryRepository.create(body));
    }

    //GET /api/categories/5 → admin, con sus productos
    @Get('categories/:id')
    @Roles('admin')
    async showCategory(@Param('id', ParseIntPipe) id: number) {
        const category = await this.categoryRepository.findOne({
            where: { id },
            relations: { products: true },
        });
        return orFail(category, 'La categoría');
    }

    //PUT /api/categories/5 → admin
    @Put('categories/:id')
    @Roles('admin')
    async updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: CategoryDto,
    ) {
        const category = orFail(await this.categoryRepository.findOneBy({ id }), 'La categoría');
        //Object.assign copia lo que mando el front encima del registro y save hace el UPDATE
        return this.categoryRepository.save(Object.assign(category, body));
    }

    //DELETE /api/categories/5 → admin. Si tiene productos MySQL no deja (409), ponte vrgas
    @Delete('categories/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteCategory(@Param('id', ParseIntPipe) id: number) {
        const category = orFail(await this.categoryRepository.findOneBy({ id }), 'La categoría');
        await this.categoryRepository.remove(category);
    }

    //Metodos de pago

    //GET /api/payment-methods?all=1 → los 3 roles (el mesero los usa para cobrar)
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

    //POST /api/payment-methods → admin
    @Post('payment-methods')
    @Roles('admin')
    createPaymentMethod(@Body() body: PaymentMethodDto) {
        return this.paymentMethodRepository.save(this.paymentMethodRepository.create(body));
    }

    //PUT /api/payment-methods/1 → admin
    @Put('payment-methods/:id')
    @Roles('admin')
    async updatePaymentMethod(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: PaymentMethodDto,
    ) {
        const method = orFail(await this.paymentMethodRepository.findOneBy({ id }), 'El método de pago');
        return this.paymentMethodRepository.save(Object.assign(method, body));
    }

    //DELETE /api/payment-methods/1 → admin. Si ya se cobro con el, MySQL no deja (409)
    @Delete('payment-methods/:id')
    @Roles('admin')
    @HttpCode(204)
    async deletePaymentMethod(@Param('id', ParseIntPipe) id: number) {
        const method = orFail(await this.paymentMethodRepository.findOneBy({ id }), 'El método de pago');
        await this.paymentMethodRepository.remove(method);
    }

    //Proveedores (solo admin, los demas no tienen por que andar viendo los precios chiavito)

    //GET /api/suppliers?search=lic&page=1&all=1 → admin
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

    //POST /api/suppliers → admin
    @Post('suppliers')
    @Roles('admin')
    createSupplier(@Body() body: SupplierDto) {
        return this.supplierRepository.save(this.supplierRepository.create(body));
    }

    //PUT /api/suppliers/1 → admin
    @Put('suppliers/:id')
    @Roles('admin')
    async updateSupplier(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: SupplierDto,
    ) {
        const supplier = orFail(await this.supplierRepository.findOneBy({ id }), 'El proveedor');
        return this.supplierRepository.save(Object.assign(supplier, body));
    }

    //DELETE /api/suppliers/1 → admin. Si ya tiene compras MySQL no deja borrarlo (409)
    @Delete('suppliers/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteSupplier(@Param('id', ParseIntPipe) id: number) {
        const supplier = orFail(await this.supplierRepository.findOneBy({ id }), 'El proveedor');
        await this.supplierRepository.remove(supplier);
    }

    //Mesas

    //GET /api/bar-tables → los 3 roles. Sin paginar y con la cuenta abierta de cada mesa
    @Get('bar-tables')
    async listTables() {
        const tables = await this.barTableRepository.find({ order: { number: 'ASC' } });
        const openOrders = await this.orderRepository.findBy({ status: 'abierta' });

        //Aqui se llena current_order, que no es columna (por eso en la entidad no tiene decorador)
        for (const table of tables) {
            table.current_order = openOrders.find((order) => order.bar_table_id === table.id) ?? null;
        }
        return tables;
    }

    //POST /api/bar-tables → admin
    @Post('bar-tables')
    @Roles('admin')
    createTable(@Body() body: BarTableDto) {
        return this.barTableRepository.save(this.barTableRepository.create(body));
    }

    //PUT /api/bar-tables/1 → admin
    @Put('bar-tables/:id')
    @Roles('admin')
    async updateTable(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: BarTableDto,
    ) {
        const table = orFail(await this.barTableRepository.findOneBy({ id }), 'La mesa');
        return this.barTableRepository.save(Object.assign(table, body));
    }

    //DELETE /api/bar-tables/1 → admin. Una mesa ocupada no se borra y si ya tuvo cuentas MySQL no deja (409)
    @Delete('bar-tables/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteTable(@Param('id', ParseIntPipe) id: number) {
        const table = orFail(await this.barTableRepository.findOneBy({ id }), 'La mesa');
        if (table.status === 'ocupada') {
            throw new ConflictException('No se puede borrar una mesa ocupada.');
        }
        await this.barTableRepository.remove(table);
    }

    //Usuarios y roles (solo admin)

    //GET /api/users?search=ana&page=1 → admin
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

    //POST /api/users → admin. La contraseña se guarda encriptada, nunca como texto
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
        //Se vuelve a buscar para regresarlo con su rol y sin la contraseña
        return this.userRepository.findOne({ where: { id: user.id }, relations: { role: true } });
    }

    //PUT /api/users/2 → admin
    @Put('users/:id')
    @Roles('admin')
    async updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UserDto,
        @CurrentUser() me: User,
    ) {
        //Si el admin se quita su propio rol se queda afuera de la administracion y nadie lo puede regresar, no te hagas el harakiri chiavito
        if (id === me.id && body.role_id !== me.role_id) {
            throw new ConflictException('No puedes cambiar tu propio rol.');
        }

        const user = orFail(await this.userRepository.findOneBy({ id }), 'El usuario');
        const { password, ...data } = body;
        Object.assign(user, data);

        //Si la contraseña viene vacia no se cambia, si viene se encripta otra vez chiavito
        if (password) user.password = await hash(password, SALT_ROUNDS);

        await this.userRepository.save(user);
        return this.userRepository.findOne({ where: { id }, relations: { role: true } });
    }

    //DELETE /api/users/2 → admin. No te puedes borrar a ti mismo, no seas menso
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
        await this.userRepository.remove(user); //Si ya tiene cuentas o compras MySQL no deja (409)
    }

    //GET /api/roles → admin, para el <select> del formulario de usuarios
    @Get('roles')
    @Roles('admin')
    listRoles() {
        return this.roleRepository.find({ order: { name: 'ASC' } });
    }
}

