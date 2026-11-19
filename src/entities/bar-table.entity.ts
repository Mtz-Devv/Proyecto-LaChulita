import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from './common.entity.js';
import { Order } from './order.entity.js';

//Mesas
@Entity('bar_tables')
export class BarTable extends Base {
    @Column({ type: 'int', unique: true })
    number: number;

    //Cuantas personas caben en la mesa
    @Column({ type: 'int', default: 4 })
    capacity: number;

    @Column({ type: 'enum', enum: ['libre', 'ocupada'], default: 'libre' })
    status: 'libre' | 'ocupada';

    @OneToMany(() => Order, (order) => order.bar_table)
    orders: Order[];

    //No es una calumna (es la cuenta abierta de la mesa y se llena con el listado chiavo)
    current_order?: Order | null;
}

