import { Column, Entity, JoinColumn, ManyToOne, Unique, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { Supplier } from './supplier.entity.js';

@Entity('ingredient_supplier')
@Unique(['ingredient_id', 'supplier_id'])
export class IngredientSupplier extends Base {
    @Column({ type: 'int' })
    ingredient_id: number;

    @Column({ type: 'int' })
    supplier_id: number;

    @Column({ ...DECIMAL, nullable: true })
    price: number | null;

    @ManyToOne(() => Ingredient, (ingredient) => ingredient.suppliers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;

    @ManyToOne(() => Supplier, (supplier) => supplier.ingredients, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'supplier_id' })
    supplier: Relation<Supplier>;
}
