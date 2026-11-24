import { randomUUID } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { money } from '../common.js';
import type { Ingredient, Rolename } from '../entities/index.js';
import {
    TOPIC_ROLES,
    type NotifyEvent,
    type PollResponse,
    type RealtimeEvent,
    type RealtimeTopic,
    type RealtimeUser,
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

export interface PollOptions {
    /** Al abortarse (el cliente cerró la conexión) se responde de inmediato. */
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** Tiempo máximo que una petición se queda abierta esperando eventos. */
export const POLL_TIMEOUT_MS = 25_000;

/** Eventos que se guardan para quien vuelve tras una desconexión corta. */
export const MAX_EVENTS = 500;

const CURSOR = /^([a-z0-9]+):(\d+)$/;

interface Entry {
    seq: number;
    event: RealtimeEvent;
    target: NotifyTarget;
}

interface Waiter {
    user: RealtimeUser;
    after: number;
    finish: (events?: RealtimeEvent[]) => void;
}

/**
 * Tiempo real por long polling.
 *
 * Cada cambio se guarda en una bitácora en memoria con un número consecutivo.
 * El cliente pide GET /realtime/poll?cursor=...; si ya hay eventos que puede ver
 * se le responden al instante, si no la petición se queda abierta hasta que llegue
 * uno (o hasta POLL_TIMEOUT_MS) y el cliente vuelve a preguntar con el cursor nuevo.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
    /** Cambia en cada arranque: un cursor de un arranque anterior obliga a recargar todo. */
    private readonly stream = randomUUID().replaceAll('-', '').slice(0, 8);
    private readonly log: Entry[] = [];
    private readonly waiters = new Set<Waiter>();
    private seq = 0;
    private flushQueued = false;

    sync(topics: RealtimeTopic[], meta: Omit<SyncEvent, 'topics' | 'at'>) {
        const unique = [...new Set(topics)];
        if (!unique.length) return;
        this.publish({ type: 'sync', data: { ...meta, topics: unique, at: new Date().toISOString() } }, {});
    }

    notify(target: NotifyTarget, event: Omit<NotifyEvent, 'at'>) {
        if (!target.roles?.length && !target.userIds?.length) return;
        this.publish({ type: 'notify', data: { ...event, at: new Date().toISOString() } }, target);
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
        // Las peticiones que ya estaban esperando filtran con el rol nuevo;
        // las siguientes lo leen de la base de datos al autenticarse.
        for (const waiter of this.waiters) {
            if (waiter.user.id === userId) waiter.user = { ...waiter.user, role: roleName };
        }
        this.publish({ type: 'session', data: { action: 'updated' } }, { userIds: [userId] });
    }

    userDeleted(userId: number) {
        // La siguiente petición de ese usuario ya no pasa el JwtAuthGuard (401).
        this.publish({ type: 'session', data: { action: 'deleted' } }, { userIds: [userId] });
    }

    poll(user: RealtimeUser, cursor?: unknown, { signal, timeoutMs = POLL_TIMEOUT_MS }: PollOptions = {}): Promise<PollResponse> {
        const after = this.parseCursor(cursor);
        if (after === null) {
            return Promise.resolve({ cursor: this.head(), reset: true, events: [] });
        }

        const ready = this.collect(after, user);
        if (ready.length || timeoutMs <= 0 || signal?.aborted) {
            return Promise.resolve(this.respond(ready));
        }

        return new Promise<PollResponse>((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const onAbort = () => waiter.finish();
            const waiter: Waiter = {
                user: { ...user },
                after,
                finish: (events = this.collect(after, waiter.user)) => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', onAbort);
                    this.waiters.delete(waiter);
                    resolve(this.respond(events));
                },
            };
            this.waiters.add(waiter);
            timer = setTimeout(onAbort, timeoutMs);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    onModuleDestroy() {
        for (const waiter of this.waiters) waiter.finish();
    }

    private publish(event: RealtimeEvent, target: NotifyTarget) {
        this.log.push({ seq: ++this.seq, event, target });
        if (this.log.length > MAX_EVENTS) this.log.shift();

        // Se despierta a los que esperan en un microtask para mandar juntos los
        // eventos que un mismo controlador publica seguidos (sync + notify...).
        if (this.flushQueued) return;
        this.flushQueued = true;
        queueMicrotask(() => {
            this.flushQueued = false;
            for (const waiter of this.waiters) {
                const events = this.collect(waiter.after, waiter.user);
                if (events.length) waiter.finish(events);
            }
        });
    }

    private respond(events: RealtimeEvent[]): PollResponse {
        return { cursor: this.head(), reset: false, events };
    }

    private head() {
        return `${this.stream}:${this.seq}`;
    }

    /** Devuelve el último número visto o null si hay que recargar todo. */
    private parseCursor(cursor: unknown): number | null {
        if (typeof cursor !== 'string') return null;
        const match = CURSOR.exec(cursor);
        if (!match || match[1] !== this.stream) return null;

        const seq = Number(match[2]);
        const oldest = this.log.length ? this.log[0].seq - 1 : this.seq;
        return seq >= oldest && seq <= this.seq ? seq : null;
    }

    private collect(after: number, user: RealtimeUser): RealtimeEvent[] {
        if (!this.log.length) return [];
        const start = Math.max(0, after - this.log[0].seq + 1);
        const events: RealtimeEvent[] = [];
        for (const entry of this.log.slice(start)) {
            const event = this.visibleTo(entry, user);
            if (event) events.push(event);
        }
        return events;
    }

    private visibleTo({ event, target }: Entry, user: RealtimeUser): RealtimeEvent | null {
        if (event.type === 'sync') {
            const { role } = user;
            if (!role) return null;
            const topics = event.data.topics.filter((topic) => TOPIC_ROLES[topic].includes(role));
            return topics.length ? { type: 'sync', data: { ...event.data, topics } } : null;
        }

        if (target.exceptUserId === user.id) return null;
        const byRole = user.role !== null && !!target.roles?.includes(user.role);
        const byId = !!target.userIds?.includes(user.id);
        return byRole || byId ? event : null;
    }
}
