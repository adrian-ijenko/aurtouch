import { EventEmitter } from 'node:events';
import * as net from 'node:net';
import {
  ADDRESS,
  HEADER,
  SUBMSG_AC_STAT,
  SUBMSG_GROUP_STAT,
  acSetFanSpeed,
  acSetHeatingCooling,
  acSetTargetTemp,
  buildFrame,
  decodeAcStatus,
  decodeGroupStatus,
  requestAcStatus,
  requestGroupStatus,
  verifyFrameCrc,
  zoneSetActive as buildZonePower,
  zoneSetDamper as buildZoneDamper,
  type AcStatus,
  type GroupStatus,
} from './protocol';

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
  log: { debug: (m: string) => void; info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

/**
 * TCP client for AirTouch 2+ touch panel (default port 9200).
 * Emits `ac_status`, `group_status`, `connected`, `disconnected`, `error`.
 */
export class AirtouchClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private rx = Buffer.alloc(0);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private readonly opts: AirtouchClientOptions) {
    super();
  }

  private wire(msg: string): void {
    if (this.opts.verboseWire) this.opts.log.info(msg);
    else this.opts.log.debug(msg);
  }

  connect(): void {
    if (this.destroyed) return;
    const port = this.opts.port ?? 9200;
    this.clearReconnect();
    this.socket = new net.Socket();
    this.socket.setKeepAlive(true, 30000);

    this.socket.on('connect', () => {
      this.opts.log.info(`AirTouch: connected to ${this.opts.host}:${port}`);
      this.emit('connected');
      this.sendRaw(requestAcStatus());
      setTimeout(() => this.sendRaw(requestGroupStatus()), 2000);
      if (!this.opts.disableAutoPolling) this.startPolling();
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.rx = Buffer.concat([this.rx, chunk]);
      this.drainRx();
    });

    this.socket.on('close', () => {
      this.opts.log.warn('AirTouch: connection closed');
      this.stopPolling();
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.socket.on('error', (err: Error) => {
      this.opts.log.error(`AirTouch: socket error: ${err.message}`);
      this.emit('error', err);
      try {
        this.socket?.destroy();
      } catch {
        /* ignore */
      }
    });

    this.socket.connect(port, this.opts.host);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnect();
    this.stopPolling();
    try {
      this.socket?.destroy();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  sendRaw(body: Buffer): void {
    if (!this.socket || this.socket.destroyed) return;
    const frame = buildFrame(body);
    this.wire(`AirTouch: TX sub=0x${body[0].toString(16)} payload=${body.toString('hex')} frame=${frame.toString('hex')}`);
    this.socket.write(frame);
  }

  requestRefresh(): void {
    this.sendRaw(requestAcStatus());
    this.sendRaw(requestGroupStatus());
  }

  acSetHeatingCoolingState(unit: number, state: 0 | 1 | 2 | 3): void {
    this.sendRaw(acSetHeatingCooling(unit, state));
  }

  acSetTargetTemperature(unit: number, temp: number): void {
    this.sendRaw(acSetTargetTemp(unit, temp));
  }

  acSetFanSpeedNumber(unit: number, speed: number): void {
    this.sendRaw(acSetFanSpeed(unit, speed));
  }

  zoneSetActive(group: number, on: boolean): void {
    this.sendRaw(buildZonePower(group, on));
  }

  zoneSetDamperPosition(group: number, position: number): void {
    this.sendRaw(buildZoneDamper(group, position));
  }

  private startPolling(): void {
    this.stopPolling();
    const ms = this.opts.pollIntervalMs ?? 285_000;
    this.pollTimer = setInterval(() => {
      this.sendRaw(requestGroupStatus());
    }, ms);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.clearReconnect();
    const delay = this.opts.reconnectDelayMs ?? 10_000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private drainRx(): void {
    while (this.rx.length >= 2) {
      if (this.rx[0] !== HEADER[0] || this.rx[1] !== HEADER[1]) {
        this.rx = this.rx.subarray(1);
        continue;
      }
      if (this.rx.length < 8) return;
      const header6 = this.rx.subarray(0, 6);
      if (header6[3] !== ADDRESS[0]) {
        this.opts.log.warn('AirTouch: unexpected address in header');
        this.rx = this.rx.subarray(1);
        continue;
      }
      const lenBuf = this.rx.subarray(6, 8);
      const dataLen = lenBuf.readUInt16BE(0);
      const frameLen = 8 + dataLen + 2;
      if (this.rx.length < frameLen) return;
      const data = this.rx.subarray(8, 8 + dataLen);
      const crcBuf = this.rx.subarray(8 + dataLen, frameLen);
      this.rx = this.rx.subarray(frameLen);

      if (!verifyFrameCrc(header6, lenBuf, data, crcBuf)) {
        this.opts.log.warn('AirTouch: CRC mismatch, dropping frame');
        continue;
      }

      this.wire(`AirTouch: RX data=${data.toString('hex')} (len=${data.length})`);

      const sub = data[0];
      if (sub === SUBMSG_GROUP_STAT) {
        const groups = decodeGroupStatus(data);
        this.emit('group_status', groups);
      } else if (sub === SUBMSG_AC_STAT) {
        const acs = decodeAcStatus(data);
        this.emit('ac_status', acs);
      } else {
        this.opts.log.warn(
          `AirTouch: RX unknown sub-message 0x${sub.toString(16)} — panel may use extra message types`
        );
      }
    }
  }
}
