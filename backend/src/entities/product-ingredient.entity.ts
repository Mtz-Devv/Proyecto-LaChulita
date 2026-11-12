import { Column, Entity, JoinColumn, ManyToOne, Unique, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Product } from './product.entity.js';
import { Ingredient } from './ingredient.entity.js';

@Entity('ingredient_product')
@Unique(['ingredient_id', 'product_id']) //Aqui le decimos que no se puede repetir la misma combinacion de ingrediente y producto en una misma receta
export class ProductIngredient extends Base {
    @Column({ type: 'int' })
    product_id: number;

    @Column({ type: 'int' })
    ingredient_id: number;

    //Aqui le decimos que la cantidad de ingrediente que lleva el producto es con dos decimales
    @Column(DECIMAL)
    quantity: number;

    //Muchas filas de la receta pueden apuntar al mismo producto, y muchas filas de la receta pueden apuntar al mismo ingrediente, pero no se puede repetir la misma combinacion de producto e ingrediente en una misma receta
    @ManyToOne(() => Product, (product) => product.recipes, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'product_id' })
    product: Relation<Product>;

    //Muchas filas de la receta pueden apuntarn al mismo ingrediente, y muchas filas de la receta pueden apuntar al mismo producto, pero no se puede repetir la misma combinacion de producto e ingrediente en una misma receta
    @ManyToOne(() => Ingredient, (ingredient) => ingredient.recipes, { onDelete: 'RESTRICT' }) //El resctrict es para que no se pueda borrar un ingrediente si ya esta en una receta, y no se pueda borrar un producto si ya tiene ingredientes en su receta
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;
}

