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
import { RealtimeService } from '../realtime/realtime.service.js';

@Controller()
export class MenuInventoryController {
    constructor(

        private readonly dataSource: DataSource,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectRepository(Ingredient)
        private readonly ingredientRepository: Repository<Ingredient>,
        @InjectRepository(InventoryMovement)
        private readonly movementRepository: Repository<InventoryMovement>,
        private readonly realtime: RealtimeService,
    ) { }

    @Get('products')
    listProducts(
        @Query('search') search?: string,
        @Query('category_id') categoryId?: string,
        @Query('active') active?: string,
        @Query('page') page?: string,
        @Query('all') all?: string,
    ) {

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

            query.andWhere('product.is_active = :active', { active: true });
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    @Get('products/:id')
    @Roles('admin')
    async showProduct(@Param('id', ParseIntPipe) id: number) {
        return orFail(await this.findProduct(id), 'El producto');
    }

    @Post('products')
    @Roles('admin')
    async createProduct(@Body() body: ProductDto) {
        const { recipe, ...data } = body;
        const id = await this.dataSource.transaction(async (manager) => {
            const product = await manager.save(manager.create(Product, data));
            await this.saveRecipe(manager, product.id, recipe ?? []);
            return product.id;
        });
        this.realtime.sync(['products', 'categories'], { action: 'product.created', id });
        return this.findProduct(id);
    }

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
        this.realtime.sync(['products', 'categories', 'dashboard'], { action: 'product.updated', id });
        return this.findProduct(id);
    }

    @Delete('products/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteProduct(@Param('id', ParseIntPipe) id: number) {
        const product = orFail(await this.productRepository.findOneBy({ id }), 'El producto');
        await this.productRepository.remove(product);
        this.realtime.sync(['products', 'categories', 'dashboard'], { action: 'product.deleted', id });
    }

    private findProduct(id: number) {
        return this.productRepository.findOne({
            where: { id },
            relations: { category: true, recipe: { ingredient: true } },
        });
    }

    private async saveRecipe(
        manager: EntityManager,
        productId: number,
        lines: RecipeLineDto[],
    ) {

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

            query.andWhere('ingredient.stock <= ingredient.min_stock');
        }
        return all === '1' ? query.getMany() : paginate(query, page);
    }

    @Get('ingredients/:id')
    @Roles('admin')
    async showIngredient(@Param('id', ParseIntPipe) id: number) {
        const ingredient = await this.ingredientRepository.findOne({
            where: { id },
            relations: { suppliers: { supplier: true }, recipes: { product: true } },
        });
        return orFail(ingredient, 'El insumo');
    }

    @Post('ingredients')
    @Roles('admin')
    async createIngredient(@Body() body: IngredientDto) {
        const { supplier_ids, ...data } = body;
        const id = await this.dataSource.transaction(async (manager) => {
            const ingredient = await manager.save(manager.create(Ingredient, data));
            await this.syncSuppliers(manager, ingredient.id, supplier_ids ?? []);
            return ingredient.id;
        });
        this.realtime.sync(['ingredients', 'dashboard'], { action: 'ingredient.created', id });
        return this.findIngredient(id);
    }

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
        this.realtime.sync(['ingredients', 'products', 'movements', 'dashboard'], { action: 'ingredient.updated', id });
        return this.findIngredient(id);
    }

    @Delete('ingredients/:id')
    @Roles('admin')
    @HttpCode(204)
    async deleteIngredient(@Param('id', ParseIntPipe) id: number) {
        const ingredient = orFail(await this.ingredientRepository.findOneBy({ id }), 'El insumo');
        await this.ingredientRepository.remove(ingredient);
        this.realtime.sync(['ingredients', 'products', 'dashboard'], { action: 'ingredient.deleted', id });
    }

    @Post('ingredients/:id/adjust')
    @Roles('admin')
    @HttpCode(200)
    async adjust(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: AdjustDto,
        @CurrentUser() user: User,
    ) {
        const lowStock = await this.dataSource.transaction(async (manager) => {

            const ingredient = orFail(
                await manager.findOne(Ingredient, { where: { id }, lock: FOR_UPDATE }),
                'El insumo',
            );

            const difference = body.stock - ingredient.stock;
            const crossed = ingredient.stock > ingredient.min_stock && body.stock <= ingredient.min_stock;

            await manager.update(Ingredient, id, { stock: body.stock });
            await manager.insert(InventoryMovement, {
                ingredient_id: id,
                user_id: user.id,
                type: 'ajuste',
                quantity: difference,
                reason: body.reason,
            });
            return crossed ? [{ ingredient, stock: body.stock }] : [];
        });
        this.realtime.sync(['ingredients', 'movements', 'dashboard'], {
            action: 'ingredient.adjusted',
            id,
            actor_id: user.id,
        });
        this.realtime.notifyLowStock(lowStock);
        return this.findIngredient(id);
    }

    private findIngredient(id: number) {
        return this.ingredientRepository.findOne({
            where: { id },
            relations: { suppliers: { supplier: true } },
        });
    }

    private async syncSuppliers(
        manager: EntityManager,
        ingredientId: number,
        supplierIds: number[],
    ) {
        const current = await manager.findBy(IngredientSupplier, { ingredient_id: ingredientId });
        const currentIds = current.map((link) => link.supplier_id);

        const toRemove = current.filter((link) => !supplierIds.includes(link.supplier_id));
        if (toRemove.length) await manager.remove(toRemove);

        for (const supplierId of new Set(supplierIds)) {
            if (!currentIds.includes(supplierId)) {
                await manager.insert(IngredientSupplier, {
                    ingredient_id: ingredientId,
                    supplier_id: supplierId,
                });
            }
        }
    }

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
            .orderBy('movement.id', 'DESC');

        if (ingredientId) {
            query.andWhere('movement.ingredient_id = :ingredientId', { ingredientId: Number(ingredientId) });
        }
        if (type) {
            query.andWhere('movement.type = :type', { type });
        }
        return paginate(query, page, 15);
    }
}
