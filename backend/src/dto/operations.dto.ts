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

export class OpenOrderDto {
    @IsInt()
    bar_table_id: number;
}

export class AddItemDto {
    @IsInt()
    product_id: number;

    @IsInt()
    @Min(1)
    @Max(50)
    quantity: number;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    @MaxLength(100)
    notes?: string | null;
}

export class CloseOrderDto {
    @IsInt()
    payment_method_id: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    tip?: number;
}

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

export class PurchaseDto {
    @IsInt()
    supplier_id: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PurchaseLineDto)
    items: PurchaseLineDto[];
}
