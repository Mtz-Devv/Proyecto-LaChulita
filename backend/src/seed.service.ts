import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from './entities/index.js';

//Guarda el id del usuario
export interface JwtPlayload {
    sub: number;
}

//Le dice a nestjs de que manera se van a extraer los tokens y cual va a ser la llave secreta para firmarlos y validar su firma
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        //Inyecta el repositorio de la tabla User para poder hacer consultas
        @InjectRepository(User) private readonly userRepository: Repository<User>,
    ) {
        //Le dice a nestjs de que manera se van a extraer los tokens y cual va a ser la llave secreta para firmarlos y validar su firma
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET as string,
        });
    }

    //Si el usuario existe se devuelve y si no se lanza una excepción
    async validate(payload: JwtPlayload): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
            relations: { role: true },
        });

        //Si el usuario no existe se lanza una excepción
        if (!user) throw new UnauthorizedException('El usuario no existe chiavo');
        return user;
    }
}