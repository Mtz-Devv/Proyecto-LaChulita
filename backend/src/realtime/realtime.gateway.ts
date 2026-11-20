import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
    WebSocketGateway,
    type GatewayMetadata,
    type OnGatewayConnection,
    type OnGatewayDisconnect,
    type OnGatewayInit,
} from '@nestjs/websockets';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { corsOrigin } from '../common.js';
import { User } from '../entities/index.js';
import { RealtimeService } from './realtime.service.js';
import type { RealtimeServer, RealtimeSocket } from './realtime.types.js';

const MAX_TIMER_DELAY = 2_147_483_647;

@WebSocketGateway<GatewayMetadata>({
    cors: {
        origin: (requestOrigin, callback) => {
            const allowed = corsOrigin();
            if (allowed === true || !requestOrigin) return callback(null, true);
            callback(null, allowed.includes(requestOrigin));
        },
        credentials: true,
    },
})
export class RealtimeGateway
    implements OnGatewayInit<RealtimeServer>, OnGatewayConnection<RealtimeSocket>, OnGatewayDisconnect<RealtimeSocket> {
    private readonly logger = new Logger(RealtimeGateway.name);
    private readonly expirations = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly realtime: RealtimeService,
        private readonly jwtService: JwtService,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
    ) { }

    afterInit(server: RealtimeServer) {
        this.realtime.attach(server);
        server.use((socket, next) => {
            void this.authenticate(socket).then(
                () => next(),
                () => next(new Error('unauthorized')),
            );
        });
    }

    handleConnection(socket: RealtimeSocket) {
        const { user, exp } = socket.data;
        void socket.join(user.role ? [`user:${user.id}`, `role:${user.role}`] : `user:${user.id}`);

        if (exp !== undefined) {
            const delay = Math.min(Math.max(exp * 1000 - Date.now(), 0), MAX_TIMER_DELAY);
            this.expirations.set(socket.id, setTimeout(() => socket.disconnect(true), delay));
        }
        this.logger.log(`${user.name} se conectó (${user.role ?? 'sin rol'})`);
    }

    handleDisconnect(socket: RealtimeSocket) {
        clearTimeout(this.expirations.get(socket.id));
        this.expirations.delete(socket.id);
        this.logger.log(`${socket.data.user.name} se desconectó`);
    }

    private async authenticate(socket: RealtimeSocket) {
        const token = this.extractToken(socket);
        if (!token) throw new Error('unauthorized');

        const payload = await this.jwtService.verifyAsync<JwtPayload & { exp?: number }>(token);
        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
            relations: { role: true },
        });
        if (!user) throw new Error('unauthorized');

        socket.data.user = { id: user.id, name: user.name, role: user.role?.name ?? null };
        socket.data.exp = payload.exp;
    }

    private extractToken(socket: RealtimeSocket): string | null {
        const { token } = socket.handshake.auth as { token?: unknown };
        if (typeof token === 'string' && token) return token;

        const [scheme, value] = socket.handshake.headers.authorization?.split(' ') ?? [];
        return scheme?.toLowerCase() === 'bearer' && value ? value : null;
    }
}
