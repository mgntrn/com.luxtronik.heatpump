# Changelog

## [2.0.41] - 2026-05-29

### Added
- **Heat Pump State indicator** (`heatpump_state_string`): new hidden string capability that combines the current heat pump state and hot water temperature into a single text value (e.g. `Standby (63°)` / `Hot Water (51°)`). Not shown on the device tile but selectable as the **device indicator** under Device → ⚙️ → Device display. Adapts to the Homey interface language (DE/EN).

---

## [2.0.40] - 2026-05-29

### Added
- **Refresh button** (`force_poll`): optional button capability that triggers an immediate poll of the heat pump data. Enable via Device Settings → General → "Show Refresh Button" (default: off).

### Improved
- **Automatic confirmation poll after writes:** after any write operation (mode change, temperature adjustment, button press), a debounced poll is automatically triggered 3 seconds later. This updates all capability values without waiting for the next poll interval. Multiple rapid writes are debounced into a single confirmation poll.

---

## [2.0.39] - 2026-05-29

### Fixed
- **Hot water target temperature write compatibility:** the write now targets both parameter 2 (`warmwater_target_temperature`) and parameter 105 (`temperature_hot_water_target`) to ensure the setpoint is correctly applied on all Luxtronik firmware variants, including Alpha Innotec SWCV devices where only parameter 105 is effective.

---

## [2.0.38] - 2026-05-29

### Updated
- **Custom SVG icons** for capability tiles: return temperature, supply temperature, outdoor temperatures (min./max.), heating curve (endpoint + offset, MK1), setback (limit + deltas), ZWE enable temperature, heat pump state, and heating status now each have a dedicated icon.
- `2nd Compressor` capabilities hidden from device tile (`uiComponent: null`) — still available in flows.

---

## [2.0.37] - 2026-05-28

### Fixed
- Missing capabilities (`warmwater_operation_mode`, `alarm_generic`, `measure_volume_flow`, `meter_energy_hotwater`, `meter_energy_total`, `measure_hours_compressor`, `measure_hours_hotwater`) are now automatically added to existing device instances on app start.

### Added
- **Hide cooling capabilities** option in device settings (Kühlung group): hides cooling operation mode, cooling hours, cooling release temperature and cooling inlet temperature from the device tile. Useful when cooling is supported but not used.

---

## [2.0.36] - 2026-05-27

### Added
- **Debug page** in app settings: shows all raw values and parameters from the Luxtronik controller with capability mapping, live filter, entry count, app version display, and Copy Log export for troubleshooting.
- **Version tab** in app settings: app version, SDK, compatibility, protocol, library, author and GitHub link.

### Fixed
- Room temperature (`measure_temp_room`) and room target temperature (`measure_temp_room_target`) now correctly read from the controller when an RBE room display is connected (corrected library key `temperaturw_RFV`).

---

## [2.0.34] - 2026-05-02

### Added
- **21 new read-only sensor capabilities** — all configurable via Device Settings, all values read exclusively from the controller:
  - **Hystereses:** `hotwater_hysteresis` (parameter 74, 0.5–10 K), `return_temp_hysteresis` (parameter 88, conditional)
  - **Outdoor temperature limits:** `outdoor_temp_max` (parameter 91), `outdoor_temp_min` (parameter 92)
  - **Heating limits:** `heating_limit` (parameter 700), `temp_setback_limit` (parameter 111)
  - **Heating curve** (conditional on controller visibility): `heating_curve_endpoint` (parameter 11), `heating_curve_offset` (parameter 12), `mk1_curve_endpoint` (parameter 14), `mk1_curve_offset` (parameter 15)
  - **Heating circuit limits:** `supply_temp_limit` (parameter 149), `return_temp_limit` (parameter 87), `return_temp_min` (parameter 979)
  - **Setback deltas:** `delta_heating_reduction` (parameter 13), `delta_mk1_reduction` (parameter 16)
  - **Auxiliary heater / 2nd compressor:** `temp_zwe_enable` (parameter 90), `temp_2nd_comp_heating` (parameter 95), `temp_2nd_comp_hotwater` (parameter 96)
  - **Cooling** (conditional on cooling enabled): `cooling_release_temp_cap` (parameter 110), `cooling_inlet_temp_cap` (parameter 132)
  - **Thermal Disinfection Setpoint:** `tdi_target_temperature` (parameter 47, 50–80 °C) — replaces former thermostat widget `target_temperature.tdi`
- **Flow actions:** Set hot water hysteresis, Set return temperature hysteresis, Set heating limit, Set max. outdoor temperature
- **Device Settings restructured into 7 groups:** Heizkurve, Betriebsgrenzen Aussentemperatur, Heizkreis-Temperaturgrenzen, Absenkung, Warmwasser, Zuheizer / 2. Verdichter, Kühlung
- In-app help page updated with all new parameter cards (DE/EN)

### Changed
- `target_temperature.tdi` (thermostat widget) replaced by `tdi_target_temperature` (read-only sensor); all existing thermal disinfection flows remain fully functional
- Controller is always the single source of truth — sensor display values come exclusively from each poll, never from app defaults or user settings

