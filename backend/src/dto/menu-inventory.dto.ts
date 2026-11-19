import { Transform, Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { emptyToNull } from '../common.js';
import type { Unit } from '../entities/index.js';

export class RecipeLineDto {
    @IsInt()
    ingredient_id: number;

    @IsNumber()
    @Min(0.01)
    quantity: number;
}

export class ProductDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @Transform(emptyToNull)
    @IsOptional()
    @IsString()
    description?: string | null;

    @IsNumber()
    @Min(0)
    price: number;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsInt()
    category_id: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecipeLineDto)
    recipe?: RecipeLineDto[];
}

export class IngredientDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsIn(['ml', 'pza', 'g'])
    unit: Unit;

    @IsNumber()
    @Min(0)
    min_stock: number;

    @IsNumber()
    @Min(0)
    cost: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    supplier_ids?: number[];
}

export class AdjustDto {
    @IsNumber()
    @Min(0)
    stock: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    reason: string;
}
