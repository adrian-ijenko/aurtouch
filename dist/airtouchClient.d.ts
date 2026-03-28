import { EventEmitter } from 'node:events';
import { type AcStatus, type GroupStatus } from './protocol';
export type { AcStatus, GroupStatus };
export interface AirtouchClientOptions {
    host: string;
    port?: number;
    pollIntervalMs?: number;
    reconnectDelayMs?: number;
    /** Log every TCP frame payload (hex) at info level — use platform `debug: true`. */
    verboseWire?: boolean;
    /** Do not start periodic group-status polling (for CLI probe tools). */
    disableAutoPolling?: boolean;
    log: {
        debug: (m: string) => void;
        info: (m: string) => void;
        warn: (m: string) => void;
        error: (m: string) => void;
    };
}
/**
 * TCP client for AirTouch 2+ touch panel (default port 9200).
 * Emits `ac_status`, `group_status`, `connected`, `disconnected`, `error`.
 */
export declare class AirtouchClient extends EventEmitter {
    private readonly opts;
    private socket;
    private rx;
    private pollTimer;
    private reconnectTimer;
    private destroyed;
    /** Commands issued while the socket is down (HomeKit would otherwise silently do nothing). */
    private outboundQueue;
    constructor(opts: AirtouchClientOptions);
    private wire;
    private isSocketOpen;
    connect(): void;
    destroy(): void;
    sendRaw(body: Buffer): void;
    private flushOutboundQueue;
    requestRefresh(): void;
    acSetHeatingCoolingState(unit: number, state: 0 | 1 | 2 | 3): void;
    acSetTargetTemperature(unit: number, temp: number): void;
    acSetFanSpeedNumber(unit: number, speed: number): void;
    zoneSetActive(group: number, on: boolean): void;
    zoneSetDamperPosition(group: number, position: number): void;
    private startPolling;
    private stopPolling;
    private scheduleReconnect;
    private clearReconnect;
    private drainRx;
}
