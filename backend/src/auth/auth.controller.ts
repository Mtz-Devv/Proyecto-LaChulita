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

@Controller()
export class AuthController {
    constructor(

        @InjectRepository(User) private readonly userRepository: Repository<User>,

        private readonly jwtService: JwtService,
    ) { }

    @Public()
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: LoginDto) {

        const found = await this.userRepository.findOne({
            where: { email: body.email },
            select: { id: true, password: true },
        });

        if (!found || !(await compare(body.password, found.password))) {
            throw new UnprocessableEntityException('Correo o contraseña incorrectos.');
        }

        const user = await this.userRepository.findOne({
            where: { id: found.id },
            relations: { role: true },
        });

        return {
            token: await this.jwtService.signAsync({ sub: found.id }),
            user,
        };
    }

    @Get('me')
    me(@CurrentUser() user: User) {
        return user;
    }

    @Post('logout')
    @HttpCode(200)
    logout() {
        return { message: 'Sesión cerrada' };
    }
}
