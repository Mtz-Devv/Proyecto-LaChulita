import { Injectable, Logger } from '@nestjs/common';
import { money } from '../common.js';
import type { Ingredient, Rolename } from '../entities/index.js';
import {
    ROLE_NAMES,
    TOPIC_ROLES,
    type NotifyEvent,
    type RealtimeServer,
    type RealtimeTopic,
    type SyncEvent,
} from './realtime.types.js';

export interface NotifyTarget {
    roles?: Rolename[];
    userIds?: number[];
    exceptUserId?: number;
}

export interface LowStock {
    ingredient: Pick<Ingredient, 'name' | 'unit' | 'min_stock'>;
    stock: number;
}

@Injectable()
export class RealtimeService {
    private readonly logger = new Logger(RealtimeService.name);
    private server: RealtimeServer | null = null;

    attach(server: RealtimeServer) {
        this.server = server;
    }

    sync(topics: RealtimeTopic[], meta: Omit<SyncEvent, 'topics' | 'at'>) {
        this.send('sync', (server) => {
            const unique = [...new Set(topics)];
            const at = new Date().toISOString();
            for (const role of ROLE_NAMES) {
                const visible = unique.filter((topic) => TOPIC_ROLES[topic].includes(role));
                if (visible.length) {
                    server.to(`role:${role}`).emit('sync', { ...meta, topics: visible, at });
                }
            }
        });
    }

    notify(target: NotifyTarget, event: Omit<NotifyEvent, 'at'>) {
        this.send('notify', (server) => {
            const rooms = [
                ...(target.roles ?? []).map((role) => `role:${role}`),
                ...(target.userIds ?? []).map((id) => `user:${id}`),
            ];
            if (!rooms.length) return;

            const audience = target.exceptUserId === undefined
                ? server.to(rooms)
                : server.to(rooms).except(`user:${target.exceptUserId}`);
            audience.emit('notify', { ...event, at: new Date().toISOString() });
        });
    }

    notifyLowStock(items: LowStock[]) {
        for (const { ingredient, stock } of items) {
            this.notify(
                { roles: ['admin', 'cantinero'] },
                {
                    kind: 'warning',
                    title: 'Insumo por agotarse',
                    message: `${ingredient.name}: quedan ${money(stock)} ${ingredient.unit} (mínimo ${money(ingredient.min_stock)})`,
                    topic: 'ingredients',
                },
            );
        }
    }

    userUpdated(userId: number, roleName: Rolename | null) {
        this.send('session', (server) => {
            const room = `user:${userId}`;
            server.in(room).socketsLeave(ROLE_NAMES.map((role) => `role:${role}`));
            if (roleName) server.in(room).socketsJoin(`role:${roleName}`);
            server.to(room).emit('session', { action: 'updated' });
        });
    }

    userDeleted(userId: number) {
        this.send('session', (server) => {
            const room = `user:${userId}`;
            server.to(room).emit('session', { action: 'deleted' });
            server.in(room).disconnectSockets(true);
        });
    }

    private send(event: string, emit: (server: RealtimeServer) => void) {
        if (!this.server) return;
        try {
            emit(this.server);
        } catch (error) {
            this.logger.warn(
                `No se pudo enviar "${event}" en tiempo real: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
