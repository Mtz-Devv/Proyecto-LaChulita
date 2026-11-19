import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Order } from './order.entity.js';
import { Product } from './product.entity.js';

//Items de la orden (productos que se pidieron)
@Entity('order_items')
export class OrderItem extends Base {
    @Column({ type: 'int' })
    order_id: number;

    @Column({ type: 'int' })
    product_id: number;

    @Column({ type: 'int' })
    quantity: number;

    @Column(DECIMAL)
    line_total: number;

    @Column(DECIMAL)
    unit_price: number;

    @Column({ type: 'enum', enum: ['pendiente', 'listo'], default: 'pendiente' })
    status: 'pendiente' | 'listo';

    @Column({ type: 'varchar', length: 100, nullable: true })
    notes: string | null; //"sin hielo", "doble", lo que pida el cliente

    @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'order_id' })
    order: Relation<Order>;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Relation<Product>;
}

