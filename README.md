# Luxtronik Heat Pump Manager – Homey App

**App ID:** `com.luxtronik.heatpump`  
**SDK:** Homey SDK 3  
**Compatible with:** Homey Pro (Early 2023), Homey Pro (2019), Homey Bridge (Firmware >= 11.0.0)

---

## Supported Heat Pumps

This app communicates with the **Luxtronik 2.0 / 2.1** controller, which is built into heat pumps from the following manufacturers:

| Manufacturer      | Example Models                         |
|-------------------|----------------------------------------|
| Alpha Innotec     | LW/SW/WZS series                       |
| Siemens Novelan   | WPR NET, WSV series                    |
| Roth              | ThermoAura, ThermoTerra               |
| Elco              | Aquatop, Aerotop                      |
| Buderus           | Logamatic HMC20, HMC20 Z              |
| Nibe              | AP-AW10                               |
| Wolf Heiztechnik  | BWL/BWS                               |
| CTA               | Aeroheat AH CI 1-16iL                 |

---

## Feature Overview

### Readable Values (Sensors)

| Icon | Capability                                         | Description                              |
|------|----------------------------------------------------|------------------------------------------|
| <img src="assets/capabilities/heatpump_state.svg" width="24"> | Heat Pump State | Heating / Hot Water / Defrost / Standby / EVU Lock / Cooling / External / Off |
| <img src="assets/capabilities/heating_state_string.svg" width="24"> | Heating Status | Detailed heating status from the controller (Extended State String) |
| <img src="assets/capabilities/hotwater_state_string.svg" width="24"> | Hot Water Status | Lock Period / Heating Up / Temp. OK / Off |
| <img src="assets/capabilities/measure_temp_outdoor.svg" width="24"> | Outdoor Temperature | Current + rolling 24h average |
| <img src="assets/capabilities/outdoor_temp_min.svg" width="24"> <img src="assets/capabilities/outdoor_temp_max.svg" width="24"> | Min. / Max. Outdoor Temperature | Configured limits from the controller |
| <img src="assets/capabilities/supply_temp.svg" width="24"> | Flow Temperature | Heating circuit flow |
| <img src="assets/capabilities/return_temp.svg" width="24"> | Return Temperature | Heating circuit return + setpoint |
| <img src="assets/capabilities/temperature.svg" width="24"> | Hot Gas Temperature | Compressor outlet |
| <img src="assets/capabilities/measure_temp_hotwater.svg" width="24"> | Hot Water Temperature | Actual temperature |
| <img src="assets/capabilities/target_temperature_level.svg" width="24"> | Hot Water Target Temperature (read) | Setpoint read from the controller |
| <img src="assets/capabilities/temperature.svg" width="24"> | Heat Source Inlet / Outlet | Brine / air temperature |
| <img src="assets/capabilities/measure_temp_outdoor.svg" width="24"> | Suction Air Temperature | Air-source heat pumps only |
| <img src="assets/capabilities/measure_temperature.svg" width="24"> | Room Temperature Actual / Target | Only with connected RBE room display |
| <img src="assets/capabilities/flow.svg" width="24"> | Volume Flow | l/h (heat source) |
| <img src="assets/capabilities/energy.svg" width="24"> | Energy Heating / Hot Water / Total | kWh (from controller) |
| <img src="assets/capabilities/round-hours-icon.svg" width="24"> | Operating Hours Compressor / Heating / Hot Water / Cooling | Hours |
| <img src="assets/capabilities/heating_curve.svg" width="24"> | Heating Curve Endpoint / Offset | Heating curve parameters |
| <img src="assets/capabilities/heating_curve.svg" width="24"> | MK1 Curve Endpoint / Offset | MK1 mixed circuit parameters |
| <img src="assets/capabilities/heating_limit.svg" width="24"> | Heating Limit | Outdoor temperature limit for heating |
| <img src="assets/capabilities/temp_setback.svg" width="24"> | Setback Temperature Limit | Heating setback threshold |
| <img src="assets/capabilities/temp_setback.svg" width="24"> | Heating Setback Delta / MK1 Setback Delta | Temperature reduction values (K) |
| <img src="assets/capabilities/supply_temp.svg" width="24"> | Supply Temperature Limit | Maximum flow temperature |
| <img src="assets/capabilities/return_temp.svg" width="24"> | Return Temperature Limit / Min. | Return temperature boundaries |
| <img src="assets/capabilities/return_temp.svg" width="24"> | Return Temperature Hysteresis | Hysteresis for return temperature control |
| <img src="assets/capabilities/water.svg" width="24"> | Hot Water Hysteresis | Hysteresis for hot water control |
| <img src="assets/capabilities/temp_zwe_enable.svg" width="24"> | ZWE Enable Temperature | Enable temperature for 2nd heat source |
| <img src="assets/capabilities/alarm.svg" width="24"> | Error Alarm | Error active: Yes / No |
| <img src="assets/capabilities/last_poll.svg" width="24"> | Last Poll | Time of last successful poll (local time) |
| <img src="assets/capabilities/firmware_version.svg" width="24"> | Firmware Version | Controller software version |