### Fixed
- **Settings UI always shows current controller values:** After each poll, all 21 configurable parameters are synced to their Device Setting via `_syncSetting()` — the settings page no longer shows app defaults after an update
- **No writes to controller before first successful poll:** `_firstPollDone` flag blocks all `onSettings` writes until the controller has been read at least once — prevents default or stale values from being written during app startup or update
- **`_shouldWrite` guard:** `onSettings` only writes a value if both `_firstPollDone` is true and the capability already holds a value — closes the gap where Homey initialises new settings with defaults and silently triggers `onSettings`

---

## [2.0.33] - 2026-04-26

### Changed
- Notifications now use `this.homey.notifications.createNotification()` (correct Homey SDK v3 API)
- Added push notifications for operation mode changes: heating mode, hot water mode, cooling mode
- New trigger cards: Hot Water Boost (Auxiliary) started, Hot Water Boost (Party) started (incl. duration token)
- Added `titleFormatted` with token values to flow trigger cards for heating/hot water/cooling mode changes and heat pump state changes — timeline entries now show the actual new value

### Fixed
- Notifications were silently failing due to use of `this.homey.timeline` (SDK v2 API, unavailable in device context in SDK v3)

---

## [2.0.32] - 2026-04-26

### Added
- **Homey Timeline integration:** Key events are now written directly to the Homey Timeline
  - 🔄 Heat pump state changes (e.g. Standby → Heating)
  - ⚠️ Error active (with error message)
  - ✅ Error cleared
  - 🧫 Thermal disinfection completed (with reached temperature)
  - 💧 Hot water boost (auxiliary) started / ended
  - 🎉 Hot water boost (party) started / ended
  - Timeline entries are written in the Homey interface language (DE / EN)
- **PayPal donation link** added via `contributing.donate` in app manifest

---

## [2.0.31] - 2026-04-25

### Added
- **Cooling operation mode** (`cooling_operation_mode`): Off / Automatic
  - Only shown when the controller reports cooling as available (`FreigabKuehl = 1`)
  - Supported on devices such as Novelan WSV 6.2K3M
  - Flow trigger: Cooling Mode Changed (token: `mode`)
  - Flow condition: Cooling Mode Is …
  - Flow action: Set Cooling Mode
- **Thermal Disinfection Setpoint** (`target_temperature.tdi`): 50–80 °C thermostat slider
  - Reads `parameters.temperature_hot_water_limit` (parameter 47) from controller
  - Writes via direct parameter index (`_writeRaw`)
  - Auto-stop threshold: TDI setpoint − 1 °C
- **Estimated power sensor** (`measure_power`): configurable watt value per heat pump state
- **Cumulative energy meter** (`meter_power` / kWh): activates automatically when Heating, Hot Water and Standby watt values are all > 0
  - Calculated from elapsed time between polls × configured watts
  - Stored persistently across app restarts (`setStoreValue`)
  - Appears in the Homey Energy dashboard

### Changed
- Settings UI (`settings/index.html`) completely redesigned
  - Light theme (white surfaces, gray background)
  - Burger menu with animated hamburger / close icon
  - Dropdown menu positioned dynamically below the sticky header
  - All 6 sections accessible: Sensors, Controls, Functions, Flows, Power, Settings
  - All new features (TDI, cooling mode, kWh meter) fully documented in DE / EN

---

## [2.0.30] - 2026-04-20

### Added
- **Connection watchdog:** Poll timeout (30 s) and watchdog timer (configurable threshold and check interval)
  - Device marked unavailable immediately on poll timeout
  - Watchdog checks periodically if last successful poll exceeds the threshold (default: 3× poll interval)
  - Configurable via device settings: timeout, threshold, check interval
- **Flow triggers:** Device Unavailable / Device Available
- **Flow triggers:** Outdoor Temperature Dropped Below / Rose Above (with threshold argument)
- **Flow conditions:** Outdoor Temperature Above / Below, Heating Status Is, Hot Water Status Is, Device Is Available
- **Heating Status String** (`heating_state_string`): detailed extended state from controller, translated DE/EN
- **Hot Water Status String** (`hotwater_state_string`): Lock Period / Heating Up / Temp. OK / Off, translated DE/EN
- **Thermal Disinfection Continuous** toggle with flow trigger Thermal Disinfection Ended and auto-stop
- **Hot Water Boost (Party)** mode with separate timer, flow trigger, and auto-stop
- **Flow trigger:** Error Cleared

### Changed
- README.md translated fully to English

---

## [2.0.20] - 2026-04-10

### Added
- Initial public release
- Readable sensors: temperatures, volume flow, energy (kWh), operating hours, firmware version
- Controllable: heating/hot water operation mode, heating temperature correction, hot water setpoint
- Hot water boost (auxiliary) with configurable duration and auto-stop
- Thermal disinfection toggle
- Flow triggers: State Changed, Heating Mode Changed, Hot Water Mode Changed, Error Occurred, Boost Ended
- Flow conditions: State Is, Heating Mode Is, Hot Water Mode Is, Thermal Disinfection Active, Boost Active
- Flow actions: Set Heating Mode, Set Hot Water Mode, Set Correction, Set Hot Water Temperature, Start/Stop Boost, Enable/Disable Thermal Disinfection
- Capability migration from old naming scheme
- Write protection (120 s) to prevent poll overwriting manual values
