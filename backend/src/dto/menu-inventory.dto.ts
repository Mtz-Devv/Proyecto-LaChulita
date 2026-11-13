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

/*
DTOs del menu y del inventario, aqui viven las dos relaciones muchos a muchos que el usuario edita desde el front
*/

//Un renglon de la receta: { ingredient_id: 1, quantity: 60 }
export class RecipeLineDto {
    @IsInt()
    ingredient_id: number;

    @IsNumber()
    @Min(0.01)
    quantity: number;
}

//Productos con su receta
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

    //La receta completa (MUCHOS A MUCHOS), el @Type hace que cada renglon se valide con RecipeLineDto chiavito
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RecipeLineDto)
    recipe?: RecipeLineDto[];
}

//Insumos con sus proveedores, el stock NO viene aqui porque solo cambia con ventas, compras y ajustes
export class IngredientDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    //Las mismas unidades que tiene la entidad Ingredient
    @IsIn(['ml', 'pza', 'g'])
    unit: Unit;

    @IsNumber()
    @Min(0)
    min_stock: number;

    @IsNumber()
    @Min(0)
    cost: number;

    //Los proveedores que lo surten: [1, 2] (MUCHOS A MUCHOS)
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    supplier_ids?: number[];
}

//Ajuste de inventario: lo que de verdad hay en la bodega despues de contar
export class AdjustDto {
    @IsNumber()
    @Min(0)
    stock: number; //La cantidad REAL contada, no la diferencia

    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    reason: string;
}

