import { Column, Entity, OneToMany } from 'typeorm';
import { Base, DECIMAL, type Unit } from './common.entity.js';
import { ProductIngredient } from './product-ingredient.entity.js';
import { IngredientSupplier } from './ingredient-supplier.entity.js';
import { InventoryMovement } from './inventory-movement.entity.js';

@Entity('ingredients')
export class Ingredient extends Base {
    @Column({ type: 'varchar', length: 100, unique: true })
    name: string;

    @Column({ type: 'enum', enum: ['ml', 'pza', 'g'] })
    unit: Unit;

    @Column({ ...DECIMAL, default: 0 })
    stock: number;

    @Column({ ...DECIMAL, default: 0 })
    min_stock: number;

    @Column({ ...DECIMAL, default: 0 })
    cost: number;

    @OneToMany(() => ProductIngredient, (line) => line.ingredient)
    recipes: ProductIngredient[];

    @OneToMany(() => IngredientSupplier, (link) => link.ingredient)
    suppliers: IngredientSupplier[];

    @OneToMany(() => InventoryMovement, (movement) => movement.ingredient)
    movements: InventoryMovement[];

}
