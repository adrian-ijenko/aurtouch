"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Airtouch2PlusPlatform = void 0;
const airtouchClient_1 = require("./airtouchClient");
const protocol_1 = require("./protocol");
const settings_1 = require("./settings");
const REGISTER_NAME = settings_1.PLUGIN_NAME;
/** After a HomeKit edit, ignore panel snapshots that would overwrite targets (panel is often briefly stale). */
const SUPPRESS_PANEL_TARGETS_MS = 3500;
const SUPPRESS_ZONE_PANEL_MS = 3500;
function fanNameToProtocolCode(name) {
    const key = name.toUpperCase().replace(/\s+/g, '_');
    if (key in protocol_1.AC_FAN && key !== 'KEEP')
        return protocol_1.AC_FAN[key];
    throw new Error(`Unknown fan speed name: ${name}`);
}
function protocolFanCodeToName(code) {
    const entry = Object.keys(protocol_1.AC_FAN).find((k) => protocol_1.AC_FAN[k] === code);
    return entry;
}
class Airtouch2PlusPlatform {
    log;
    config;
    api;
    client;
    /** Keyed by AC index / zone index — display names can change via config */
    acBySerial = {};
    zoneBySerial = {};
    acRefreshTimer = null;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        if (!config?.units?.length) {
            this.log.error('Airtouch2Plus: `units` array is required in config.');
        }
        const host = config.host ?? config.ip_address;
        if (!host) {
            this.log.error('Airtouch2Plus: `host` (or legacy `ip_address`) is required.');
        }
        const logger = {
            debug: (m) => this.log.debug(m),
            info: (m) => this.log.info(m),
            warn: (m) => this.log.warn(m),
            error: (m) => this.log.error(m),
        };
        this.client = new airtouchClient_1.AirtouchClient({
            host: host ?? '0.0.0.0',
            pollIntervalMs: config.pollIntervalMs,
            reconnectDelayMs: config.reconnectDelayMs,
            verboseWire: !!config.debug,
            log: logger,
        });
        this.client.on('ac_status', (list) => {
            for (const st of list)
                this.onAcStatus(st);
        });
        this.client.on('group_status', (list) => {
            for (const st of list)
                this.onGroupStatus(st);
        });
        this.client.on('connected', () => {
            this.log.info('Airtouch2Plus: session ready');
        });
        this.api.on('didFinishLaunching', () => {
            if (host && config.units?.length)
                this.client.connect();
        });
        this.api.on('shutdown', () => {
            if (this.acRefreshTimer)
                clearTimeout(this.acRefreshTimer);
            this.client.destroy();
        });
    }
    /** Ask the panel for fresh AC + zone status after a command (debounced). */
    scheduleStatusRefresh() {
        if (this.acRefreshTimer)
            clearTimeout(this.acRefreshTimer);
        this.acRefreshTimer = setTimeout(() => {
            this.acRefreshTimer = null;
            this.client.requestRefresh();
        }, 400);
    }
    get Service() {
        return this.api.hap.Service;
    }
    get Characteristic() {
        return this.api.hap.Characteristic;
    }
    configureAccessory(accessory) {
        const ctx = accessory.context;
        if (ctx.kind === 'ac') {
            this.acBySerial[ctx.serial] = accessory;
            this.syncAcLabels(accessory);
            this.wireAcAccessory(accessory);
        }
        else if (ctx.kind === 'zone') {
            this.zoneBySerial[ctx.serial] = accessory;
            this.syncZoneLabels(accessory);
            this.wireZoneAccessory(accessory);
        }
        accessory.updateReachability(true);
    }
    resolveAcName(index) {
        const m = this.config.acNames;
        if (!m)
            return `AC ${index}`;
        if (Array.isArray(m))
            return m[index]?.trim() || `AC ${index}`;
        const v = m[String(index)];
        return (typeof v === 'string' && v.trim() !== '' ? v : null) ?? `AC ${index}`;
    }
    resolveZoneName(index) {
        const m = this.config.zoneNames;
        if (!m)
            return `Zone ${index}`;
        if (Array.isArray(m))
            return m[index]?.trim() || `Zone ${index}`;
        const v = m[String(index)];
        return (typeof v === 'string' && v.trim() !== '' ? v : null) ?? `Zone ${index}`;
    }
    zoneDamperSubtype(serial) {
        return `Zone ${serial}-damper`;
    }
    syncAcLabels(accessory) {
        const label = this.resolveAcName(accessory.context.serial);
        if (accessory.displayName !== label) {
            accessory.displayName = label;
        }
        accessory
            .getService(this.Service.Thermostat)
            ?.updateCharacteristic(this.Characteristic.Name, label);
    }
    syncZoneLabels(accessory) {
        const label = this.resolveZoneName(accessory.context.serial);
        if (accessory.displayName !== label) {
            accessory.displayName = label;
        }
        const sw = accessory.getService(this.Service.Switch);
        sw?.updateCharacteristic(this.Characteristic.Name, label);
        const damper = accessory.getServiceById(this.Service.Window, this.zoneDamperSubtype(accessory.context.serial));
        damper?.updateCharacteristic(this.Characteristic.Name, `${label} Damper`);
    }
    onAcStatus(st) {
        const name = this.resolveAcName(st.ac_unit_number);
        let acc = this.acBySerial[st.ac_unit_number];
        if (!acc) {
            const unitCfg = this.config.units[st.ac_unit_number];
            if (!unitCfg) {
                this.log.warn(`Airtouch2Plus: no config.units[${st.ac_unit_number}] — add an entry for this AC index.`);
                return;
            }
            const uuid = this.api.hap.uuid.generate(`${REGISTER_NAME}:ac:${st.ac_unit_number}`);
            acc = new this.api.platformAccessory(name, uuid);
            const fanNames = unitCfg.fan.map((f) => f.toUpperCase());
            acc.context = {
                kind: 'ac',
                serial: st.ac_unit_number,
                manufacturer: unitCfg.manufacturer ?? 'Polyaire',
                model: unitCfg.model ?? 'AirTouch 2+',
                fanNames,
                rotationStep: fanNames.length > 1 ? Math.floor(100 / (fanNames.length - 1)) : 100,
                currentHeatingCoolingState: 0,
                targetHeatingCoolingState: 0,
                currentTemperature: 21,
                targetTemperature: 24,
                rotationSpeed: 0,
                statusFault: 0,
            };
            acc.getService(this.Service.AccessoryInformation)
                .setCharacteristic(this.Characteristic.Manufacturer, acc.context.manufacturer)
                .setCharacteristic(this.Characteristic.Model, acc.context.model)
                .setCharacteristic(this.Characteristic.SerialNumber, String(st.ac_unit_number));
            acc.addService(this.Service.Thermostat, name);
            this.wireAcAccessory(acc);
            this.acBySerial[st.ac_unit_number] = acc;
            this.api.registerPlatformAccessories(REGISTER_NAME, settings_1.PLATFORM_NAME, [acc]);
        }
        this.syncAcLabels(acc);
        this.pushAcState(acc, st);
    }
    onGroupStatus(st) {
        const name = this.resolveZoneName(st.group_number);
        let acc = this.zoneBySerial[st.group_number];
        if (!acc) {
            const uuid = this.api.hap.uuid.generate(`${REGISTER_NAME}:zone:${st.group_number}`);
            acc = new this.api.platformAccessory(name, uuid);
            acc.context = {
                kind: 'zone',
                serial: st.group_number,
                manufacturer: 'Polyaire',
                model: 'Zone',
                active: false,
                damperPosition: 0,
                targetPosition: 0,
            };
            acc.getService(this.Service.AccessoryInformation)
                .setCharacteristic(this.Characteristic.Manufacturer, acc.context.manufacturer)
                .setCharacteristic(this.Characteristic.Model, acc.context.model)
                .setCharacteristic(this.Characteristic.SerialNumber, String(st.group_number));
            acc.addService(this.Service.Switch, name);
            const damperSubtype = this.zoneDamperSubtype(st.group_number);
            const damper = acc.addService(this.Service.Window, `${name} Damper`, damperSubtype);
            acc.getService(this.Service.Switch).addLinkedService(damper);
            this.wireZoneAccessory(acc);
            this.zoneBySerial[st.group_number] = acc;
            this.api.registerPlatformAccessories(REGISTER_NAME, settings_1.PLATFORM_NAME, [acc]);
        }
        this.syncZoneLabels(acc);
        this.pushZoneState(acc, st);
    }
    wireAcAccessory(accessory) {
        if (accessory.context.wired)
            return;
        accessory.context.wired = true;
        const thermo = accessory.getService(this.Service.Thermostat);
        thermo
            .getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .onGet(() => accessory.context.currentHeatingCoolingState);
        thermo
            .getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .onGet(() => accessory.context.targetHeatingCoolingState)
            .onSet((v) => {
            const val = Number(v);
            accessory.context.targetHeatingCoolingState = val;
            accessory.context.suppressPanelTargetsUntil = Date.now() + SUPPRESS_PANEL_TARGETS_MS;
            if (accessory.context.currentHeatingCoolingState !== val) {
                this.client.acSetHeatingCoolingState(accessory.context.serial, val);
            }
            this.scheduleStatusRefresh();
        });
        thermo
            .getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(() => accessory.context.currentTemperature);
        thermo
            .getCharacteristic(this.Characteristic.TargetTemperature)
            .setProps({ minStep: 1, minValue: 14, maxValue: 32 })
            .onGet(() => accessory.context.targetTemperature)
            .onSet((v) => {
            const t = Number(v);
            accessory.context.targetTemperature = t;
            accessory.context.suppressPanelTargetsUntil = Date.now() + SUPPRESS_PANEL_TARGETS_MS;
            this.client.acSetTargetTemperature(accessory.context.serial, t);
            this.scheduleStatusRefresh();
        });
        thermo
            .getCharacteristic(this.Characteristic.TemperatureDisplayUnits)
            .onGet(() => this.Characteristic.TemperatureDisplayUnits.CELSIUS)
            .onSet((_v, cb) => {
            cb();
        });
        if (!thermo.testCharacteristic(this.Characteristic.RotationSpeed)) {
            thermo.addCharacteristic(this.Characteristic.RotationSpeed);
        }
        if (!thermo.testCharacteristic(this.Characteristic.StatusFault)) {
            thermo.addCharacteristic(this.Characteristic.StatusFault);
        }
        const maxRot = accessory.context.rotationStep * Math.max(0, accessory.context.fanNames.length - 1);
        thermo
            .getCharacteristic(this.Characteristic.RotationSpeed)
            .setProps({
            minStep: accessory.context.rotationStep,
            minValue: 0,
            maxValue: maxRot || 100,
        })
            .onGet(() => accessory.context.rotationSpeed)
            .onSet((v) => {
            const rot = Number(v);
            accessory.context.rotationSpeed = rot;
            accessory.context.suppressPanelTargetsUntil = Date.now() + SUPPRESS_PANEL_TARGETS_MS;
            const step = Math.max(1, accessory.context.rotationStep);
            const idx = Math.min(accessory.context.fanNames.length - 1, Math.max(0, Math.round(rot / step)));
            const fname = accessory.context.fanNames[idx] ?? accessory.context.fanNames[0];
            if (fname) {
                this.client.acSetFanSpeedNumber(accessory.context.serial, fanNameToProtocolCode(fname));
            }
            this.scheduleStatusRefresh();
        });
        thermo.getCharacteristic(this.Characteristic.StatusFault).onGet(() => accessory.context.statusFault);
    }
    pushAcState(accessory, st) {
        const thermo = accessory.getService(this.Service.Thermostat);
        const Cur = this.Characteristic.CurrentHeatingCoolingState;
        const Tgt = this.Characteristic.TargetHeatingCoolingState;
        /** Current* only allows OFF/HEAT/COOL (0–2). Target* also allows AUTO (3). */
        let currentHvac;
        let targetHvac;
        if (st.ac_power_state === 0) {
            currentHvac = Cur.OFF;
            targetHvac = Tgt.OFF;
        }
        else if (st.ac_mode === 1) {
            currentHvac = Cur.HEAT;
            targetHvac = Tgt.HEAT;
        }
        else if (st.ac_mode === 4) {
            currentHvac = Cur.COOL;
            targetHvac = Tgt.COOL;
        }
        else {
            targetHvac = Tgt.AUTO;
            const d = st.ac_temp - st.ac_target;
            if (d > 0.5)
                currentHvac = Cur.COOL;
            else if (d < -0.5)
                currentHvac = Cur.HEAT;
            else
                currentHvac = Cur.OFF;
        }
        accessory.context.currentHeatingCoolingState = currentHvac;
        accessory.context.currentTemperature = st.ac_temp;
        thermo.updateCharacteristic(this.Characteristic.CurrentHeatingCoolingState, currentHvac);
        thermo.updateCharacteristic(this.Characteristic.CurrentTemperature, st.ac_temp);
        const suppress = (accessory.context.suppressPanelTargetsUntil ?? 0) > Date.now();
        if (!suppress) {
            accessory.context.targetHeatingCoolingState = targetHvac;
            accessory.context.targetTemperature = st.ac_target;
            const fname = protocolFanCodeToName(st.ac_fan_speed);
            const usable = fname && fname !== 'KEEP' ? fname : undefined;
            const idx = usable ? accessory.context.fanNames.indexOf(usable) : -1;
            if (idx >= 0) {
                accessory.context.rotationSpeed = idx * accessory.context.rotationStep;
            }
            thermo.updateCharacteristic(this.Characteristic.TargetHeatingCoolingState, targetHvac);
            thermo.updateCharacteristic(this.Characteristic.TargetTemperature, st.ac_target);
            thermo.updateCharacteristic(this.Characteristic.RotationSpeed, accessory.context.rotationSpeed);
        }
        accessory.context.statusFault =
            st.ac_error_code !== 0
                ? this.Characteristic.StatusFault.GENERAL_FAULT
                : this.Characteristic.StatusFault.NO_FAULT;
        thermo.updateCharacteristic(this.Characteristic.StatusFault, accessory.context.statusFault);
        accessory.updateReachability(true);
    }
    wireZoneAccessory(accessory) {
        if (accessory.context.wired)
            return;
        accessory.context.wired = true;
        const sw = accessory.getService(this.Service.Switch);
        sw.getCharacteristic(this.Characteristic.On)
            .onGet(() => accessory.context.active)
            .onSet((v) => {
            const on = Boolean(v);
            accessory.context.active = on;
            accessory.context.suppressPanelZoneUntil = Date.now() + SUPPRESS_ZONE_PANEL_MS;
            this.client.zoneSetActive(accessory.context.serial, on);
            this.scheduleStatusRefresh();
        });
        const damper = accessory.getServiceById(this.Service.Window, this.zoneDamperSubtype(accessory.context.serial));
        if (!damper)
            return;
        damper
            .getCharacteristic(this.Characteristic.CurrentPosition)
            .onGet(() => accessory.context.damperPosition);
        damper
            .getCharacteristic(this.Characteristic.TargetPosition)
            .setProps({ minStep: 5, minValue: 0, maxValue: 100 })
            .onGet(() => accessory.context.targetPosition)
            .onSet((v) => {
            const p = Number(v);
            accessory.context.targetPosition = p;
            accessory.context.suppressPanelZoneUntil = Date.now() + SUPPRESS_ZONE_PANEL_MS;
            this.client.zoneSetDamperPosition(accessory.context.serial, p);
            this.scheduleStatusRefresh();
        });
        damper
            .getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => this.Characteristic.PositionState.STOPPED);
    }
    pushZoneState(accessory, st) {
        if ((accessory.context.suppressPanelZoneUntil ?? 0) > Date.now()) {
            accessory.updateReachability(true);
            return;
        }
        const sw = accessory.getService(this.Service.Switch);
        const damper = accessory.getServiceById(this.Service.Window, this.zoneDamperSubtype(accessory.context.serial));
        const on = st.group_power_state % 2 === 1;
        accessory.context.active = on;
        accessory.context.damperPosition = st.group_damper_position;
        accessory.context.targetPosition = st.group_damper_position;
        sw.updateCharacteristic(this.Characteristic.On, on);
        if (damper) {
            damper.updateCharacteristic(this.Characteristic.CurrentPosition, st.group_damper_position);
            damper.updateCharacteristic(this.Characteristic.TargetPosition, st.group_damper_position);
        }
        accessory.updateReachability(true);
    }
}
exports.Airtouch2PlusPlatform = Airtouch2PlusPlatform;
