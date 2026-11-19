import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { BarTable } from './bar-table.entity.js';
import { User } from './user.entity.js';
import { PaymentMethod } from './payment-method.entity.js';
import { OrderItem } from './order-item.entity.js';

@Entity('orders')
export class Order extends Base {
    @Column({ type: 'int' })
    bar_table_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @Column({ type: 'int', nullable: true })
    payment_method_id: number | null;

    @Column({ type: 'enum', enum: ['abierta', 'pagada', 'cancelada'], default: 'abierta' })
    status: 'abierta' | 'pagada' | 'cancelada';

    @Column({ ...DECIMAL, default: 0 })
    subtotal: number;

    @Column({ ...DECIMAL, default: 0 })
    tip: number;

    @Column({ ...DECIMAL, default: 0 })
    total: number;

    @Column({ type: 'datetime', nullable: true })
    closed_at: Date | null;

    @ManyToOne(() => BarTable, (table) => table.orders)
    @JoinColumn({ name: 'bar_table_id' })
    bar_table: Relation<BarTable>;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    @ManyToOne(() => PaymentMethod, (method) => method.orders)
    @JoinColumn({ name: 'payment_method_id' })
    payment_method: Relation<PaymentMethod> | null;

    @OneToMany(() => OrderItem, (item) => item.order)
    items: OrderItem[];

    items_count?: number;

}
