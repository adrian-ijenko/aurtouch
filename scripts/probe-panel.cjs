#!/usr/bin/env node
/**
 * Standalone TCP test against an AirTouch 2+ wall panel (no Homebridge / HomeKit).
 *
 * Prerequisites: from repo root run `npm run build` so dist/ exists.
 *
 * Usage:
 *   node scripts/probe-panel.cjs 192.168.1.35
 *   node scripts/probe-panel.cjs 192.168.1.35 --try-zone-on 0
 *   node scripts/probe-panel.cjs 192.168.1.35 --try-damper 0 50
 *   node scripts/probe-panel.cjs 192.168.1.35 --try-ac-cool
 *   node scripts/probe-panel.cjs --help
 */

'use strict';

const path = require('path');
const { AirtouchClient } = require(path.join(__dirname, '..', 'dist', 'airtouchClient.js'));

const args = process.argv.slice(2);

function printHelp(exitCode) {
  console.log(`
AirTouch 2+ panel probe (TCP port 9200). Build first: npm run build

  node scripts/probe-panel.cjs <panel-ip> [options]

What to look for
  • "[AC STATUS]" / "[GROUP STATUS]" JSON → link + parsing OK.
  • "TX ..." lines → commands we send (compare before/after on the wall).
  • No RX after TX → wrong IP, firewall, or panel not speaking this protocol.
  • Commands TX but wall unchanged → zone may be in temp mode (not %), or installer lockout.

Options
  --duration SEC     Stay connected (default 25)
  --try-zone-on N
  --try-zone-off N
  --try-damper N PCT
  --try-ac-off       AC unit 0 off
  --try-ac-cool      AC unit 0 cool on
  --try-ac-heat      AC unit 0 heat on
`);
  process.exit(exitCode);
}

if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  printHelp(args.length === 0 ? 1 : 0);
}

const host = args[0];
const tries = [];
let duration = 25;

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--duration') {
    duration = Math.max(5, parseInt(args[++i], 10) || 25);
  } else if (a === '--try-zone-on') {
    tries.push({ kind: 'zoneOn', n: parseInt(args[++i], 10) });
  } else if (a === '--try-zone-off') {
    tries.push({ kind: 'zoneOff', n: parseInt(args[++i], 10) });
  } else if (a === '--try-damper') {
    tries.push({
      kind: 'damper',
      n: parseInt(args[++i], 10),
      pct: parseInt(args[++i], 10),
    });
  } else if (a === '--try-ac-off') {
    tries.push({ kind: 'acOff' });
  } else if (a === '--try-ac-cool') {
    tries.push({ kind: 'acCool' });
  } else if (a === '--try-ac-heat') {
    tries.push({ kind: 'acHeat' });
  } else {
    console.error('Unknown argument:', a);
    printHelp(1);
  }
}

const client = new AirtouchClient({
  host,
  port: 9200,
  verboseWire: true,
  disableAutoPolling: true,
  reconnectDelayMs: 3_600_000,
  log: {
    debug: () => {},
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  },
});

client.on('ac_status', (list) => {
  console.log('\n[AC STATUS]', JSON.stringify(list, null, 2));
});

client.on('group_status', (list) => {
  console.log('\n[GROUP STATUS]', JSON.stringify(list, null, 2));
});

client.on('error', (e) => {
  console.error('[SOCKET ERROR]', e.message);
});

client.on('connected', () => {
  console.log('--- Connected. Panel should allow local TCP on 9200. ---\n');

  let delay = 2500;
  for (const tr of tries) {
    setTimeout(() => {
      if (tr.kind === 'zoneOn') {
        console.log(`\n>>> TRY: zone ${tr.n} ON`);
        client.zoneSetActive(tr.n, true);
      } else if (tr.kind === 'zoneOff') {
        console.log(`\n>>> TRY: zone ${tr.n} OFF`);
        client.zoneSetActive(tr.n, false);
      } else if (tr.kind === 'damper') {
        console.log(`\n>>> TRY: zone ${tr.n} damper ${tr.pct}%`);
        client.zoneSetDamperPosition(tr.n, tr.pct);
      } else if (tr.kind === 'acOff') {
        console.log('\n>>> TRY: AC 0 OFF');
        client.acSetHeatingCoolingState(0, 0);
      } else if (tr.kind === 'acCool') {
        console.log('\n>>> TRY: AC 0 COOL ON');
        client.acSetHeatingCoolingState(0, 2);
      } else if (tr.kind === 'acHeat') {
        console.log('\n>>> TRY: AC 0 HEAT ON');
        client.acSetHeatingCoolingState(0, 1);
      }
      client.requestRefresh();
    }, delay);
    delay += 3000;
  }
});

console.log(`Connecting to ${host}:9200 ...`);
client.connect();

setTimeout(() => {
  console.log('\n--- Duration elapsed; closing TCP. ---');
  client.destroy();
  process.exit(0);
}, duration * 1000);
