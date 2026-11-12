import { Column, Entity, OneToMany } from 'typeorm';
import { Base } from './common.entity.js';
import { IngredientSupplier } from './ingredient-supplier.entity.js';

//Proveedores
@Entity('suppliers')
export class Supplier extends Base {
    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 150, nullable: true })
    contact_name: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    email: string | null;

    //Relacion de muchos a muchos a traves de la tabla intermedia IngredientSupplier
    @OneToMany(() => IngredientSupplier, (link) => link.supplier)
    ingredients: IngredientSupplier[];
}

