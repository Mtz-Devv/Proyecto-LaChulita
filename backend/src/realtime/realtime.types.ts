import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { Rolename } from '../entities/index.js';

export const REALTIME_TOPICS = [
    'tables',
    'orders',
    'bar-queue',
    'ingredients',
    'movements',
    'purchases',
    'products',
    'categories',
    'payment-methods',
    'suppliers',
    'users',
    'dashboard',
] as const;

export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

export const ROLE_NAMES: readonly Rolename[] = ['admin', 'mesero', 'cantinero'];

export const TOPIC_ROLES: Record<RealtimeTopic, Rolename[]> = {
    tables: ['admin', 'mesero', 'cantinero'],
    orders: ['admin', 'mesero'],
    'bar-queue': ['admin', 'cantinero'],
    ingredients: ['admin', 'cantinero'],
    movements: ['admin'],
    purchases: ['admin'],
    products: ['admin', 'mesero', 'cantinero'],
    categories: ['admin', 'mesero', 'cantinero'],
    'payment-methods': ['admin', 'mesero', 'cantinero'],
    suppliers: ['admin'],
    users: ['admin'],
    dashboard: ['admin'],
};

export interface SyncEvent {
    topics: RealtimeTopic[];
    action: string;
    id?: number;
    order_id?: number;
    table_id?: number;
    owner_id?: number;
    actor_id?: number;
    at: string;
}

export interface NotifyEvent {
    kind: 'info' | 'success' | 'warning';
    title: string;
    message: string;
    topic?: RealtimeTopic;
    order_id?: number;
    at: string;
}

export interface SessionEvent {
    action: 'updated' | 'deleted';
}

export interface ServerToClientEvents {
    sync: (event: SyncEvent) => void;
    notify: (event: NotifyEvent) => void;
    session: (event: SessionEvent) => void;
}

export interface SocketUser {
    id: number;
    name: string;
    role: Rolename | null;
}

export interface SocketData {
    user: SocketUser;
    exp?: number;
}

export type RealtimeServer = Server<DefaultEventsMap, ServerToClientEvents, DefaultEventsMap, SocketData>;

export type RealtimeSocket = Socket<DefaultEventsMap, ServerToClientEvents, DefaultEventsMap, SocketData>;
