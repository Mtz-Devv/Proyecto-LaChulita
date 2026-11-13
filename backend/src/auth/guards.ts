import {
    ForbiddenException,
    Injectable,
    SetMetadata,
    createParamDecorator,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Rolename, User } from '../entities/index.js';

const IS_PUBLIC_KEY = 'isPublic';
const ROLES_KEY = 'roles';

//La ruta se puede usar sin token (solo en el login)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

//Solo los roles de mesero y admin pueden acceder a esta ruta
export const Roles = (...roles: Rolename[]) => SetMetadata(ROLES_KEY, roles);

//Obtener el usuario actual (user = user que viene del jwt)
export const CurrentUser = createParamDecorator(
    (data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest<{ user: User }>().user

);

//Perro guardian 1, verifica que el token sea válido buscando en las rutas si es pública o no 
@Injectable()
//Decide si una petición HTTP puede pasar o si debe exigir un token JWT válido antes de llegar al controlador.
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;
        return super.canActivate(context);

    }
}

//Perro guardian 2, se encarga de verificar si el usuario tiene el rol necesario para entrar a la ruta
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    //devuelve true si el usuario tiene el rol necesario
    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<Rolename[] | undefined>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!roles) {
            return true; //Si no se define ningun rol en la ruta, se permite el acceso
        }

        //Si el usuario no tiene el rol necesario, se lanza una excepción, ponte vrgas chiavo
        const user = context.switchToHttp().getRequest<{ user?: User }>().user;
        if (!user?.role || !roles.includes(user.role.name)) {
            throw new ForbiddenException("Tu rol no tiene permiso para hacer esto chiavo")
        }
        return true; //Si el usuario tiene el rol necesario, se permite el acceso chiavito
    }
}
