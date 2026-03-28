import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
interface UnitConfig {
    manufacturer?: string;
    model?: string;
    /** Fan speed names matching protocol, e.g. ["AUTO","QUIET","LOW","MEDIUM","HIGH"] */
    fan: string[];
}
export interface Airtouch2PlusPlatformConfig extends PlatformConfig {
    name?: string;
    host?: string;
    ip_address?: string;
    acIncludeTemps?: boolean;
    pollIntervalMs?: number;
    reconnectDelayMs?: number;
    units: UnitConfig[];
}
interface AcAccessoryContext {
    kind: 'ac';
    serial: number;
    manufacturer: string;
    model: string;
    fanNames: string[];
    rotationStep: number;
    currentHeatingCoolingState: number;
    targetHeatingCoolingState: number;
    currentTemperature: number;
    targetTemperature: number;
    rotationSpeed: number;
    statusFault: number;
    wired?: boolean;
}
interface ZoneAccessoryContext {
    kind: 'zone';
    serial: number;
    manufacturer: string;
    model: string;
    active: boolean;
    damperPosition: number;
    targetPosition: number;
    wired?: boolean;
}
type Ctx = AcAccessoryContext | ZoneAccessoryContext;
export declare class Airtouch2PlusPlatform implements DynamicPlatformPlugin {
    readonly log: Logging;
    readonly config: Airtouch2PlusPlatformConfig;
    readonly api: API;
    private readonly client;
    private readonly acByName;
    private readonly zoneByName;
    constructor(log: Logging, config: Airtouch2PlusPlatformConfig, api: API);
    private get Service();
    private get Characteristic();
    configureAccessory(accessory: PlatformAccessory<Ctx>): void;
    private onAcStatus;
    private onGroupStatus;
    private wireAcAccessory;
    private pushAcState;
    private wireZoneAccessory;
    private pushZoneState;
}
export {};
