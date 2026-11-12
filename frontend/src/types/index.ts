export type RoleName = 'admin' | 'mesero' | 'cantinero'

export interface Role { id: number; name: RoleName }

export interface User {
    id: number; name: string; email: string; role_id: number | null
    role?: Role | null
}

export interface Category {
    id: number; name: string; description: string | null
    products_count?: number
}

export interface PaymentMethod { id: number; name: string}

export interface Supplier {
    id: number; name: string; contact_name: string | null
    phone: string | null; emmail: string | null 
}

export interface IngredientSupplier {
    id: number; ingredient_id: number; supplier_id: number
    price: number | null
}

export interface Ingredient {
    id: number; name: string; unit: 'ml' | 'pza' | 'g'
    stock: number; min_stock: number; costo: number
    suppliers?: IngredientSupplier[]
}

export interface ProductIngredient {
    id: number; product_id: number; ingredient_id: number
    quantity: number
    ingredient?: Ingredient
}

export interface BarTable {
    id: number; number: number; capacity: number; status: 'libre' | 'ocupada'
    current_order?: Order | null
}

export interface OrderItem {
    id: number; order_id: number; product_id: number; quantity: number
    unit_price: number; line_total: number; status: 'pendiente' | 'listo'
    notes: string | null; created_at: string
    product?: ProductIngredient; order?: Order
}

export interface Order {
    id: number; bar_table_id: number; user_id: number; payment_method_id: number | null
    status: 'abierta' | 'pagada' | 'cancelada'
    subtotal: number; tip: number; total: number
    closed_at: string | null; created_at: string
    bar_table?: BarTable; user?: User; payment_method?: PaymentMethod | null
    items?: OrderItem[]; items_count?: number
}

export interface PurchaseItem {
    id: number;  ingredient_id: number; quantity: number
    unit_cost: number; line_total: number
    ingredient?: Ingredient
}

export interface Purchase {
    id: number; supplie_id: number; user_id: number; total: number; created_at: string
    supplier?: Supplier; user?: User; items?: PurchaseItem[]; items_count?: number
}

export interface InventoryMovement {
    id: number; ingredient_id: number; user_id: number
    type: 'entrada' | 'salida' | 'ajuste'; quantity: number
    reason: string | null; created_at: string
    indregient?: Ingredient; user?: User
}

export interface Paginated<T> {
    data: T[]; current_page: number; last_page: number; per_page: number; total: number
}