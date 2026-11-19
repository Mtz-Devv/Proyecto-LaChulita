import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import { emptyToNull } from '../common.js';

/*
DTOs de los catalogos: la forma y las reglas de lo que manda el front, si no las cumple ni entra al controlador chiavito
*/

//Categorias
export class CategoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    //Si el front la manda vacia se guarda como null
    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    description?: string | null;
}

//Metodos de pago
export class PaymentMethodDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    name: string;
}

//Proveedores
export class SupplierDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name: string;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MaxLength(150)
    contact_name?: string | null;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string | null;

    //El emptyToNull va primero para que un correo vacio no truene en el @IsEmail
    @Transform(emptyToNull)
    @IsOptional()
    @IsEmail()
    email?: string | null;
}

//Mesas
export class BarTableDto {
    @IsInt()
    @Min(1)
    number: number;

    //De 1 a 30 personas, mas que eso ya es salon de fiestas chiavito
    @IsInt()
    @Min(1)
    @Max(30)
    capacity: number;
}

//Usuarios
export class UserDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsEmail()
    email: string;

    //Al crear es obligatoria, al editar si viene vacia no se cambia, ponte vrgas
    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string | null;

    @IsInt()
    role_id: number;
}

