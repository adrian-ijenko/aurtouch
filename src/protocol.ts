/** AirTouch 2+ binary protocol constants (Polyaire-style CCSTAT framing). */

export const HEADER = Buffer.from([0x55, 0x55]);
export const ADDRESS = Buffer.from([0x80, 0xb0]);
export const MSGTYPE_CCSTAT = 0xc0;

export const SUBMSG_GROUP_CTRL = 0x20;
export const SUBMSG_GROUP_STAT = 0x21;
export const SUBMSG_AC_CTRL = 0x22;
export const SUBMSG_AC_STAT = 0x23;

export const AC_POWER = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3 } as const;
export const AC_MODE = { AUTO: 0, HEAT: 1, DRY: 2, FAN: 3, COOL: 4, KEEP: 5 } as const;
export const AC_FAN = {
  AUTO: 0,
  QUIET: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  POWERFUL: 5,
  TURBO: 6,
  KEEP: 7,
} as const;

export type AcFanName = keyof typeof AC_FAN;

export const AC_SETPOINT = { KEEP: 0, SET_VALUE: 64 } as const;

export const GROUP_POWER_CTRL = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3, TURBO: 5 } as const;
export const GROUP_POWER_STAT = { OFF: 0, ON: 1, TURBO: 2 } as const;
export const GROUP_SETTING = { KEEP: 0, DECREMENT: 2, INCREMENT: 3, SET_VALUE: 4 } as const;

/** Modbus CRC16 (poly 0xA001), applied to payload after the 0x55 0x55 prefix. */
export function crc16(buf: Buffer): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const odd = crc & 1;
      crc >>= 1;
      if (odd) crc ^= 0xa001;
    }
  }
  return crc;
}

export interface AcStatus {
  ac_unit_number: number;
  ac_power_state: number;
  ac_mode: number;
  ac_fan_speed: number;
  ac_target: number;
  ac_temp: number;
  ac_spill: number;
  ac_timer_set: number;
  ac_error_code: number;
}

export interface GroupStatus {
  group_number: number;
  group_power_state: number;
  group_damper_position: number;
  group_has_turbo: number;
  group_has_spill: number;
}

function encodeAcControl(unit: {
  ac_unit_number?: number;
  ac_power_state?: number;
  ac_mode?: number;
  ac_fan_speed?: number;
  ac_setpoint_control?: number;
  ac_target_value?: number;
}): Buffer {
  const n = (v: number | undefined, d: number) => (v === undefined ? d : v);
  const byte9 =
    n(unit.ac_unit_number, 0) | (n(unit.ac_power_state, AC_POWER.KEEP) << 4);
  const byte10 = n(unit.ac_fan_speed, AC_FAN.KEEP) | (n(unit.ac_mode, AC_MODE.KEEP) << 4);
  const byte11 = n(unit.ac_setpoint_control, AC_SETPOINT.KEEP);
  const byte12 = n(unit.ac_target_value, 24) * 10 - 100;
  return Buffer.from([
    SUBMSG_AC_CTRL,
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

function encodeGroupControl(group: {
  group_number?: number;
  group_power_state?: number;
  group_target_type?: number;
  group_target?: number;
}): Buffer {
  const n = (v: number | undefined, d: number) => (v === undefined ? d : v);
  const byte9 = n(group.group_number, 0) & 0x3f;
  let byte10 = n(group.group_power_state, GROUP_POWER_CTRL.KEEP) & 0xff;
  byte10 = (byte10 | (n(group.group_target_type, GROUP_SETTING.KEEP) << 5)) & 0xe7;
  const byte11 = group.group_target ?? 0;
  return Buffer.from([
    SUBMSG_GROUP_CTRL,
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

export function buildFrame(data: Buffer): Buffer {
  const msgId = Math.floor(Math.random() * 255) + 1;
  const payload = Buffer.concat([
    ADDRESS,
    Buffer.from([msgId, MSGTYPE_CCSTAT]),
    u16be(data.length),
    data,
  ]);
  const crc = u16be(crc16(payload));
  return Buffer.concat([HEADER, payload, crc]);
}

export function decodeAcStatus(data: Buffer): AcStatus[] {
  const repeatCount = data.readUInt16BE(6);
  const repeat = data.subarray(8);
  const out: AcStatus[] = [];
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

export function decodeGroupStatus(data: Buffer): GroupStatus[] {
  const repeatCount = data.readUInt16BE(6);
  const repeat = data.subarray(8);
  const out: GroupStatus[] = [];
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

export function requestAcStatus(): Buffer {
  return Buffer.from([SUBMSG_AC_STAT, 0, 0, 0, 0, 0, 0, 0]);
}

export function requestGroupStatus(): Buffer {
  return Buffer.from([SUBMSG_GROUP_STAT, 0, 0, 0, 0, 0, 0, 0]);
}

export function acSetHeatingCooling(unit: number, state: 0 | 1 | 2 | 3): Buffer {
  switch (state) {
    case 0:
      return encodeAcControl({ ac_unit_number: unit, ac_power_state: AC_POWER.OFF });
    case 1:
      return encodeAcControl({
        ac_unit_number: unit,
        ac_power_state: AC_POWER.ON,
        ac_mode: AC_MODE.HEAT,
      });
    case 2:
      return encodeAcControl({
        ac_unit_number: unit,
        ac_power_state: AC_POWER.ON,
        ac_mode: AC_MODE.COOL,
      });
    default:
      return encodeAcControl({
        ac_unit_number: unit,
        ac_power_state: AC_POWER.ON,
        ac_mode: AC_MODE.AUTO,
      });
  }
}

export function acSetTargetTemp(unit: number, temp: number): Buffer {
  return encodeAcControl({
    ac_unit_number: unit,
    ac_target_value: temp,
    ac_setpoint_control: AC_SETPOINT.SET_VALUE,
  });
}

export function acSetFanSpeed(unit: number, speed: number): Buffer {
  return encodeAcControl({ ac_unit_number: unit, ac_fan_speed: speed });
}

export function zoneSetActive(group: number, on: boolean): Buffer {
  return encodeGroupControl({
    group_number: group,
    group_power_state: on ? GROUP_POWER_CTRL.ON : GROUP_POWER_CTRL.OFF,
  });
}

export function zoneSetDamper(group: number, position: number): Buffer {
  return encodeGroupControl({
    group_number: group,
    group_target_type: GROUP_SETTING.SET_VALUE,
    group_target: position,
  });
}

function u16be(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}

export function verifyFrameCrc(
  header6: Buffer,
  lenBuf: Buffer,
  data: Buffer,
  crcBuf: Buffer
): boolean {
  const expected = Buffer.concat([header6.subarray(2), lenBuf, data]);
  return crc16(expected) === crcBuf.readUInt16BE(0);
}
