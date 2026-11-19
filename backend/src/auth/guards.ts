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

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: Rolename[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
    (data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest<{ user: User }>().user

);

@Injectable()

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

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<Rolename[] | undefined>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!roles) {
            return true;
        }

        const user = context.switchToHttp().getRequest<{ user?: User }>().user;
        if (!user?.role || !roles.includes(user.role.name)) {
            throw new ForbiddenException("Tu rol no tiene permiso para hacer esto chiavo")
        }
        return true;
    }
}
