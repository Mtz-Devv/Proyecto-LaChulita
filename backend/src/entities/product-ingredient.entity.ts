import { Column, Entity, JoinColumn, ManyToOne, Unique, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Product } from './product.entity.js';
import { Ingredient } from './ingredient.entity.js';

@Entity('ingredient_product')
@Unique(['ingredient_id', 'product_id'])
export class ProductIngredient extends Base {
    @Column({ type: 'int' })
    product_id: number;

    @Column({ type: 'int' })
    ingredient_id: number;

    @Column(DECIMAL)
    quantity: number;

    @ManyToOne(() => Product, (product) => product.recipe, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Relation<Product>;

    @ManyToOne(() => Ingredient, (ingredient) => ingredient.recipes, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;
}
