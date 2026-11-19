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

/*
Utilidades que comparten los 3 controladores, para no estar copiando y pegando lo mismo en cada uno chiavito
*/

//Vueltas que le da bcrypt a la contraseña para encriptarla, entre mas vueltas mas segura pero mas lenta
export const SALT_ROUNDS = 10;

//SELECT ... FOR UPDATE: aparta el renglon hasta que termine la transaccion, asi dos meseros no se gastan la misma botella al mismo tiempo
export const FOR_UPDATE = { mode: 'pessimistic_write' } as const;

//1. Paginacion: es la forma en que el front espera las listas { data, current_page, last_page, per_page, total }
export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

//Corta la consulta en paginas de 10 en 10 (o las que le digas), para no mandarle al front mil registros de golpe
export async function paginate<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    page?: string,
    perPage = 10,
): Promise<Paginated<T>> {
    //Si mandan una pagina que no es numero o es menor a 1, se va a la pagina 1, no seas tramposo
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

//Redondea el dinero a 2 decimales, porque 0.1 + 0.2 en JavaScript da 0.30000000000000004 y nadie quiere centavos fantasma chiavito
export const money = (value: number) => Math.round(value * 100) / 100;

//Cuenta cuantos hijos tiene cada padre con un solo COUNT ... GROUP BY (por ejemplo cuantos renglones tiene cada cuenta),
//asi no se traen todos los hijos nomas para contarlos y no se descuadra la paginacion
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

//Arma el patron del LIKE escapando % y _ , si no buscar "50%" o "a_b" trae cosas que no son chiavito
export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

//2. Si no se encontro el registro responde 404, para no repetir el mismo if en todos lados
export function orFail<T>(entity: T | null, label = 'El registro'): T {
    if (!entity) throw new NotFoundException(`${label} no existe.`);
    return entity;
}

//3. Para los DTO: si el front manda un input vacio ("") se guarda como null y no como texto vacio
export const emptyToNull = ({ value }: TransformFnParams): unknown =>
    value === '' ? null : value;

//4. Traduce los errores de MySQL a mensajes que el front (y los humanos) si entienden
const RELATED = 'No se puede borrar porque tiene registros relacionados.';

const DB_ERRORS: Record<string, [number, string]> = {
    ER_DUP_ENTRY: [409, 'Ya existe un registro con ese valor (por ejemplo, el mismo nombre).'],
    ER_ROW_IS_REFERENCED: [409, RELATED],
    ER_ROW_IS_REFERENCED_2: [409, RELATED],
    ER_NO_REFERENCED_ROW_2: [422, 'Uno de los datos apunta a un registro que no existe.'],
};

//En vez de revisar a mano si ya existe o si tiene hijos, dejamos que MySQL lo cuide y aqui solo traducimos su error, ponte vrgas
@Catch(QueryFailedError)
export class DatabaseErrorFilter implements ExceptionFilter {
    catch(error: QueryFailedError, host: ArgumentsHost) {
        const code = (error.driverError as Error & { code?: string })?.code ?? '';
        const [status, message] = DB_ERRORS[code] ?? [500, 'Error en la base de datos.'];

        //Si es un error que no conocemos, el detalle sale en la terminal para que lo puedas revisar chiavito
        if (status === 500) console.error(error);

        const response = host.switchToHttp().getResponse<Response>();
        response.status(status).json({ statusCode: status, message });
    }
}

