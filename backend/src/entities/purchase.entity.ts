import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Supplier } from './supplier.entity.js';
import { User } from './user.entity.js';
import { PurchaseItem } from './purchase-item.entity.js';

@Entity('purchases')
export class Purchase extends Base {
    @Column({ type: 'int' })
    supplier_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @Column({ ...DECIMAL, default: 0 })
    total: number;

    @ManyToOne(() => Supplier)
    @JoinColumn({ name: 'supplier_id' })
    supplier: Relation<Supplier>;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;

    @OneToMany(() => PurchaseItem, (item) => item.purchase)
    items: PurchaseItem[];

    items_count?: number;
}
