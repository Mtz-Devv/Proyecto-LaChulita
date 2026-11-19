import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base, DECIMAL } from './common.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { OrderItem } from './order-item.entity.js';
import { User } from './user.entity.js';

//Registro de movimientos del inventario (entradas y salidas)
@Entity('inventory_movements')
export class InventoryMovement extends Base {
    @Column({ type: 'int' })
    ingredient_id: number;

    @Column({ type: 'int' })
    user_id: number;

    //Si el movimiento salio por una venta, aqui queda de que renglon de la cuenta fue,
    //asi al cancelar se regresa EXACTAMENTE lo que se desconto aunque despues cambien la receta chiavito
    @Column({ type: 'int', nullable: true })
    order_item_id: number | null;

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

    //Muchos movimientos pueden salir de un mismo renglon de la cuenta (uno por cada insumo de la receta)
    @ManyToOne(() => OrderItem, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'order_item_id' })
    order_item: Relation<OrderItem> | null;
}

