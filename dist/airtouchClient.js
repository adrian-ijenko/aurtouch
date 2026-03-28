"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirtouchClient = void 0;
const node_events_1 = require("node:events");
const net = __importStar(require("node:net"));
const protocol_1 = require("./protocol");
/**
 * TCP client for AirTouch 2+ touch panel (default port 9200).
 * Emits `ac_status`, `group_status`, `connected`, `disconnected`, `error`.
 */
class AirtouchClient extends node_events_1.EventEmitter {
    opts;
    socket = null;
    rx = Buffer.alloc(0);
    pollTimer = null;
    reconnectTimer = null;
    destroyed = false;
    constructor(opts) {
        super();
        this.opts = opts;
    }
    wire(msg) {
        if (this.opts.verboseWire)
            this.opts.log.info(msg);
        else
            this.opts.log.debug(msg);
    }
    connect() {
        if (this.destroyed)
            return;
        const port = this.opts.port ?? 9200;
        this.clearReconnect();
        this.socket = new net.Socket();
        this.socket.setKeepAlive(true, 30000);
        this.socket.on('connect', () => {
            this.opts.log.info(`AirTouch: connected to ${this.opts.host}:${port}`);
            this.emit('connected');
            this.sendRaw((0, protocol_1.requestAcStatus)());
            setTimeout(() => this.sendRaw((0, protocol_1.requestGroupStatus)()), 2000);
            if (!this.opts.disableAutoPolling)
                this.startPolling();
        });
        this.socket.on('data', (chunk) => {
            this.rx = Buffer.concat([this.rx, chunk]);
            this.drainRx();
        });
        this.socket.on('close', () => {
            this.opts.log.warn('AirTouch: connection closed');
            this.stopPolling();
            this.emit('disconnected');
            this.scheduleReconnect();
        });
        this.socket.on('error', (err) => {
            this.opts.log.error(`AirTouch: socket error: ${err.message}`);
            this.emit('error', err);
            try {
                this.socket?.destroy();
            }
            catch {
                /* ignore */
            }
        });
        this.socket.connect(port, this.opts.host);
    }
    destroy() {
        this.destroyed = true;
        this.clearReconnect();
        this.stopPolling();
        try {
            this.socket?.destroy();
        }
        catch {
            /* ignore */
        }
        this.socket = null;
    }
    sendRaw(body) {
        if (!this.socket || this.socket.destroyed)
            return;
        const frame = (0, protocol_1.buildFrame)(body);
        this.wire(`AirTouch: TX sub=0x${body[0].toString(16)} payload=${body.toString('hex')} frame=${frame.toString('hex')}`);
        this.socket.write(frame);
    }
    requestRefresh() {
        this.sendRaw((0, protocol_1.requestAcStatus)());
        this.sendRaw((0, protocol_1.requestGroupStatus)());
    }
    acSetHeatingCoolingState(unit, state) {
        this.sendRaw((0, protocol_1.acSetHeatingCooling)(unit, state));
    }
    acSetTargetTemperature(unit, temp) {
        this.sendRaw((0, protocol_1.acSetTargetTemp)(unit, temp));
    }
    acSetFanSpeedNumber(unit, speed) {
        this.sendRaw((0, protocol_1.acSetFanSpeed)(unit, speed));
    }
    zoneSetActive(group, on) {
        this.sendRaw((0, protocol_1.zoneSetActive)(group, on));
    }
    zoneSetDamperPosition(group, position) {
        this.sendRaw((0, protocol_1.zoneSetDamper)(group, position));
    }
    startPolling() {
        this.stopPolling();
        const ms = this.opts.pollIntervalMs ?? 285_000;
        this.pollTimer = setInterval(() => {
            this.sendRaw((0, protocol_1.requestGroupStatus)());
        }, ms);
    }
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    scheduleReconnect() {
        if (this.destroyed)
            return;
        this.clearReconnect();
        const delay = this.opts.reconnectDelayMs ?? 10_000;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.destroyed)
                this.connect();
        }, delay);
    }
    clearReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    drainRx() {
        while (this.rx.length >= 2) {
            if (this.rx[0] !== protocol_1.HEADER[0] || this.rx[1] !== protocol_1.HEADER[1]) {
                this.rx = this.rx.subarray(1);
                continue;
            }
            if (this.rx.length < 8)
                return;
            const header6 = this.rx.subarray(0, 6);
            if (header6[3] !== protocol_1.ADDRESS[0]) {
                this.opts.log.warn('AirTouch: unexpected address in header');
                this.rx = this.rx.subarray(1);
                continue;
            }
            const lenBuf = this.rx.subarray(6, 8);
            const dataLen = lenBuf.readUInt16BE(0);
            const frameLen = 8 + dataLen + 2;
            if (this.rx.length < frameLen)
                return;
            const data = this.rx.subarray(8, 8 + dataLen);
            const crcBuf = this.rx.subarray(8 + dataLen, frameLen);
            this.rx = this.rx.subarray(frameLen);
            if (!(0, protocol_1.verifyFrameCrc)(header6, lenBuf, data, crcBuf)) {
                this.opts.log.warn('AirTouch: CRC mismatch, dropping frame');
                continue;
            }
            this.wire(`AirTouch: RX data=${data.toString('hex')} (len=${data.length})`);
            const sub = data[0];
            if (sub === protocol_1.SUBMSG_GROUP_STAT) {
                const groups = (0, protocol_1.decodeGroupStatus)(data);
                this.emit('group_status', groups);
            }
            else if (sub === protocol_1.SUBMSG_AC_STAT) {
                const acs = (0, protocol_1.decodeAcStatus)(data);
                this.emit('ac_status', acs);
            }
            else {
                this.wire(`AirTouch: RX unknown sub-message 0x${sub.toString(16)} (len=${data.length}) — extra panel telemetry; safe to ignore`);
            }
        }
    }
}
exports.AirtouchClient = AirtouchClient;
