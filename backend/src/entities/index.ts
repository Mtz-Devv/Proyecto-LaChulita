import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn, ManyToOne, OneToMany, Unique, type Relation, type ValueTransformer } from 'typeorm';

export type Rolename = 'admin' | 'mesero' | 'cantinero';
export type Unit = 'ml' | 'pz' | 'g';

//Aqui se convierte a numero lo que se lee de la base de datos, ponte vrgas chiavito, porque si no se queda como string y no se puede hacer operaciones matematicas con eso
const toNumber: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) => 
        value === null || value === undefined ? value : Number(value),
};

//Aqui le decimos que la cantidad de dinero es con dos decimales, para no estar repitiendo esto en cada columna chiavito
const DECIMAL = {
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: toNumber,
} as const;

//Estas son todas las columnas que tienen las tablas de la base de datos, para no repetirlas en cada entidad
abstract class Base {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

//Roles
@Entity('roles')
export class Role extends Base {
    @Column({type: 'varchar', length: 50, unique: true})
    name: Rolename;

    @OneToMany(() => User, (user) => user.role)
    users: User[];
}

//Usuarios
@Entity('users')
export class User extends Base {
    @Column({type: 'varchar', length: 100})
    name: string;

    @Column({type: 'varchar', length: 150, unique: true})
    email: string;

    @Column({type: 'varchar', length: 255, select: false})
    password: string;

    @Column({type: 'int', nullable: true})
    role_id: number | null;
     
    @ManyToOne(() => Role, (role) => role.users, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'role_id' })
    role: Relation<Role> | null;
}

//Categorias
@Entity('categories')
export class Category extends Base {
    @Column({type: 'varchar', length: 100, unique: true})
    name: string;

    @Column({type: 'text', nullable: true})
    description: string | null;

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];

    products_count?: number; //No es una columna como tal, es un campo que se puede usar para contar la cantidad de productos que tiene una categoria
}

//Proveedores
@Entity('suppliers')
export class Supplier extends Base {
    @Column({type: 'varchar', length: 150})
    name: string;

    @Column({type: 'varchar', length: 150, nullable: true})
    contact_name: string | null;

    @Column({type: 'varchar', length: 20, nullable: true})
    phone: string | null;

    @Column({type: 'varchar', length: 150, nullable: true})
    email: string | null;

    //Relacion de muchos a muchos a traves de la tabla intermedia IngredientSupplier
    @OneToMany(() => IngredientSupplier, (link) => link.supplier)
    ingredients: IngredientSupplier[];
}

//Ingredientes
@Entity('ingredients')
export class Ingredient extends Base {
    @Column({type: 'varchar', length: 100, unique: true})
    name: string;

    @Column({type: 'enum', enum: ['ml', 'pz', 'g']})
    unit: Unit;

    @Column({ ...DECIMAL, default: 0 })
    stock: number;

    //Es el minimo de stock, abajo de esto avisa que hay que pedir mas, es para no quedarse sin ingredientes
    @Column({ ...DECIMAL, default: 0 })
    min_stock: number;

    @Column({ ...DECIMAL, default: 0 })
    cost: number;

    //Realacion de muchos a muchos con productos (en que recetas se usa la tabla ingrdient_product)
    @OneToMany(() => ProductIngredient, (line) => line.ingredient)
    recipes: ProductIngredient[];

    //Relacion de muchos a muchos con proveedores (quien lo surte y a que precio)
    @OneToMany(() => IngredientSupplier, (link) => link.ingredient)
    suppliers: IngredientSupplier[];

    @OneToMany(() => InventoryMovement, (movement) => movement.ingredient)
    movements: InventoryMovement[];

}

//Productos
@Entity('products')
export class Product extends Base {
    @Column({type: 'varchar', length: 100, unique: true})
    name: string;

    @Column({type: 'text', nullable: true})
    description: string | null;

    @Column(DECIMAL)
    price: number;

    @Column({type: 'boolean', default: true})
    is_active: boolean;

    @Column({type: 'int'})
    category_id: number;

    //Relacion muchos a uno con categoria (a que categoria pertenece el producto)
    @ManyToOne(() => Category, (category) => category.products, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'category_id' })
    category: Relation<Category>;

    //Relacion muchos a muchos con ingredientes (que ingredientes lleva el producto y en que cantidad)
    @OneToMany(() => ProductIngredient, (line) => line.product)
    recipes: ProductIngredient[];
}

