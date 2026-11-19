import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    UnprocessableEntityException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcryptjs';
import { Repository } from 'typeorm';
import { LoginDto } from '../dto/index.js';
import { User } from '../entities/index.js';
import { CurrentUser, Public } from './guards.js';

//Controlador del login, aqui se entra al sistema, se pregunta quien soy y se sale
@Controller()
export class AuthController {
    constructor(
        //Repositorio de la tabla users para buscar al que quiere entrar
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        //Servicio que firma los tokens con el JWT_SECRET del .env
        private readonly jwtService: JwtService,
    ) { }

    //POST /api/login, la unica ruta que se puede usar sin token (por eso el @Public)
    @Public()
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: LoginDto) {
        //La contraseña tiene select: false en la entidad, asi que aqui se pide a proposito, si no llega vacia chiavito
        const found = await this.userRepository.findOne({
            where: { email: body.email },
            select: { id: true, password: true },
        });

        //Si no existe el correo o la contraseña no coincide con el hash, responde 422 (no 401, para no confundirlo con "tu sesion vencio")
        if (!found || !(await compare(body.password, found.password))) {
            throw new UnprocessableEntityException('Correo o contraseña incorrectos.');
        }

        //Se vuelve a buscar ya sin la contraseña y con su rol, porque el front necesita saber que puede hacer
        const user = await this.userRepository.findOne({
            where: { id: found.id },
            relations: { role: true },
        });

        //En el token solo va el id del usuario (sub), nunca la contraseña, ponte vrgas
        return {
            token: await this.jwtService.signAsync({ sub: found.id }),
            user,
        };
    }

    //GET /api/me, quien soy (el front lo usa cuando se recarga la pagina)
    @Get('me')
    me(@CurrentUser() user: User) {
        return user;
    }

    //POST /api/logout, el JWT no se guarda en la base de datos, el front solo borra el suyo y listo
    @Post('logout')
    @HttpCode(200)
    logout() {
        return { message: 'Sesión cerrada' };
    }
}
