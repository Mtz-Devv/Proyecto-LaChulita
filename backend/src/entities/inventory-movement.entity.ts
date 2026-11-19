import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { OrderItem } from './order-item.entity.js';
import { User } from './user.entity.js';

@Entity('inventory_movements')
export class InventoryMovement extends Base {
    @Column({ type: 'int' })
    ingredient_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @Column({ type: 'int', nullable: true })
    order_item_id: number | null;

    @Column({ type: 'enum', enum: ['entrada', 'salida', 'ajuste'] })
    type: 'entrada' | 'salida' | 'ajuste';

    @Column(DECIMAL)
    quantity: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reason: string | null;

    @ManyToOne(() => Ingredient, (ingredient) => ingredient.movements, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    @ManyToOne(() => OrderItem, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'order_item_id' })
    order_item: Relation<OrderItem> | null;
}