### Controllable Values

| Capability                         | Range / Options                                              |
|------------------------------------|--------------------------------------------------------------|
| **Hot Water Thermostat**           | Setpoint: 30–65 °C · Actual: current hot water temperature   |
| **Heating Thermostat**             | Correction: −5 to +5 °C · Actual: current flow temperature  |
| **Heating Operation Mode**         | Automatic · Auxiliary · Party · Holiday · Off               |
| **Hot Water Operation Mode**       | Automatic · Auxiliary · Party · Holiday · Off               |
| **Cooling Operation Mode**         | Off · Automatic (only on devices with cooling support)       |
| **Hot Water Boost (Auxiliary)**    | Toggle – auxiliary mode, automatic stop                      |
| **Hot Water Boost (Party)**        | Toggle – party mode, automatic stop                          |
| **Thermal Disinfection**           | Toggle – continuous mode, auto-stop at target temperature    |
| **TDI Setpoint**                   | Target temperature for thermal disinfection: 50–80 °C        |

---

## Hot Water Boost

Two modes are available:

**Boost (Auxiliary Heating):** Sets the hot water operation mode to "Auxiliary"  
**Boost (Party):** Sets the hot water operation mode to "Party"

Both variants:
- Stop automatically when the hot water temperature reaches the target temperature
- Stop after the configured maximum duration (default: 60 min., configurable in device settings)
- Reset the operation mode back to "Automatic" afterwards
- Fire the flow trigger "Hot Water Boost Ended" on automatic stop
- Create a **Timeline entry** when started and when ended

---

## Thermal Disinfection

Activates continuous operation (parameter 27) for legionella protection:

- After each hot water heating cycle, thermal disinfection follows automatically
- Stops automatically when the hot water temperature ≥ TDI setpoint − 1 °C (adjustable via the "Thermal Disinfection Setpoint" thermostat slider, 50–80 °C)
- Manual stop possible at any time
- Fires the flow trigger "Thermal Disinfection Ended"
- Creates a **Timeline entry** when completed

> **Note:** Requires a connected second heat source (auxiliary heater).

---

## Cooling Mode

On devices with cooling support (e.g. Novelan WSV 6.2K3M), the **Cooling Operation Mode** capability is shown automatically:

- **Off** – cooling disabled
- **Automatic** – cooling enabled when outdoor temperature permits

The capability is only displayed when the controller reports that cooling is available (`FreigabKuehl = 1`). Cooling capabilities can be hidden via the device settings option **"Hide cooling capabilities"**. Changes are applied immediately and confirmed via a flow trigger.

---

## Estimated Power Sensor

An optional estimated power sensor (`measure_power`) can be activated in the device settings. It reports the estimated power consumption in watts based on the current heat pump state (Heating, Hot Water, Standby, etc.).

Each state can be configured separately with a typical watt value for your installation.

**Automatic energy meter (kWh):** If Heating, Hot Water, and Standby watts are all set to a value > 0, a cumulative energy meter (`meter_power`) is activated automatically. The device then appears as a consumer in the **Homey Energy dashboard**. The kWh value is calculated from the time between polls and the configured watt value, and is stored persistently across app restarts.

---

## Homey Timeline

The following events are written directly to the **Homey Timeline**:

