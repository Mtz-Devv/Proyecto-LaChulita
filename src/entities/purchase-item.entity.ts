import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Purchase } from './purchase.entity.js';
import { Ingredient } from './ingredient.entity.js';

//Insumos de cada compra
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

    //Muchas compras tienen muchos insumos pero un insumo solo pertenece a una compra, ponte vrgas chiavito
    @ManyToOne(() => Purchase, (purchase) => purchase.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchase_id' })
    purchase: Relation<Purchase>;

    //Muchos ingredientes pueden venir en muchas compras pero un ingrediente solo pertenece a una compra, ponte vrgas chiavito
    @ManyToOne(() => Ingredient)
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;
}

