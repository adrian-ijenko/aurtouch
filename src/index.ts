import type { API } from 'homebridge';
import { Airtouch2PlusPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

/**
 * Homebridge entry — register the dynamic platform.
 * @see https://developers.homebridge.io
 */
export default function register(api: API): void {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, Airtouch2PlusPlatform);
}