| Event                                | Entry                                              |
|--------------------------------------|----------------------------------------------------|
| Heat pump state changes              | 🔄 `State: Heating` / `Betriebsart: Heizbetrieb`  |
| Error becomes active                 | ⚠️ `Error active: <message>`                       |
| Error cleared                        | ✅ `Error cleared`                                 |
| Thermal disinfection completed       | 🧫 `Thermal disinfection completed (65.2 °C)`      |
| Hot water boost (auxiliary) started  | 💧 `Hot water boost started (60 min)`              |
| Hot water boost (auxiliary) ended    | 💧 `Hot water boost ended`                         |
| Hot water boost (party) started      | 🎉 `Hot water boost (party) started (60 min)`      |
| Hot water boost (party) ended        | 🎉 `Hot water boost (party) ended`                 |

Timeline entries are written in the Homey interface language (German or English).

---

## Connection Watchdog

- **Poll Timeout (30s):** No response within 30 seconds → device immediately marked as unavailable
- **Watchdog Timer:** Checks periodically whether the last successful poll is too far in the past (threshold: 3× polling interval, configurable)
- **Last Poll:** Capability shows the time of the last successful poll in local time
- Device is automatically marked as available again as soon as the controller responds

---

## App Settings

### Debug Page

The app settings include a **Debug** tab that shows all raw values and parameters read from the Luxtronik controller:

- Live filter across all keys and values
- Capability mapping: shows which Homey capability each key is mapped to
- Entry count for values and parameters
- App version and poll timestamp
- **Copy Log** button – exports all data as formatted text for troubleshooting

### Version Info

The **Version** tab in the app settings shows the current app version, SDK, compatibility, protocol, library, author and GitHub link.

---

## Installation

### Requirements

- Luxtronik 2.0 / 2.1 controller reachable via LAN
- Static IP address recommended (set up DHCP reservation in your router)
- Default port: **8889** (TCP)

### Setup in Homey

1. Install the app from the Homey App Store
2. Add device: **Devices → + → Luxtronik Heat Pump Manager**
3. Enter IP address and port (default: 8889)
4. Connection test – if successful, the device is created

### Device Settings

| Setting                              | Default  | Description                                                        |
|--------------------------------------|----------|--------------------------------------------------------------------|
| IP Address                           | –        | IP of the Luxtronik controller                                     |
| Port                                 | 8889     | TCP port of the controller                                         |
| Poll Interval (seconds)              | 60       | How often the heat pump is queried (min. 10 s)                     |
| Hot Water Boost Duration (minutes)   | 60       | Maximum runtime for both boost modes                               |
| Poll Timeout (seconds)               | 30       | Time before a non-responding device is marked unavailable          |
| Watchdog Threshold (× poll interval) | 3        | Missed poll intervals before watchdog triggers                     |
| Watchdog Check Interval (seconds)    | 60       | How often the watchdog checks for a successful poll                |
| Enable Power Sensor                  | Off      | Activates estimated watt sensor per heat pump state                |
| Heating / Hot Water / Standby (W)    | 0        | Required for the automatic kWh energy meter                        |
| Hide Cooling Capabilities            | Off      | Hides cooling mode, hours, release temp. and inlet temp. from UI   |

---

## Flow Cards

### Triggers

| Card                                       | Token      | Description                                   |
|--------------------------------------------|------------|-----------------------------------------------|
| Heating Operation Mode Changed             | `mode`     | New mode as text                              |
| Hot Water Operation Mode Changed           | `mode`     | New mode as text                              |
| Cooling Operation Mode Changed             | `mode`     | New mode as text (Off / Automatic)            |
| Heat Pump Status Changed                   | `state`    | New status as text                            |
| Error Occurred                             | `error`    | Error message as text                         |
| Error Cleared                              | –          | When the error disappears                     |
| Hot Water Boost (Auxiliary) Ended          | –          | On automatic stop                             |
| Hot Water Boost (Party) Ended              | –          | On automatic stop                             |
| Thermal Disinfection Ended                 | –          | On automatic stop                             |
| Device Unavailable                         | –          | When watchdog triggers                        |
| Device Available                           | –          | When connection is restored                   |
| Outdoor Temperature Dropped Below … °C    | Threshold  | Threshold comparison with current value       |
| Outdoor Temperature Rose Above … °C       | Threshold  | Threshold comparison with current value       |

### Conditions

