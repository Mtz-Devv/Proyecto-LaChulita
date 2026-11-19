import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Purchase } from './purchase.entity.js';
import { Ingredient } from './ingredient.entity.js';

@Entity('purchase_items')
export class PurchaseItem extends Base {
    @Column({ type: 'int' })
    purchase_id: number;

    @Column({ type: 'int' })
    ingredient_id: number;

    @Column(DECIMAL)
    quantity: number;

    @Column(DECIMAL)
    unit_cost: number;

    @Column(DECIMAL)
    line_total: number;

    @ManyToOne(() => Purchase, (purchase) => purchase.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchase_id' })
    purchase: Relation<Purchase>;

    @ManyToOne(() => Ingredient)
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;
}
