"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = register;
const platform_1 = require("./platform");
const settings_1 = require("./settings");
/**
 * Homebridge entry — register the dynamic platform.
 * @see https://developers.homebridge.io
 */
function register(api) {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, platform_1.Airtouch2PlusPlatform);
}
