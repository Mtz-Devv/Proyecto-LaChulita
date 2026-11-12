import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { User } from './user.entity.js';

//Registro de movimientos del inventario (entradas y salidas)
@Entity('inventory_movements')
export class InventoryMovement extends Base {
    @Column({ type: 'int' })
    ingredient_id: number;

    @Column({ type: 'int' })
    user_id: number;

    @Column({ type: 'enum', enum: ['entrada', 'salida', 'ajuste'] })
    type: 'entrada' | 'salida' | 'ajuste';

    @Column(DECIMAL)
    quantity: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reason: string | null;

    //Muchos movimientos pueden pertener a un mismo ingrediente pero un ingrediente solo puede pertenecer a un movimiento, ponte vrgas chiavito
    @ManyToOne(() => Ingredient, (ingredient) => ingredient.movements, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;

    //Muchos movimientos pueden ser registrados por un mismo usuario pero un usuario solo puede registrar un movimiento, si chiavito asi son las relaciones (PERO NO TE ENOJES)
    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: Relation<User>;
}

