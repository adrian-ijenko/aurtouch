"use strict";
/** AirTouch 2+ binary protocol constants (Polyaire-style CCSTAT framing). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROUP_SETTING = exports.GROUP_POWER_STAT = exports.GROUP_POWER_CTRL = exports.AC_SETPOINT = exports.AC_FAN = exports.AC_MODE = exports.AC_POWER = exports.SUBMSG_AC_STAT = exports.SUBMSG_AC_CTRL = exports.SUBMSG_GROUP_STAT = exports.SUBMSG_GROUP_CTRL = exports.MSGTYPE_CCSTAT = exports.ADDRESS = exports.HEADER = void 0;
exports.crc16 = crc16;
exports.buildFrame = buildFrame;
exports.decodeAcStatus = decodeAcStatus;
exports.decodeGroupStatus = decodeGroupStatus;
exports.requestAcStatus = requestAcStatus;
exports.requestGroupStatus = requestGroupStatus;
exports.acSetHeatingCooling = acSetHeatingCooling;
exports.acSetTargetTemp = acSetTargetTemp;
exports.acSetFanSpeed = acSetFanSpeed;
exports.zoneSetActive = zoneSetActive;
exports.zoneSetDamper = zoneSetDamper;
exports.verifyFrameCrc = verifyFrameCrc;
exports.HEADER = Buffer.from([0x55, 0x55]);
exports.ADDRESS = Buffer.from([0x80, 0xb0]);
exports.MSGTYPE_CCSTAT = 0xc0;
exports.SUBMSG_GROUP_CTRL = 0x20;
exports.SUBMSG_GROUP_STAT = 0x21;
exports.SUBMSG_AC_CTRL = 0x22;
exports.SUBMSG_AC_STAT = 0x23;
exports.AC_POWER = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3 };
exports.AC_MODE = { AUTO: 0, HEAT: 1, DRY: 2, FAN: 3, COOL: 4, KEEP: 5 };
exports.AC_FAN = {
    AUTO: 0,
    QUIET: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
    POWERFUL: 5,
    TURBO: 6,
    KEEP: 7,
};
exports.AC_SETPOINT = { KEEP: 0, SET_VALUE: 64 };
exports.GROUP_POWER_CTRL = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3, TURBO: 5 };
exports.GROUP_POWER_STAT = { OFF: 0, ON: 1, TURBO: 2 };
exports.GROUP_SETTING = { KEEP: 0, DECREMENT: 2, INCREMENT: 3, SET_VALUE: 4 };
/** Modbus CRC16 (poly 0xA001), applied to payload after the 0x55 0x55 prefix. */
function crc16(buf) {
    let crc = 0xffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            const odd = crc & 1;
            crc >>= 1;
            if (odd)
                crc ^= 0xa001;
        }
    }
    return crc;
}
function encodeAcControl(unit) {
    const n = (v, d) => (v === undefined ? d : v);
    const byte9 = n(unit.ac_unit_number, 0) | (n(unit.ac_power_state, exports.AC_POWER.KEEP) << 4);
    const byte10 = n(unit.ac_fan_speed, exports.AC_FAN.KEEP) | (n(unit.ac_mode, exports.AC_MODE.KEEP) << 4);
    const byte11 = n(unit.ac_setpoint_control, exports.AC_SETPOINT.KEEP);
    const byte12 = n(unit.ac_target_value, 24) * 10 - 100;
    return Buffer.from([
        exports.SUBMSG_AC_CTRL,
        0,
        0,
        0,
        0,
        4,
        0,
        1,
        byte9 & 0xff,
        byte10 & 0xff,
        byte11 & 0xff,
        byte12 & 0xff,
    ]);
}
/** When absent, damper byte is 0xff so the panel does not treat power-only commands as “set damper to 0%”. */
const GROUP_DAMPER_OMIT = 255;
function encodeGroupControl(group) {
    const n = (v, d) => (v === undefined ? d : v);
    const byte9 = n(group.group_number, 0) & 0x3f;
    let byte10 = n(group.group_power_state, exports.GROUP_POWER_CTRL.KEEP) & 0xff;
    byte10 = (byte10 | (n(group.group_target_type, exports.GROUP_SETTING.KEEP) << 5)) & 0xe7;
    const hasDamper = Object.prototype.hasOwnProperty.call(group, 'group_target') &&
        typeof group.group_target === 'number' &&
        !Number.isNaN(group.group_target);
    const byte11 = hasDamper
        ? Math.min(100, Math.max(0, Math.round(group.group_target)))
        : GROUP_DAMPER_OMIT;
    return Buffer.from([
        exports.SUBMSG_GROUP_CTRL,
        0,
        0,
        0,
        0,
        4,
        0,
        1,
        byte9 & 0xff,
        byte10 & 0xff,
        byte11 & 0xff,
        0,
    ]);
}
function buildFrame(data) {
    const msgId = Math.floor(Math.random() * 255) + 1;
    const payload = Buffer.concat([
        exports.ADDRESS,
        Buffer.from([msgId, exports.MSGTYPE_CCSTAT]),
        u16be(data.length),
        data,
    ]);
    const crc = u16be(crc16(payload));
    return Buffer.concat([exports.HEADER, payload, crc]);
}
function decodeAcStatus(data) {
    const repeatCount = data.readUInt16BE(6);
    const repeat = data.subarray(8);
    const out = [];
    for (let i = 0; i + 10 <= repeat.length; i += 10) {
        const u = repeat.subarray(i, i + 10);
        const ac_power_state = (u[0] & 0xf0) >> 4;
        const ac_unit_number = u[0] & 0x0f;
        const ac_mode = (u[1] & 0xf0) >> 4;
        const ac_fan_speed = u[1] & 0x0f;
        const ac_target = (u[2] + 100) / 10;
        const ac_spill = (u[3] & 2) >> 2;
        const ac_timer_set = u[3] & 1;
        const ac_temp = (u.readUInt16BE(4) - 500) / 10;
        const ac_error_code = u.readUInt16BE(6);
        if (repeatCount * 10 !== repeat.length) {
            /* length hint mismatch; still parse rows */
        }
        out.push({
            ac_unit_number,
            ac_power_state,
            ac_mode,
            ac_fan_speed,
            ac_target,
            ac_temp,
            ac_spill,
            ac_timer_set,
            ac_error_code,
        });
    }
    return out;
}
function decodeGroupStatus(data) {
    const repeatCount = data.readUInt16BE(6);
    const repeat = data.subarray(8);
    const out = [];
    for (let i = 0; i + 8 <= repeat.length; i += 8) {
        const g = repeat.subarray(i, i + 8);
        const group_power_state = (g[0] & 0xc0) >> 6;
        const group_number = g[0] & 0x3f;
        const group_damper_position = g[1] & 0x7f;
        const group_has_turbo = (g[6] & 0x80) >> 7;
        const group_has_spill = (g[6] & 2) >> 1;
        if (repeatCount * 8 !== repeat.length) {
            /* ignore */
        }
        out.push({
            group_number,
            group_power_state,
            group_damper_position,
            group_has_turbo,
            group_has_spill,
        });
    }
    return out;
}
function requestAcStatus() {
    return Buffer.from([exports.SUBMSG_AC_STAT, 0, 0, 0, 0, 0, 0, 0]);
}
function requestGroupStatus() {
    return Buffer.from([exports.SUBMSG_GROUP_STAT, 0, 0, 0, 0, 0, 0, 0]);
}
function acSetHeatingCooling(unit, state) {
    switch (state) {
        case 0:
            return encodeAcControl({ ac_unit_number: unit, ac_power_state: exports.AC_POWER.OFF });
        case 1:
            return encodeAcControl({
                ac_unit_number: unit,
                ac_power_state: exports.AC_POWER.ON,
                ac_mode: exports.AC_MODE.HEAT,
            });
        case 2:
            return encodeAcControl({
                ac_unit_number: unit,
                ac_power_state: exports.AC_POWER.ON,
                ac_mode: exports.AC_MODE.COOL,
            });
        default:
            return encodeAcControl({
                ac_unit_number: unit,
                ac_power_state: exports.AC_POWER.ON,
                ac_mode: exports.AC_MODE.AUTO,
            });
    }
}
function acSetTargetTemp(unit, temp) {
    return encodeAcControl({
        ac_unit_number: unit,
        ac_target_value: temp,
        ac_setpoint_control: exports.AC_SETPOINT.SET_VALUE,
    });
}
function acSetFanSpeed(unit, speed) {
    return encodeAcControl({ ac_unit_number: unit, ac_fan_speed: speed });
}
function zoneSetActive(group, on) {
    return encodeGroupControl({
        group_number: group,
        group_power_state: on ? exports.GROUP_POWER_CTRL.ON : exports.GROUP_POWER_CTRL.OFF,
    });
}
function zoneSetDamper(group, position) {
    const pos = Math.min(100, Math.max(0, Math.round(position)));
    return encodeGroupControl({
        group_number: group,
        /** Opening vents while the zone is off is often ignored unless power is ON in the same command. */
        group_power_state: pos > 0 ? exports.GROUP_POWER_CTRL.ON : exports.GROUP_POWER_CTRL.KEEP,
        group_target_type: exports.GROUP_SETTING.SET_VALUE,
        group_target: pos,
    });
}
function u16be(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n, 0);
    return b;
}
function verifyFrameCrc(header6, lenBuf, data, crcBuf) {
    const expected = Buffer.concat([header6.subarray(2), lenBuf, data]);
    return crc16(expected) === crcBuf.readUInt16BE(0);
}
