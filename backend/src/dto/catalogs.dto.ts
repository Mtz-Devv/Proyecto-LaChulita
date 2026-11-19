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

export class CategoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    description?: string | null;
}

export class PaymentMethodDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    name: string;
}

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

    @Transform(emptyToNull)
    @IsOptional()
    @IsEmail()
    email?: string | null;
}

export class BarTableDto {
    @IsInt()
    @Min(1)
    number: number;

    @IsInt()
    @Min(1)
    @Max(30)
    capacity: number;
}

export class UserDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsEmail()
    email: string;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string | null;

    @IsInt()
    role_id: number;
}
