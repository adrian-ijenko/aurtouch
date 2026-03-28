/** AirTouch 2+ binary protocol constants (Polyaire-style CCSTAT framing). */
export declare const HEADER: Buffer<ArrayBuffer>;
export declare const ADDRESS: Buffer<ArrayBuffer>;
export declare const MSGTYPE_CCSTAT = 192;
export declare const SUBMSG_GROUP_CTRL = 32;
export declare const SUBMSG_GROUP_STAT = 33;
export declare const SUBMSG_AC_CTRL = 34;
export declare const SUBMSG_AC_STAT = 35;
export declare const AC_POWER: {
    readonly KEEP: 0;
    readonly NEXT: 1;
    readonly OFF: 2;
    readonly ON: 3;
};
export declare const AC_MODE: {
    readonly AUTO: 0;
    readonly HEAT: 1;
    readonly DRY: 2;
    readonly FAN: 3;
    readonly COOL: 4;
    readonly KEEP: 5;
};
export declare const AC_FAN: {
    readonly AUTO: 0;
    readonly QUIET: 1;
    readonly LOW: 2;
    readonly MEDIUM: 3;
    readonly HIGH: 4;
    readonly POWERFUL: 5;
    readonly TURBO: 6;
    readonly KEEP: 7;
};
export type AcFanName = keyof typeof AC_FAN;
export declare const AC_SETPOINT: {
    readonly KEEP: 0;
    readonly SET_VALUE: 64;
};
export declare const GROUP_POWER_CTRL: {
    readonly KEEP: 0;
    readonly NEXT: 1;
    readonly OFF: 2;
    readonly ON: 3;
    readonly TURBO: 5;
};
export declare const GROUP_POWER_STAT: {
    readonly OFF: 0;
    readonly ON: 1;
    readonly TURBO: 2;
};
export declare const GROUP_SETTING: {
    readonly KEEP: 0;
    readonly DECREMENT: 2;
    readonly INCREMENT: 3;
    readonly SET_VALUE: 4;
};
/** Modbus CRC16 (poly 0xA001), applied to payload after the 0x55 0x55 prefix. */
export declare function crc16(buf: Buffer): number;
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
export declare function buildFrame(data: Buffer): Buffer;
export declare function decodeAcStatus(data: Buffer): AcStatus[];
export declare function decodeGroupStatus(data: Buffer): GroupStatus[];
export declare function requestAcStatus(): Buffer;
export declare function requestGroupStatus(): Buffer;
export declare function acSetHeatingCooling(unit: number, state: 0 | 1 | 2 | 3): Buffer;
export declare function acSetTargetTemp(unit: number, temp: number): Buffer;
export declare function acSetFanSpeed(unit: number, speed: number): Buffer;
export declare function zoneSetActive(group: number, on: boolean): Buffer;
export declare function zoneSetDamper(group: number, position: number): Buffer;
export declare function verifyFrameCrc(header6: Buffer, lenBuf: Buffer, data: Buffer, crcBuf: Buffer): boolean;
