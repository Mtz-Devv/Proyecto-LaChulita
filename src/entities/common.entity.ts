import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn, type ValueTransformer } from 'typeorm';

export type Rolename = 'admin' | 'mesero' | 'cantinero';
export type Unit = 'ml' | 'pz' | 'g';

/*
Se pide una disculpa de antemano por la aberracion que esta a punto de presenciar su apreciable vista, de parte de Chemo's Inc. esperamos que
todo el codigo sea entendible
*/

//Aqui se convierte a numero lo que se lee de la base de datos, ponte vrgas chiavito, porque si no se queda como string y no se puede hacer operaciones matematicas con eso
export const toNumber: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) =>
        value === null || value === undefined ? value : Number(value),
};

//Aqui le decimos que la cantidad de dinero es con dos decimales, para no estar repitiendo esto en cada columna chiavito
export const DECIMAL = {
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: toNumber,
} as const;

//Estas son todas las columnas que tienen las tablas de la base de datos, para no repetirlas en cada entidad
export abstract class Base {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

