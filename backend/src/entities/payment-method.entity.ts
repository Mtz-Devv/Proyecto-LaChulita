import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from './common.entity.js';
import { Order } from './order.entity.js';

//Metodos de pago
@Entity('payment_methods')
export class PaymentMethod extends Base {
    @Column({ type: 'varchar', length: 50, unique: true })
    name: string;

    @OneToMany(() => Order, (order) => order.payment_method)
    orders: Order[];
}

