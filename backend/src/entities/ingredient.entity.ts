import { Column, Entity, OneToMany } from 'typeorm';
import { Base, DECIMAL, type Unit } from './common.entity.js';
import { ProductIngredient } from './product-ingredient.entity.js';
import { IngredientSupplier } from './ingredient-supplier.entity.js';
import { InventoryMovement } from './inventory-movement.entity.js';

//Ingredientes
@Entity('ingredients')
export class Ingredient extends Base {
    @Column({ type: 'varchar', length: 100, unique: true })
    name: string;

    @Column({ type: 'enum', enum: ['ml', 'pz', 'g'] })
    unit: Unit;

    @Column({ ...DECIMAL, default: 0 })
    stock: number;

    //Es el minimo de stock, abajo de esto avisa que hay que pedir mas, es para no quedarse sin ingredientes
    @Column({ ...DECIMAL, default: 0 })
    min_stock: number;

    @Column({ ...DECIMAL, default: 0 })
    cost: number;

    //Realacion de muchos a muchos con productos (en que recetas se usa la tabla ingrdient_product)
    @OneToMany(() => ProductIngredient, (line) => line.ingredient)
    recipes: ProductIngredient[];

    //Relacion de muchos a muchos con proveedores (quien lo surte y a que precio)
    @OneToMany(() => IngredientSupplier, (link) => link.ingredient)
    suppliers: IngredientSupplier[];

    @OneToMany(() => InventoryMovement, (movement) => movement.ingredient)
    movements: InventoryMovement[];

}

