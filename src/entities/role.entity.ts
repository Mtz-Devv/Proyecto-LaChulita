import { Column, Entity, OneToMany } from 'typeorm';
import { Base, type Rolename } from './common.entity.js';
import { User } from './user.entity.js';

//Roles
@Entity('roles')
export class Role extends Base {
    @Column({ type: 'varchar', length: 50, unique: true })
    name: Rolename;

    @OneToMany(() => User, (user) => user.role)
    users: User[];
}

