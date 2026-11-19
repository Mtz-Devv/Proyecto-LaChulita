import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn, type ValueTransformer } from 'typeorm';

export type Rolename = 'admin' | 'mesero' | 'cantinero';
export type Unit = 'ml' | 'pza' | 'g';

export const toNumber: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) =>
        value === null || value === undefined ? value : Number(value),
};

export const DECIMAL = {
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: toNumber,
} as const;

export abstract class Base {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
