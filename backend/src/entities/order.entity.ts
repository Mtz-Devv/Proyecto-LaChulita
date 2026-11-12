import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { BarTable } from './bar-table.entity.js';
import { User } from './user.entity.js';
import { PaymentMethod } from './payment-method.entity.js';
import { OrderItem } from './order-item.entity.js';

//Ordenes (pedidos)
@Entity('orders')
export class Order extends Base {
    @Column({ type: 'int' })
    bar_table_id: number;

    //Es el mesero que abrio la cuneta chiavo
    @Column({ type: 'int' })
    user_id: number;

    //Se va a llenar cuando se cierre la cuenta chiavo
    @Column({ type: 'int', nullable: true })
    payment_method_id: number | null;

    @Column({ type: 'enum', enum: ['abierta', 'pagada', 'cancelada'], default: 'abierta' })
    status: 'abierta' | 'pagada' | 'cancelada';

    @Column({ ...DECIMAL, default: 0 })
    subtotal: number;

    //Es la propina que dejo el cliente, se puede poner 0 chiavo, pero nmms no seas codo
    @Column({ ...DECIMAL, default: 0 })
    tip: number;

    @Column({ ...DECIMAL, default: 0 })
    total: number;

    //Aqui se va a llenar cuando se cierre la cuenta chiavo, para saber cuando se cerro la cuenta 
    @Column({ type: 'datetime', nullable: true })
    closed_at: Date | null;

    //Muchas ordenes pueden pertener a la misma mesa, pero una orden solo puede pertenecer a una mesa
    @ManyToOne(() => BarTable, (table) => table.orders)
    @JoinColumn({ name: 'bar_table_id' })
    bar_table: Relation<BarTable>;

    //Muchas ordenes pueden ser de un mismo mesero, pero una orden solo puede ser de un mesero
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    //Muchas ordenes pueden tener el mismo metodo de pago, pero una orden solo puede tener un metodo de pago
    @ManyToOne(() => PaymentMethod, (method) => method.orders)
    @JoinColumn({ name: 'payment_method_id' })
    payment_method: Relation<PaymentMethod> | null;

    //Una orden puede tener muchos items, pero un item solo puede pertenecer a una orden
    @OneToMany(() => OrderItem, (item) => item.order)
    items: OrderItem[];

    items_cont_count?: number; //No es una columna, es un campo que se puede usar para contar la cantidad de items que tiene una orden, ponte vrgas chiavito
}

