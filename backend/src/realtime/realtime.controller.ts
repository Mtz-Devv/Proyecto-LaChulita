import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/guards.js';
import type { User } from '../entities/index.js';
import { RealtimeService } from './realtime.service.js';

@Controller('realtime')
export class RealtimeController {
    constructor(private readonly realtime: RealtimeService) { }

    /**
     * Long polling: responde en cuanto hay eventos para este usuario o vacía
     * tras POLL_TIMEOUT_MS. Protegido por el JwtAuthGuard global como el resto.
     */
    @Get('poll')
    @Header('Cache-Control', 'no-store')
    poll(
        @CurrentUser() user: User,
        @Query('cursor') cursor: string | undefined,
        @Res({ passthrough: true }) res: Response,
    ) {
        const closed = new AbortController();
        res.once('close', () => closed.abort());
        return this.realtime.poll(
            { id: user.id, role: user.role?.name ?? null },
            cursor,
            { signal: closed.signal },
        );
    }
}
