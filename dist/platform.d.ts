import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
interface UnitConfig {
    manufacturer?: string;
    model?: string;
    /** Fan speed names matching protocol, e.g. ["AUTO","QUIET","LOW","MEDIUM","HIGH"] */
    fan: string[];
}
export interface AirTouchHomebridgePlatformConfig extends PlatformConfig {
    name?: string;
    host?: string;
    ip_address?: string;
    acIncludeTemps?: boolean;
    pollIntervalMs?: number;
    reconnectDelayMs?: number;
    units: UnitConfig[];
    /**
     * Labels for AC units by index (as on the panel: first AC = 0).
     * Object: { "0": "Upstairs", "1": "Downstairs" } or array: ["Upstairs", "Downstairs"]
     */
    acNames?: Record<string, string> | string[];
    /**
     * Zone / group labels by index (first zone = 0).
     * Object: { "0": "Living Room", "1": "Bedroom 1" } or array matching zone order
     */
    zoneNames?: Record<string, string> | string[];
    /** Log raw TCP frames (TX/RX hex) at info level for troubleshooting. */
    debug?: boolean;
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
    /** While Date.now() < this, do not apply panel values to Target* / fan (HomeKit edits in flight). */
    suppressPanelTargetsUntil?: number;
}
interface ZoneAccessoryContext {
    kind: 'zone';
    serial: number;
    manufacturer: string;
    model: string;
    active: boolean;
    damperPosition: number;
    targetPosition: number;
    /** While Date.now() < this, do not apply panel zone snapshot over Switch/Window. */
    suppressPanelZoneUntil?: number;
}
type Ctx = AcAccessoryContext | ZoneAccessoryContext;
export declare class AirTouchHomebridgePlatform implements DynamicPlatformPlugin {
    readonly log: Logging;
    readonly config: AirTouchHomebridgePlatformConfig;
    readonly api: API;
    private readonly client;
    /** Keyed by AC index / zone index — display names can change via config */
    private readonly acBySerial;
    private readonly zoneBySerial;
    private acRefreshTimer;
    /** In-memory only — never persist. Context `wired` was persisted and skipped re-wiring after restart. */
    private readonly accessoryHandlersWired;
    constructor(log: Logging, config: AirTouchHomebridgePlatformConfig, api: API);
    /** Ask the panel for fresh AC + zone status after a command (debounced). */
    private scheduleStatusRefresh;
    private get Service();
    private get Characteristic();
    configureAccessory(accessory: PlatformAccessory<Ctx>): void;
    private resolveAcName;
    private resolveZoneName;
    private zoneDamperSubtype;
    private syncAcLabels;
    private syncZoneLabels;
    private onAcStatus;
    private onGroupStatus;
    private wireAcAccessory;
    private pushAcState;
    private wireZoneAccessory;
    private pushZoneState;
}
export {};