| Card                                       | Parameter              |
|--------------------------------------------|------------------------|
| Heating Operation Mode Is …               | Dropdown               |
| Hot Water Operation Mode Is …             | Dropdown               |
| Cooling Operation Mode Is …               | Dropdown (Off / Automatic) |
| Heat Pump Status Is …                     | Dropdown               |
| Heating Status Is …                       | Free text              |
| Hot Water Status Is …                     | Dropdown (4 values)    |
| Outdoor Temperature Is Above … °C         | Number                 |
| Outdoor Temperature Is Below … °C         | Number                 |
| Thermal Disinfection Is Active            | –                      |
| Hot Water Boost (Auxiliary) Is Active     | –                      |
| Hot Water Boost (Party) Is Active         | –                      |
| Device Is Available                       | –                      |

### Actions

| Card                                               | Parameter                      |
|----------------------------------------------------|--------------------------------|
| Set Heating Operation Mode                         | Dropdown (Automatic … Off)     |
| Set Hot Water Operation Mode                       | Dropdown (Automatic … Off)     |
| Set Cooling Operation Mode                         | Dropdown (Off / Automatic)     |
| Set Heating Temperature Correction                 | Number: −5 … +5 °C             |
| Set Hot Water Target Temperature                   | Number: 30 … 65 °C             |
| Adjust Hot Water Target Temperature (relative)     | Offset: −20 … +20 °C           |
| Start Hot Water Boost (Auxiliary)                  | Duration in minutes (5–480)    |
| Stop Hot Water Boost (Auxiliary)                   | –                              |
| Start Hot Water Boost (Party)                      | Duration in minutes (5–480)    |
| Stop Hot Water Boost (Party)                       | –                              |
| Enable Thermal Disinfection                        | –                              |
| Disable Thermal Disinfection                       | –                              |

---

## Operation Mode Codes (Reference)

| Code | Heating    | Hot Water  | Cooling    |
|------|------------|------------|------------|
| 0    | Automatic  | Automatic  | Off        |
| 1    | Auxiliary  | Auxiliary  | Automatic  |
| 2    | Party      | Party      | –          |
| 3    | Holiday    | Holiday    | –          |
| 4    | Off        | Off        | –          |

---

## Heat Pump Status Codes (Reference)

| Slug            | Meaning                       |
|-----------------|-------------------------------|
| `heating`       | Heating                       |
| `hotwater`      | Hot water heating             |
| `swimming`      | Swimming pool heating         |
| `provider_lock` | EVU lock                      |
| `defrost`       | Defrost                       |
| `off`           | Off                           |
| `external`      | External (2nd heat source)    |
| `cooling`       | Cooling                       |
| `standby`       | Standby                       |

---

## Notes & Warnings

> ⚠️ **Caution:** Incorrect settings can put the heat pump into an error state. Only make changes if the function of the parameter is known.

- The thermostat correction (`target_temperature.heating`) shifts the heating curve by the set value. Positive values → warmer, negative values → cooler.
- All write operations are sent to the controller immediately.
- Write protection prevents polling cycles from immediately overwriting manually set values (120s protection window).
- The cooling mode capability is only shown when the controller reports cooling as available (`FreigabKuehl = 1`).
- Room temperature capabilities (`measure_temp_room`, `measure_temp_room_target`) are only populated when an RBE room display is physically connected to the controller.

---

## Technical Background

The app communicates via TCP (port 8889) directly with the Luxtronik controller.  
The protocol library used is [`luxtronik2`](https://www.npmjs.com/package/luxtronik2).

Parameter reference:
- [Bouni/python-luxtronik – parameters.py](https://github.com/Bouni/python-luxtronik/blob/master/luxtronik/parameters.py)
- [Bouni/python-luxtronik – calculations.py](https://github.com/Bouni/python-luxtronik/blob/master/luxtronik/calculations.py)
- [FHEM Luxtronik Wiki (DE)](https://wiki.fhem.de/wiki/Luxtronik_2.0)

---

## License

MIT License – see [LICENSE](LICENSE)

---

## 🤖 AI Development

This app was developed entirely with the help of **Claude (Anthropic AI)**.

---

## 🙏 Acknowledgements

- [RobinFlikkema/homey-luxtronik](https://github.com/RobinFlikkema/homey-luxtronik)
- [coolchip/luxtronik2](https://github.com/coolchip/luxtronik2) (npm package)
- [BenPru/luxtronik](https://github.com/BenPru/luxtronik) (Home Assistant integration)
- [Bouni/luxtronik](https://github.com/Bouni/luxtronik)
