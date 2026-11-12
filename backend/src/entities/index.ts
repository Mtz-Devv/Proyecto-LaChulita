import { Role } from './role.entity.js';
import { User } from './user.entity.js';
import { Category } from './category.entity.js';
import { Product } from './product.entity.js';
import { ProductIngredient } from './product-ingredient.entity.js';
import { Supplier } from './supplier.entity.js';
import { Ingredient } from './ingredient.entity.js';
import { IngredientSupplier } from './ingredient-supplier.entity.js';
import { BarTable } from './bar-table.entity.js';
import { PaymentMethod } from './payment-method.entity.js';
import { Order } from './order.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Purchase } from './purchase.entity.js';
import { PurchaseItem } from './purchase-item.entity.js';
import { InventoryMovement } from './inventory-movement.entity.js';

export * from './common.entity.js';
export * from './role.entity.js';
export * from './user.entity.js';
export * from './category.entity.js';
export * from './product.entity.js';
export * from './product-ingredient.entity.js';
export * from './supplier.entity.js';
export * from './ingredient.entity.js';
export * from './ingredient-supplier.entity.js';
export * from './bar-table.entity.js';
export * from './payment-method.entity.js';
export * from './order.entity.js';
export * from './order-item.entity.js';
export * from './purchase.entity.js';
export * from './purchase-item.entity.js';
export * from './inventory-movement.entity.js';

//Lista que usa app.module para iniciar el sistema chiavito
export const entities = [
    Role,
    User,
    Category,
    Product,
    ProductIngredient,
    Supplier,
    Ingredient,
    IngredientSupplier,
    BarTable,
    PaymentMethod,
    Order,
    OrderItem,
    Purchase,
    PurchaseItem,
    InventoryMovement,
];
