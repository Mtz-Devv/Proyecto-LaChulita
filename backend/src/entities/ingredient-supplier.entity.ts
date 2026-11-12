import { Column, Entity, JoinColumn, ManyToOne, Unique, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { Supplier } from './supplier.entity.js';

//Entidad intermedia para la relacion muchos a muchos entre ingredientes y proveedores, para saber que proveedor surte que ingrediente y a que precio chiavito
@Entity('ingredient_supplier')
@Unique(['ingredient_id', 'supplier_id']) //Aqui le decimos que no se puede repetir la misma combinacion de ingrediente y proveedor en una misma tabla
export class IngredientSupplier extends Base {
    @Column({ type: 'int' })
    ingredient_id: number;

    @Column({ type: 'int' })
    supplier_id: number;

    //EL ultimo precio que nos dio el proveedor ratero, para que no te estafen chiavito (PONTE VRGAS)
    @Column({ ...DECIMAL, nullable: true })
    price: number | null;

    //Relacion muchos a uno con ingrediente (que ingrediente surte el proveedor)
    @ManyToOne(() => Ingredient, (ingredient) => ingredient.suppliers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;

    //Relacion muchos a uno con proveedor (que proveedor surte el ingrediente) ponte vrgas chiavito
    @ManyToOne(() => Supplier, (supplier) => supplier.ingredients, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'supplier_id' })
    supplier: Relation<Supplier>;
}

