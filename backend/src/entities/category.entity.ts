import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from './common.entity.js';
import { Product } from './product.entity.js';

@Entity('categories')
export class Category extends Base {
    @Column({ type: 'varchar', length: 100, unique: true })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];

    products_count?: number;
}
