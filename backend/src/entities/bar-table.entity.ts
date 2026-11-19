import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from './common.entity.js';
import { Order } from './order.entity.js';

@Entity('bar_tables')
export class BarTable extends Base {
    @Column({ type: 'int', unique: true })
    number: number;

    @Column({ type: 'int', default: 4 })
    capacity: number;

    @Column({ type: 'enum', enum: ['libre', 'ocupada'], default: 'libre' })
    status: 'libre' | 'ocupada';

    @OneToMany(() => Order, (order) => order.bar_table)
    orders: Order[];

    current_order?: Order | null;
}
