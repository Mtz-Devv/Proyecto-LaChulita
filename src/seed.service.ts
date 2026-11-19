import { Injectable, Logger } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import { SALT_ROUNDS } from './common.js';
import {
    BarTable,
    Category,
    Ingredient,
    IngredientSupplier,
    PaymentMethod,
    Product,
    ProductIngredient,
    Role,
    Supplier,
    User,
    type Unit,
} from './entities/index.js';

//El seed llena la base con datos de prueba, para no estar capturando todo a mano cada vez que la borras chiavito
@Injectable()
export class SeedService {
    private readonly logger = new Logger(SeedService.name);

    constructor(private readonly dataSource: DataSource) { }

    async run() {
        //Borra TODAS las tablas y las vuelve a crear a partir de las entidades, cuidado chiavito que no hay vuelta atras
        await this.dataSource.synchronize(true);
        const manager = this.dataSource.manager;

        //Roles y un usuario de cada uno (contraseña de todos: password123)
        const [admin, mesero, cantinero] = await manager.save(
            manager.create(Role, [{ name: 'admin' }, { name: 'mesero' }, { name: 'cantinero' }]),
        );

        //La contraseña se guarda encriptada, nunca como texto, ponte vrgas
        const password = await hash('password123', SALT_ROUNDS);
        const people: [string, string, Role][] = [
            ['Ana Admin', 'admin@bar.com', admin],
            ['Mario Mesero', 'mesero@bar.com', mesero],
            ['Carla Cantinera', 'cantinero@bar.com', cantinero],
        ];
        for (const [name, email, role] of people) {
            await manager.save(manager.create(User, { name, email, password, role_id: role.id }));
        }

        //Catalogos sencillos
        await manager.save(
            manager.create(PaymentMethod, [
                { name: 'Efectivo' },
                { name: 'Tarjeta' },
                { name: 'Transferencia' },
            ]),
        );

        //Se guardan por nombre para poder usarlas abajo cuando se cree el menu
        const categories: Record<string, Category> = {};
        for (const name of ['Cervezas', 'Cócteles', 'Destilados', 'Sin alcohol', 'Botanas']) {
            categories[name] = await manager.save(manager.create(Category, { name }));
        }

        //Mesas: [numero, capacidad], todas empiezan libres
        const tables = [[1, 4], [2, 4], [3, 2], [4, 2], [5, 6], [6, 4], [7, 8], [8, 4]];
        for (const [number, capacity] of tables) {
            await manager.save(manager.create(BarTable, { number, capacity }));
        }

        //Insumos: clave → [nombre, unidad, stock, minimo, costo]
        const ingredientData: Record<string, [string, Unit, number, number, number]> = {
            tequila: ['Tequila blanco', 'ml', 7000, 1500, 0.35],
            ron: ['Ron blanco', 'ml', 5000, 1000, 0.28],
            vodka: ['Vodka', 'ml', 4000, 1000, 0.3],
            triple: ['Triple sec', 'ml', 2000, 500, 0.25],
            limon: ['Jugo de limón', 'ml', 3000, 800, 0.05],
            jarabe: ['Jarabe natural', 'ml', 2000, 500, 0.03],
            cola: ['Refresco de cola', 'ml', 12000, 3000, 0.02],
            mineral: ['Agua mineral', 'ml', 12000, 3000, 0.02],
            menta: ['Hierbabuena', 'g', 500, 100, 0.1],
            clara: ['Cerveza clara (botella)', 'pza', 120, 24, 18],
            oscura: ['Cerveza oscura (botella)', 'pza', 60, 24, 20],
            papas: ['Papas fritas (bolsa)', 'pza', 40, 10, 15],
        };
        const ingredients: Record<string, Ingredient> = {};
        for (const [key, [name, unit, stock, min_stock, cost]] of Object.entries(ingredientData)) {
            ingredients[key] = await manager.save(
                manager.create(Ingredient, { name, unit, stock, min_stock, cost }),
            );
        }

        //Proveedores y lo que surten (MUCHOS A MUCHOS con precio)
        const licores = await manager.save(
            manager.create(Supplier, {
                name: 'Licores del Norte',
                contact_name: 'Juan Pérez',
                phone: '5550000001',
                email: 'ventas@licoresnorte.com',
            }),
        );
        const abarrotes = await manager.save(
            manager.create(Supplier, {
                name: 'Abarrotes La Central',
                contact_name: 'Ana López',
                phone: '5550000002',
                email: 'pedidos@lacentral.com',
            }),
        );

        //Guarda los renglones en ingredient_supplier: { clave del insumo: precio }
        const supplies = async (supplier: Supplier, prices: Record<string, number>) => {
            for (const [key, price] of Object.entries(prices)) {
                await manager.insert(IngredientSupplier, {
                    ingredient_id: ingredients[key].id,
                    supplier_id: supplier.id,
                    price,
                });
            }
        };
        await supplies(licores, {
            tequila: 0.35,
            ron: 0.28,
            vodka: 0.3,
            triple: 0.25,
            clara: 18,
            oscura: 20,
        });
        await supplies(abarrotes, {
            limon: 0.05,
            jarabe: 0.03,
            cola: 0.02,
            mineral: 0.02,
            menta: 0.1,
            papas: 15,
            clara: 19, //La cerveza clara la surten los dos, el que la de mas barata gana chiavito
        });

        //Menu con su receta (MUCHOS A MUCHOS con cantidad)
        //[nombre, precio, categoria, { clave del insumo: cantidad por porcion }]
        const menu: [string, number, string, Record<string, number>][] = [
            ['Cerveza clara', 55, 'Cervezas', { clara: 1 }],
            ['Cerveza oscura', 60, 'Cervezas', { oscura: 1 }],
            ['Margarita', 120, 'Cócteles', { tequila: 60, triple: 30, limon: 30 }],
            ['Mojito', 110, 'Cócteles', { ron: 60, limon: 30, jarabe: 20, menta: 5, mineral: 60 }],
            ['Cuba libre', 95, 'Cócteles', { ron: 60, cola: 150, limon: 10 }],
            ['Vodka mineral', 100, 'Cócteles', { vodka: 60, mineral: 150, limon: 10 }],
            ['Caballito de tequila', 80, 'Destilados', { tequila: 45 }],
            ['Refresco de cola', 35, 'Sin alcohol', { cola: 355 }],
            ['Limonada mineral', 45, 'Sin alcohol', { limon: 60, jarabe: 30, mineral: 250 }],
            ['Papas fritas', 50, 'Botanas', { papas: 1 }],
        ];
        for (const [name, price, category, recipe] of menu) {
            const product = await manager.save(
                manager.create(Product, { name, price, category_id: categories[category].id }),
            );
            for (const [key, quantity] of Object.entries(recipe)) {
                await manager.insert(ProductIngredient, {
                    product_id: product.id,
                    ingredient_id: ingredients[key].id,
                    quantity,
                });
            }
        }

        this.logger.log('Base lista: 3 usuarios, 8 mesas, 12 insumos y 10 productos.');
    }
}
