import { Column, Entity, JoinColumn, ManyToOne, OneToMany, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Category } from './category.entity.js';
import { ProductIngredient } from './product-ingredient.entity.js';

//Productos
@Entity('products')
export class Product extends Base {
    @Column({ type: 'varchar', length: 100, unique: true })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column(DECIMAL)
    price: number;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @Column({ type: 'int' })
    category_id: number;

    //Relacion muchos a uno con categoria (a que categoria pertenece el producto)
    @ManyToOne(() => Category, (category) => category.products, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'category_id' })
    category: Relation<Category>;

    //Relacion muchos a muchos con ingredientes (que ingredientes lleva el producto y en que cantidad)
    @OneToMany(() => ProductIngredient, (line) => line.product)
    recipes: ProductIngredient[];
}

