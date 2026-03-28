import type { API } from 'homebridge';
import { AirTouchHomebridgePlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

/**
 * Homebridge entry — register the dynamic platform.
 * @see https://developers.homebridge.io
 */
export default function register(api: API): void {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AirTouchHomebridgePlatform);
  /** @deprecated Previous platform keys — kept so existing configs keep working. */
  api.registerPlatform(PLUGIN_NAME, 'Airtouch2Plus', AirTouchHomebridgePlatform);
  api.registerPlatform(PLUGIN_NAME, 'AirTouch2Plus', AirTouchHomebridgePlatform);
}
