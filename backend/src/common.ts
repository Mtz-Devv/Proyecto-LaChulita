import {
    Catch,
    NotFoundException,
    type ArgumentsHost,
    type ExceptionFilter,
} from '@nestjs/common';
import type { TransformFnParams } from 'class-transformer';
import type { Response } from 'express';
import {
    QueryFailedError,
    type Repository,
    type ObjectLiteral,
    type SelectQueryBuilder,
} from 'typeorm';

export const SALT_ROUNDS = 10;

export const FOR_UPDATE = { mode: 'pessimistic_write' } as const;

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export async function paginate<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    page?: string,
    perPage = 10,
): Promise<Paginated<T>> {

    const current = Math.max(1, Number(page) || 1);
    const [data, total] = await query
        .skip((current - 1) * perPage)
        .take(perPage)
        .getManyAndCount();

    return {
        data,
        current_page: current,
        last_page: Math.max(1, Math.ceil(total / perPage)),
        per_page: perPage,
        total,
    };
}

export const money = (value: number) => Math.round(value * 100) / 100;

export async function countChildren<T extends ObjectLiteral>(
    repository: Repository<T>,
    foreignKey: string,
    parentIds: number[],
): Promise<Map<number, number>> {
    if (!parentIds.length) return new Map();
    const rows = await repository
        .createQueryBuilder('child')
        .select(`child.${foreignKey}`, 'parent_id')
        .addSelect('COUNT(child.id)', 'total')
        .where(`child.${foreignKey} IN (:...parentIds)`, { parentIds })
        .groupBy(`child.${foreignKey}`)
        .getRawMany<{ parent_id: string; total: string }>();
    return new Map(rows.map((row) => [Number(row.parent_id), Number(row.total)]));
}

export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

export function orFail<T>(entity: T | null, label = 'El registro'): T {
    if (!entity) throw new NotFoundException(`${label} no existe.`);
    return entity;
}

export const emptyToNull = ({ value }: TransformFnParams): unknown =>
    value === '' ? null : value;

export function corsOrigin(): true | string[] {
    const origin = process.env.CORS_ORIGIN?.trim();
    return !origin || origin === '*'
        ? true
        : origin.split(',').map((item) => item.trim());
}

const RELATED = 'No se puede borrar porque tiene registros relacionados.';

const DB_ERRORS: Record<string, [number, string]> = {
    ER_DUP_ENTRY: [409, 'Ya existe un registro con ese valor (por ejemplo, el mismo nombre).'],
    ER_ROW_IS_REFERENCED: [409, RELATED],
    ER_ROW_IS_REFERENCED_2: [409, RELATED],
    ER_NO_REFERENCED_ROW_2: [422, 'Uno de los datos apunta a un registro que no existe.'],
};

@Catch(QueryFailedError)
export class DatabaseErrorFilter implements ExceptionFilter {
    catch(error: QueryFailedError, host: ArgumentsHost) {
        const code = (error.driverError as Error & { code?: string })?.code ?? '';
        const [status, message] = DB_ERRORS[code] ?? [500, 'Error en la base de datos.'];

        if (status === 500) console.error(error);

        const response = host.switchToHttp().getResponse<Response>();
        response.status(status).json({ statusCode: status, message });
    }
}
