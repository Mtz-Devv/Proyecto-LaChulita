import {
    Body,
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
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CurrentUser, Roles } from '../auth/guards.js';
import { FOR_UPDATE, likePattern, orFail, paginate } from '../common.js';
import {
    AdjustDto,
    IngredientDto,
    ProductDto,
    RecipeLineDto,
} from '../dto/index.js';
import {
    Ingredient,
    IngredientSupplier,
    InventoryMovement,
    Product,
    ProductIngredient,
    User,
} from '../entities/index.js';

//Menu e inventario: productos con su receta, insumos con sus proveedores, ajustes y la bitacora. Aqui viven los muchos a muchos chiavito
@Controller()
export class MenuInventoryController {
    constructor(
        //El DataSource se usa para las transacciones (todo se guarda junto o no se guarda nada)
        private readonly dataSource: DataSource,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectRepository(Ingredient)
        private readonly ingredientRepository: Repository<Ingredient>,
        @InjectRepository(InventoryMovement)
        private readonly movementRepository: Repository<InventoryMovement>,
    ) { }

    //Productos con su receta

    //GET /api/products?search=mar&category_id=2&active=1&page=1&all=1 → los 3 roles
    @Get('products')
    listProducts(
        @Query('search') search?: string,
        @Query('category_id') categoryId?: string,
        @Query('active') active?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {
        //Trae el producto con su categoria y su receta, y cada renglon de la receta con su insumo
        const query = this.productRepository
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.category', 'category')
            .leftJoinAndSelect('product.recipe', 'recipe')
            .leftJoinAndSelect('recipe.ingredient', 'ingredient')
            .orderBy('product.name');

        if (search) {
            query.andWhere('product.name LIKE :search', { search: likePattern(search) });
        }
        if (categoryId) {
            query.andWhere('product.category_id = :categoryId', { categoryId: Number(categoryId) });
        }
        if (active === '1') {
            //El menu del mesero solo trae los productos disponibles, para que no venda lo que no hay
            query.andWhere('product.is_active = :active', { active: true });
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    //GET /api/products/3 → admin
    @Get('products/:id')
    @Roles('admin')
    async showProduct(@Param('id', ParseIntPipe) id: number) {
        return orFail(await this.findProduct(id), 'El producto');
    }

    //POST /api/products → admin. El producto y su receta se guardan en una transaccion, si truena uno truenan los dos
    @Post('products')
    @Roles('admin')
    async createProduct(@Body() body: ProductDto) {
        const { recipe, ...data } = body;
        const id = await this.dataSource.transaction(async (manager) => {
            const product = await manager.save(manager.create(Product, data));
            await this.saveRecipe(manager, product.id, recipe ?? []);
            return product.id;
        });
        return this.findProduct(id);
    }

    //PUT /api/products/3 → admin. Si no mandan receta, se queda la que ya tenia
    @Put('products/:id')
    @Roles('admin')
    async updateProduct(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: ProductDto,
    ) {
        const product = orFail(await this.productRepository.findOneBy({ id }), 'El producto');
        const { recipe, ...data } = body;
        await this.dataSource.transaction(async (manager) => {
            await manager.save(Object.assign(product, data));
            if (recipe) await this.saveRecipe(manager, id, recipe);
        });
        return this.findProduct(id);
    }

    //DELETE /api/products/3 → admin. La receta se borra sola (CASCADE), pero si ya se vendio MySQL no deja (409), mejor desactivalo con is_active chiavito
    @Delete('products/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteProduct(@Param('id', ParseIntPipe) id: number) {
        const product = orFail(await this.productRepository.findOneBy({ id }), 'El producto');
        await this.productRepository.remove(product);
    }

    //Busca el producto completito: con su categoria y su receta con insumos
    private findProduct(id: number) {
        return this.productRepository.findOne({
            where: { id },
            relations: { category: true, recipe: { ingredient: true } },
        });
    }

    //MUCHOS A MUCHOS: deja en ingredient_product EXACTAMENTE estos renglones (borra la receta vieja y guarda la nueva)
    private async saveRecipe(
        manager: EntityManager,
        productId: number,
        lines: RecipeLineDto[],
    ) {
        //Un insumo no puede ir dos veces en la misma receta, ponte vrgas
        const ids = lines.map((line) => line.ingredient_id);
        if (new Set(ids).size !== ids.length) {
            throw new UnprocessableEntityException('Hay un insumo repetido en la receta.');
        }

        await manager.delete(ProductIngredient, { product_id: productId });
        for (const line of lines) {
            await manager.insert(ProductIngredient, {
                product_id: productId,
                ingredient_id: line.ingredient_id,
                quantity: line.quantity,
            });
        }
    }

    //Insumos con sus proveedores

    //GET /api/ingredients?search=te&low=1&page=1&all=1 → admin y cantinero
    @Get('ingredients')
    @Roles('admin', 'cantinero')
    listIngredients(
        @Query('search') search?: string,
        @Query('low') low?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {
        const query = this.ingredientRepository
            .createQueryBuilder('ingredient')
            .leftJoinAndSelect('ingredient.suppliers', 'link')
            .leftJoinAndSelect('link.supplier', 'supplier')
            .orderBy('ingredient.name');

        if (search) {
            query.andWhere('ingredient.name LIKE :search', { search: likePattern(search) });
        }
        if (low === '1') {
            //Solo los que estan en su minimo o abajo, o sea los que ya hay que ir a comprar chiavito
            query.andWhere('ingredient.stock <= ingredient.min_stock');
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    //GET /api/ingredients/1 → admin, con sus proveedores y en que productos se usa
    @Get('ingredients/:id')
    @Roles('admin')
    async showIngredient(@Param('id', ParseIntPipe) id: number) {
        const ingredient = await this.ingredientRepository.findOne({
            where: { id },
            relations: { suppliers: { supplier: true }, recipes: { product: true } },
        });
        return orFail(ingredient, 'El insumo');
    }

    //POST /api/ingredients → admin. Empieza con stock 0, el stock solo sube con compras
    @Post('ingredients')
    @Roles('admin')
    async createIngredient(@Body() body: IngredientDto) {
        const { supplier_ids, ...data } = body;
        const id = await this.dataSource.transaction(async (manager) => {
            const ingredient = await manager.save(manager.create(Ingredient, data));
            await this.syncSuppliers(manager, ingredient.id, supplier_ids ?? []);
            return ingredient.id;
        });
        return this.findIngredient(id);
    }

    //PUT /api/ingredients/1 → admin. El stock NO se toca aqui, para que la bitacora siempre cuadre
    //Igual que la receta del producto: si no mandan supplier_ids se quedan los proveedores que ya tenia
    @Put('ingredients/:id')
    @Roles('admin')
    async updateIngredient(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: IngredientDto,
    ) {
        const ingredient = orFail(await this.ingredientRepository.findOneBy({ id }), 'El insumo');
        const { supplier_ids, ...data } = body;
        await this.dataSource.transaction(async (manager) => {
            await manager.save(Object.assign(ingredient, data));
            if (supplier_ids) await this.syncSuppliers(manager, id, supplier_ids);
        });
        return this.findIngredient(id);
    }

    //DELETE /api/ingredients/1 → admin. Si esta en recetas o compras MySQL no deja (409)
    @Delete('ingredients/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteIngredient(@Param('id', ParseIntPipe) id: number) {
        const ingredient = orFail(await this.ingredientRepository.findOneBy({ id }), 'El insumo');
        await this.ingredientRepository.remove(ingredient);
    }

    //POST /api/ingredients/1/adjust { "stock": 6500, "reason": "Conteo físico" } → admin
    @Post('ingredients/:id/adjust')
    @Roles('admin')
    @HttpCode(200)
    async adjust(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: AdjustDto,
        @CurrentUser() user: User,
    ) {
        await this.dataSource.transaction(async (manager) => {
            //El FOR_UPDATE aparta el insumo, si dos lo ajustan al mismo tiempo el segundo espera
            const ingredient = orFail(
                await manager.findOne(Ingredient, { where: { id }, lock: FOR_UPDATE }),
                'El insumo',
            );

            //Puede salir negativa si falto mercancia (alguien se la tomo chiavito)
            const difference = body.stock - ingredient.stock;

            await manager.update(Ingredient, id, { stock: body.stock });
            await manager.insert(InventoryMovement, {
                ingredient_id: id,
                user_id: user.id,
                type: 'ajuste',
                quantity: difference,
                reason: body.reason,
            });
        });
        return this.findIngredient(id);
    }

    //Busca el insumo con sus proveedores
    private findIngredient(id: number) {
        return this.ingredientRepository.findOne({
            where: { id },
            relations: { suppliers: { supplier: true } },
        });
    }

    //MUCHOS A MUCHOS: deja exactamente estos proveedores en ingredient_supplier
    //A los que se quedan les respeta su precio y los nuevos empiezan sin precio
    private async syncSuppliers(
        manager: EntityManager,
        ingredientId: number,
        supplierIds: number[],
    ) {
        const current = await manager.findBy(IngredientSupplier, { ingredient_id: ingredientId });
        const currentIds = current.map((link) => link.supplier_id);

        //Quita los que ya no vienen en la lista
        const toRemove = current.filter((link) => !supplierIds.includes(link.supplier_id));
        if (toRemove.length) await manager.remove(toRemove);

        //Agrega los nuevos (el Set quita los repetidos por si el front manda [1, 1])
        for (const supplierId of new Set(supplierIds)) {
            if (!currentIds.includes(supplierId)) {
                await manager.insert(IngredientSupplier, {
                    ingredient_id: ingredientId,
                    supplier_id: supplierId,
                });
            }
        }
    }

    //Bitacora de inventario

    //GET /api/inventory-movements?ingredient_id=1&type=salida&page=1 → admin
    @Get('inventory-movements')
    @Roles('admin')
    listMovements(
        @Query('ingredient_id') ingredientId?: string,
        @Query('type') type?: string,
        @Query('page') page?: string,
    ) {
        const query = this.movementRepository
            .createQueryBuilder('movement')
            .leftJoinAndSelect('movement.ingredient', 'ingredient')
            .leftJoinAndSelect('movement.user', 'u')
            .orderBy('movement.id', 'DESC'); //Lo mas nuevo primero

        if (ingredientId) {
            query.andWhere('movement.ingredient_id = :ingredientId', { ingredientId: Number(ingredientId) });
        }
        if (type) {
            query.andWhere('movement.type = :type', { type });
        }
        return paginate(query, page, 15);
    }
}

