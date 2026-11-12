import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Supplier } from './supplier.entity.js';
import { User } from './user.entity.js';
import { PurchaseItem } from './purchase-item.entity.js';

//Compras a proveedores
@Entity('purchases')
export class Purchase extends Base {
    @Column({ type: 'int' })
    supplier_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @Column({ ...DECIMAL, default: 0 })
    total: number;

    //Muchas compras se hacen a un mismo proveedor
    @ManyToOne(() => Supplier)
    @JoinColumn({ name: 'supplier_id' })
    supplier: Relation<Supplier>;

    //Muchas compras las registra un mismo usuario (mesero)
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    //Una compra tiene muchos renglones
    @OneToMany(() => PurchaseItem, (item) => item.purchase)
    items: PurchaseItem[];

    items_count?: number;
}

