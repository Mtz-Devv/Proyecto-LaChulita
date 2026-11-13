import { Transform, Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { emptyToNull } from '../common.js';

/*
DTOs de la operacion del bar: cuentas, cobros y compras a proveedores
*/

//Abrir una cuenta en una mesa libre
export class OpenOrderDto {
    @IsInt()
    bar_table_id: number;
}

//Agregar un producto a la cuenta
export class AddItemDto {
    @IsInt()
    product_id: number;

    //Mas de 50 de golpe ya es sospechoso chiavito
    @IsInt()
    @Min(1)
    @Max(50)
    quantity: number;

    //"sin hielo", "doble", lo que pida el cliente, si viene vacia se guarda como null chiavito
    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MaxLength(100)
    notes?: string | null;
}

//Cobrar la cuenta
export class CloseOrderDto {
    @IsInt()
    payment_method_id: number;

    //La propina es opcional, pero nmms no seas codo
    @IsOptional()
    @IsNumber()
    @Min(0)
    tip?: number;
}

//Un renglon de la compra al proveedor
export class PurchaseLineDto {
    @IsInt()
    ingredient_id: number;

    @IsNumber()
    @Min(0.01)
    quantity: number;

    @IsNumber()
    @Min(0)
    unit_cost: number;
}

//La compra completa, minimo debe traer un renglon
export class PurchaseDto {
    @IsInt()
    supplier_id: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PurchaseLineDto)
    items: PurchaseLineDto[];
}

