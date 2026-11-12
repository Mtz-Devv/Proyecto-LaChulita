import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { Base } from './common.entity.js';
import { Role } from './role.entity.js';

//Usuarios
@Entity('users')
export class User extends Base {
    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 150, unique: true })
    email: string;

    @Column({ type: 'varchar', length: 255, select: false })
    password: string;

    @Column({ type: 'int', nullable: true })
    role_id: number | null;

    @ManyToOne(() => Role, (role) => role.users, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'role_id' })
    role: Relation<Role> | null;
}