@Entity('ingredient_product')
@Unique(['ingredient_id', 'product_id']) //Aqui le decimos que no se puede repetir la misma combinacion de ingrediente y producto en una misma receta
export class ProductIngredient extends Base {
    @Column({type: 'int'})
    product_id: number;

    @Column({type: 'int'})
    ingredient_id: number;

    //Aqui le decimos que la cantidad de ingrediente que lleva el producto es con dos decimales
    @Column(DECIMAL)
    quantity: number;

    //Muchas filas de la receta pueden apuntar al mismo producto, y muchas filas de la receta pueden apuntar al mismo ingrediente, pero no se puede repetir la misma combinacion de producto e ingrediente en una misma receta
    @ManyToOne(() => Product, (product) => product.recipes, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'product_id' })
    product: Relation<Product>;

    //Muchas filas de la receta pueden apuntarn al mismo ingrediente, y muchas filas de la receta pueden apuntar al mismo producto, pero no se puede repetir la misma combinacion de producto e ingrediente en una misma receta
    @ManyToOne(() => Ingredient, (ingredient) => ingredient.recipes, { onDelete: 'RESTRICT' }) //El resctrict es para que no se pueda borrar un ingrediente si ya esta en una receta, y no se pueda borrar un producto si ya tiene ingredientes en su receta
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;
}

//Entidad intermedia para la relacion muchos a muchos entre ingredientes y proveedores, para saber que proveedor surte que ingrediente y a que precio chiavito
@Entity('ingredient_supplier')
@Unique(['ingredient_id', 'supplier_id']) //Aqui le decimos que no se puede repetir la misma combinacion de ingrediente y proveedor en una misma tabla
export class IngredientSupplier extends Base {
    @Column({type: 'int'})
    ingredient_id: number;

    @Column({type: 'int'})
    supplier_id: number;

    //EL ultimo precio que nos dio el proveedor ratero, para que no te estafen chiavito (PONTE VRGAS)
    @Column( {...DECIMAL, nullable: true})
    price: number | null;

    //Relacion muchos a uno con ingrediente (que ingrediente surte el proveedor)
    @ManyToOne(() => Ingredient, (ingredient) => ingredient.suppliers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ingredient_id' })
    ingredient: Relation<Ingredient>;

    //Relacion muchos a uno con proveedor (que proveedor surte el ingrediente) ponte vrgas chiavito
    @ManyToOne(() => Supplier, (supplier) => supplier.ingredient_suppliers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'supplier_id' })
    supplier: Relation<Supplier>;
}

//Mesas
@Entity('bar_tables')
export class BarTable extends Base {
    @Column({ type: 'int', unique: true })
    number: number;

    @Column({ type: 'enum', enum: ['libre', 'ocupada'], default: 'libre' })
    status: 'libre' | 'ocupada';

    @OneToMany(() => Order, (order) => order.bar_table)
    orders: Order[];

    //No es una calumna (es la cuenta abierta de la mesa y se llena con el listado chiavo)
    current_order?: Order | null;
}

//Metodos de pago
@Entity('payment_methods')
export class PaymentMethod extends Base {
    @Column({ type: 'varchar', length: 50, unique: true })
    name: string;

    @OneToMany(() => Order, (order) => order.payment_method)
    orders: Order[];
}

//Ordenes (pedidos)
@Entity('orders')
export class Order extends Base {
    @Column({ type: 'int' })
    bar_table_id: number;

    //Es el mesero que abrio la cuneta chiavo
    @Column({ type: 'int'})
    user_id: number;

    //Se va a llenar cuando se cierre la cuenta chiavo
    @Column({ type: 'int', nullable: true })
    payment_method_id: number | null;\

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

//Items de la orden (productos que se pidieron)
@Entity('order_items')
export class OrderItem extends Base {
    @Column({ type: 'int' })
    order_id: number;

    @Column({ type: 'int' })
    product_id: number;

    @Column({ type: 'int' })
    quantity: number;

    @Column(DECIMAL)
    line_total: number;

    @Column(DECIMAL)
    unit_price: number;

    @Column({ type: 'enum', enum: ['pendiente', 'listo'], default: 'pendiente' })
    status: 'pendiente' | 'listo';

    @Column({ type: 'varchar', length: 100, nullable: true })
    note: string | null;

    @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'order_id' })
    order: Relation<Order>;

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'product_id' })
    product: Relation<Product>;
}

//Compras a proveedores
@Entity('purchases')
export class Purchase extends Base {
    @Column({ type: 'int' })
    supplier_id: number;

    @Column({ type: 'int'})
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

//Insumos de cada compra