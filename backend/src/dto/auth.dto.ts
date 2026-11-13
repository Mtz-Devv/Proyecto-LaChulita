import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

//Lo que manda el front para iniciar sesion, si falta algo el ValidationPipe responde 422 antes de llegar al controlador
export class LoginDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}

