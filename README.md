<div align="center">

# AirTouch Homebridge

**HomeKit control for Polyaire AirTouch 2+ wall controllers over your LAN**

`homebridge-airtouch` · [![GitHub package.json version](https://img.shields.io/github/package-json/v/adrian-ijenko/AirTouch-Homebridge?style=flat-square)](https://github.com/adrian-ijenko/AirTouch-Homebridge)
[![License](https://img.shields.io/github/license/adrian-ijenko/AirTouch-Homebridge?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.20.4-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Homebridge](https://img.shields.io/badge/homebridge-platform%20plugin-CB4494?style=flat-square&logo=homebridge&logoColor=white)](https://homebridge.io/)

[Features](#-features) · [Install](#-installation) · [Config](#-configuration) · [Migrating](#migrating-from-homebridge-airtouch2-plus) · [Troubleshooting](#-troubleshooting)

</div>

---

## ✨ Features

| | |
| --- | --- |
| 🌡️ | **Per-AC thermostat** — mode (off / heat / cool / auto), target temperature, fan speed |
| 🏠 | **Per-zone control** — power switch + damper slider (linked Window service) |
| 🔌 | **Native TCP** to the touch panel (port **9200**), no cloud account |
| 🔄 | **Resilient connection** — reconnects, queues commands if the socket drops briefly |
| 🏷️ | **Custom names** — optional `acNames` / `zoneNames` to match your rooms |
| 🐛 | **Optional wire trace** — `debug: true` logs TX/RX hex for troubleshooting |

---

## 📋 Requirements

- **Homebridge** v1.8+ (v2 beta supported per `engines`)
- **Node.js** ≥ 18.20.4
- **Polyaire AirTouch 2+** touch panel reachable on the LAN (same subnet / routable)
- Panel **IP address** or hostname (reserve a DHCP lease recommended)

---

## 📦 Installation

### Homebridge UI

1. Open **Plugins** → search **`homebridge-airtouch`** (if published to npm) **or** use **Install alternate plugin** with the git URL below.
2. Install, then restart Homebridge.

### Command line (same directory Homebridge uses)

Plugins must live in **that** instance’s `node_modules` (often `/var/lib/homebridge` in Docker/Unraid):

```bash
cd /var/lib/homebridge
npm install homebridge-airtouch
```

**Install from GitHub** (always current `main`):

```bash
cd /var/lib/homebridge
npm install "git+https://github.com/adrian-ijenko/AirTouch-Homebridge.git#main"
```

Confirm version:

```bash
node -p "require('./node_modules/homebridge-airtouch/package.json').version"
```

> **Tip:** After changing code on your PC, **`git push`** to GitHub before reinstalling on the server, or `npm` may keep an older resolved commit.

Restart Homebridge (e.g. `hb-service restart` or your container restart).

---

## Migrating from `homebridge-airtouch2-plus`

The npm package was renamed to **`homebridge-airtouch`** (project branding: **AirTouch Homebridge**).

1. Remove the old package and install the new one:

   ```bash
   cd /var/lib/homebridge
   npm rm homebridge-airtouch2-plus
   rm -rf node_modules/homebridge-airtouch2-plus
   npm install "git+https://github.com/adrian-ijenko/AirTouch-Homebridge.git#main"
   # or: npm install homebridge-airtouch
   ```

2. **Config `platform` key:** you can keep **`Airtouch2Plus`** or **`AirTouch2Plus`** (still supported), or update to **`AirTouchHomebridge`** (recommended for new setups).

3. Restart Homebridge.

---

## ⚙️ Configuration

**Platform name (recommended):** `AirTouchHomebridge`  
**Homebridge UI display:** *AirTouch Homebridge*

### Minimal example

```json
{
  "platform": "AirTouchHomebridge",
  "name": "AirTouch Homebridge",
  "host": "192.168.1.50",
  "units": [
    {
      "fan": ["AUTO", "QUIET", "LOW", "MEDIUM", "HIGH"]
    }
  ]
}
```

### Example with options

```json
{
  "platform": "AirTouchHomebridge",
  "name": "AirTouch Homebridge",
  "host": "192.168.1.50",
  "debug": false,
  "pollIntervalMs": 285000,
  "reconnectDelayMs": 10000,
  "acNames": {
    "0": "Upstairs",
    "1": "Downstairs"
  },
  "zoneNames": {
    "0": "Living",
    "1": "Bedroom",
    "2": "Office"
  },
  "units": [
    {
      "manufacturer": "Polyaire",
      "model": "AirTouch 2+",
      "fan": ["AUTO", "QUIET", "LOW", "MEDIUM", "HIGH"]
    }
  ]
}
```

### Settings reference

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | string | — | **Required.** Panel IP or hostname (`ip_address` still accepted as legacy alias). |
| `name` | string | `AirTouch Homebridge` | Name shown in Homebridge. |
| `units` | array | — | **Required.** One entry per AC unit on the panel; index **0** = first AC. Each object needs `fan` (see below). |
| `units[].fan` | string[] | — | **Required.** Fan step labels, protocol order, e.g. `["AUTO","QUIET","LOW","MEDIUM","HIGH"]`. |
| `units[].manufacturer` | string | `Polyaire` | HomeKit accessory metadata. |
| `units[].model` | string | `AirTouch 2+` | HomeKit accessory metadata. |
| `pollIntervalMs` | number | `285000` | How often to poll zone/group status (ms). Minimum `5000`. |
| `reconnectDelayMs` | number | `10000` | Delay before reconnect after a drop (ms). |
| `debug` | boolean | `false` | Log TCP TX/RX hex at info level. |
| `acNames` | object \| array | — | Display names by AC index (`"0"`, `"1"` or array order). |
| `zoneNames` | object \| array | — | Display names by zone index (`"0"`, `"1"` or array order). |
| `acIncludeTemps` | boolean | `false` | Reserved for future use. |

---

## 🏠 Accessories in HomeKit

For each **AC** on the panel:

- **Thermostat** — target mode & temperature, current temp, fan (rotation speed), fault status.

For each **zone / group**:

- **Switch** — zone on/off.  
- **Window** (linked) — damper **TargetPosition** / **CurrentPosition** (0–100%).

Indices match the **wall panel** (first AC = `0`, first zone = `0`).

---

## 🔧 Troubleshooting

| Symptom | What to check |
| --- | --- |
| **No response from HomeKit** | Enable **`debug: true`**, change a **zone switch**, and look for **`AirTouch: TX`** in the log. If there is no TX, the write never left the plugin (bridge / accessory issue). |
| **Stuck on old version after `npm install`** | Remove the package and folder, reinstall from git `#main`, confirm `package.json` version under `node_modules/homebridge-airtouch`. Ensure latest commit is **pushed** to GitHub. |
| **Connection drops** | Panel IP, Wi‑Fi, firewall. Log lines: `connection closed`, `socket down — reconnecting`. |
| **Wall panel OK, HomeKit not** | Confirm Homebridge logs **`AirTouch Homebridge: session ready`** after start. |

### CLI probe (optional)

From a clone of this repo (panel IP as argument):

```bash
npm run probe -- 192.168.1.50 --try-zone-on 0 --duration 45
```

Uses the same framing as the plugin; useful to verify LAN path to the panel.

---

## 🛠️ Development

```bash
git clone https://github.com/adrian-ijenko/AirTouch-Homebridge.git
cd AirTouch-Homebridge
npm install
npm run build
```

You can clone into any folder name you prefer; it does not affect the plugin.

TypeScript sources live in `src/`; published entry is `dist/index.js`.

---

## 📄 License

[MIT](LICENSE)

---

## 🙏 Acknowledgements

- Built for **Polyaire AirTouch 2+** touch panels using the community **TCP protocol** on port **9200**.  
- Thanks to other open-source AirTouch implementations that helped validate message formats.

---

<div align="center">

**Disclaimer:** This is a community plugin, not affiliated with Polyaire. Use at your own risk.

</div>
