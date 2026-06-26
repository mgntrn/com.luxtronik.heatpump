'use strict';

const { Device } = require('homey');
const luxtronik = require('luxtronik2');

// Betriebsmodus-Bezeichnungen
const OPERATION_MODE_LABELS = {
  0: 'Automatic',
  1: 'Second Heat Source',
  2: 'Party',
  3: 'Holidays',
  4: 'Off',
};
const OPERATION_MODE_LABELS_DE = {
  0: 'Automatik',
  1: 'Zuheizer',
  2: 'Party',
  3: 'Ferien',
  4: 'Aus',
};

// heatpump_state3 = Extended State (Detailstatus der Wärmepumpe)
// Quelle: luxtronik2/types.js → extendetStateMessages
const HEATPUMP_STATE_MAP = {
  0:  'heating',        // Heizbetrieb
  1:  'standby',        // Keine Anforderung
  2:  'standby',        // Netz Einschaltverzögerung
  3:  'standby',        // Schaltspielzeit
  4:  'provider_lock',  // EVU Sperrzeit
  5:  'hotwater',       // Brauchwasser
  6:  'standby',        // Estrich Programm
  7:  'defrost',        // Abtauen
  8:  'standby',        // Pumpenvorlauf
  9:  'hotwater',       // Thermische Desinfektion
  10: 'cooling',        // Kühlbetrieb
  12: 'swimming',       // Schwimmbad / Photovoltaik
  13: 'external',       // Heizen Ext.
  14: 'external',       // Brauchwasser Ext.
  16: 'standby',        // Durchflussüberwachung
  17: 'heating',        // Elektrische Zusatzheizung
  18: 'heating',        // Verdichter heizt auf (Kompressor-Aufwärmphase)
  19: 'hotwater',       // Warmwasser Nachheizung
};


// Mapping: Originalstring der luxtronik2-Library → { en, de }
// Quelle: luxtronik2/types.js → extendetStateMessages + createExtendedStateString()
// Hinweis: state3=7 (Abtauen) konkateniert die Library ohne Leerzeichen (Bug im npm)
const HEATING_STATE_MAP = {
  'Heizbetrieb':                   { en: 'Heating',                    de: 'Heizbetrieb' },
  'Keine Anforderung':              { en: 'No Request',                 de: 'Keine Anforderung' },
  'Netz Einschaltverzoegerung':     { en: 'Grid Startup Delay',         de: 'Netz Einschaltverzögerung' },
  'Schaltspielzeit':                { en: 'Switching Cycle Time',       de: 'Schaltspielzeit' },
  'EVU Sperrzeit':                  { en: 'EVU Lock',                   de: 'EVU Sperrzeit' },
  'Brauchwasser':                   { en: 'Hot Water',                  de: 'Brauchwasser' },
  // Estrich Programm: dynamischer Suffix "Stufe X - Y °C" → Sonderbehandlung im Poll
  'Pumpenvorlauf':                  { en: 'Pump Pre-run',               de: 'Pumpenvorlauf' },
  'Thermische Desinfektion':        { en: 'Thermal Disinfection',       de: 'Thermische Desinfektion' },
  'Kuehlbetrieb':                   { en: 'Cooling',                    de: 'Kühlbetrieb' },
  'Schwimmbad/Photovoltaik':        { en: 'Pool / Photovoltaic',        de: 'Schwimmbad / Photovoltaik' },
  'Heizen Ext.':                    { en: 'External Heating',           de: 'Heizen Ext.' },
  'Brauchwasser Ext.':              { en: 'External Hot Water',         de: 'Brauchwasser Ext.' },
  'Durchflussueberwachung':         { en: 'Flow Monitoring',            de: 'Durchflussüberwachung' },
  'Elektrische Zusatzheizung':      { en: 'Electric Auxiliary Heating', de: 'Elektrische Zusatzheizung' },
  'Warmw. Nachheizung':             { en: 'DHW Reheating',              de: 'Warmwasser Nachheizung' },
  'Unknown [18]':                   { en: 'Compressor Heating Up',      de: 'Verdichter heizt auf' },
  // state3=7: Library konkateniert Basisstring + Subtyp ohne Leerzeichen
  'AbtauenAbtauen (Kreisumkehr)':  { en: 'Defrost (Reverse Cycle)',    de: 'Abtauen (Kreisumkehr)' },
  'AbtauenLuftabtauen':            { en: 'Air Defrost',                de: 'Luftabtauen' },
  'AbtauenAbtauen':                { en: 'Defrost',                    de: 'Abtauen' },
};

// Mapping: Originalstring der luxtronik2-Library → { en, de }
// Quelle: luxtronik2/utils.js → createHotWaterStateString()
const HOTWATER_STATE_MAP = {
  'Sperrzeit': { en: 'Lock Period',    de: 'Sperrzeit' },
  'Aufheizen': { en: 'Heating Up',     de: 'Aufheizen' },
  'Temp. OK':  { en: 'Temperature OK', de: 'Temperatur OK' },
  'Aus':       { en: 'Off',            de: 'Aus' },
};

// Capability-Titel die beim dynamischen addCapability() explizit gesetzt werden müssen,
// weil Homey den Titel beim ersten Hinzufügen speichert und spätere app.json-Änderungen
// nicht automatisch auf bereits vorhandene Capabilities anwendet.
const CAPABILITY_TITLE_FIXES = {
  'measure_temp_suction_air': { title: { en: 'Suction Air Temperature', de: 'Ansaugluft Temperatur' } },
  'measure_temp_room':        { title: { en: 'Room Temperature',        de: 'Raumtemperatur' } },
  'measure_temp_room_target': { title: { en: 'Room Target Temperature', de: 'Raumtemperatur Soll' } },
  'measure_hours_cooling':    { title: { en: 'Cooling Operating Hours', de: 'Betriebsstunden Kühlung' } },
};

// heatpump_state1 = Grob-Status (0=läuft, 1=steht, 4=Fehler)
// Nur für Fehlerkennung verwendet
const HEATPUMP_STATE1_ERROR = 4;

// Emoji-Anzeige für heatpump_state_string (Geräteanzeige / Indicator)
const STATE_EMOJI = {
  heating:       '🔥',
  hotwater:      '💧',
  defrost:       '🌡️',
  standby:       '⏸️',
  provider_lock: '🔒',
  cooling:       '❄️',
  swimming:      '🏊',
  external:      '⚡',
  off:           '⭕',
  unknown:       '❓',
};

// Anzeigebezeichnungen für die Timeline (DE/EN)
const STATE_TIMELINE_LABELS = {
  heating:       { de: 'Heizbetrieb',        en: 'Heating' },
  hotwater:      { de: 'Warmwasser',          en: 'Hot Water' },
  defrost:       { de: 'Abtauen',             en: 'Defrost' },
  standby:       { de: 'Standby',             en: 'Standby' },
  provider_lock: { de: 'EVU-Sperre',          en: 'EVU Lock' },
  cooling:       { de: 'Kühlen',              en: 'Cooling' },
  swimming:      { de: 'Schwimmbad',          en: 'Swimming Pool' },
  external:      { de: 'Extern (Zuheizer)',   en: 'External (Boiler)' },
  off:           { de: 'Aus / Fehler',        en: 'Off / Error' },
  unknown:       { de: 'Unbekannt',           en: 'Unknown' },
};


class LuxtronikHeatpumpDevice extends Device {

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onInit() {
    this.log('LuxtronikHeatpumpDevice init:', this.getName());

    // ── Capability-Migration: alte Namen → neue Namen ────────────────────────
    const CAPABILITY_RENAMES = {
      'luxtronik_temp_outdoor':         'measure_temp_outdoor',
      'luxtronik_temp_outdoor_avg':     'measure_temp_outdoor_avg',
      'luxtronik_temp_flow':            'measure_temp_flow',
      'luxtronik_temp_return':          'measure_temp_return',
      'luxtronik_temp_return_target':   'measure_temp_return_target',
      'luxtronik_temp_hotgas':          'measure_temp_hotgas',
      'luxtronik_temp_hotwater':        'measure_temp_hotwater',
      'luxtronik_temp_hotwater_target': 'measure_temp_hotwater_target',
      'luxtronik_temp_source_in':       'measure_temp_source_in',
      'luxtronik_temp_source_out':      'measure_temp_source_out',
      'luxtronik_temp_suction_air':     'measure_temp_suction_air',
      'luxtronik_temp_room':            'measure_temp_room',
      'luxtronik_temp_room_target':     'measure_temp_room_target',
      'luxtronik_energy_heating':       'meter_energy_heating',
      'luxtronik_energy_hotwater':      'meter_energy_hotwater',
      'luxtronik_energy_total':         'meter_energy_total',
      'luxtronik_hours_compressor':     'measure_hours_compressor',
      'luxtronik_hours_heating':        'measure_hours_heating',
      'luxtronik_hours_hotwater':       'measure_hours_hotwater',
      'luxtronik_volume_flow':          'measure_volume_flow',
      'alarm_generic.error':            'alarm_generic',
    };

    for (const [oldCap, newCap] of Object.entries(CAPABILITY_RENAMES)) {
      if (this.hasCapability(oldCap)) {
        this.log(`Migriere Capability: ${oldCap} -> ${newCap}`);
        try {
          if (!this.hasCapability(newCap)) {
            await this.addCapability(newCap);
          }
          await this.removeCapability(oldCap);
        } catch (e) {
          this.error(`Migration fehlgeschlagen (${oldCap} -> ${newCap}):`, e.message);
        }
      }
    }
    // ── Neue Capabilities hinzufügen falls noch nicht vorhanden ─────────────────
    const NEW_CAPABILITIES = [
      // Basis-Capabilities (seit v2.0.0, aber bei sehr alten Installs ggf. fehlend)
      'warmwater_operation_mode',
      'alarm_generic',
      'measure_volume_flow',
      'meter_energy_hotwater',
      'meter_energy_total',
      'measure_hours_compressor',
      'measure_hours_hotwater',
      // Später hinzugefügte Capabilities
      'hotwater_boost', 'firmware_version', 'thermal_disinfection_continuous', 'hotwater_boost_party',
      'target_temperature', 'measure_temperature', 'heating_state_string', 'hotwater_state_string',
      'target_temperature.heating', 'measure_temperature.heating', 'last_poll',
      'tdi_target_temperature', 'hotwater_hysteresis', 'return_temp_hysteresis',
      'heating_limit', 'outdoor_temp_max', 'heating_curve_endpoint', 'heating_curve_offset',
      'mk1_curve_endpoint', 'mk1_curve_offset', 'outdoor_temp_min', 'temp_setback_limit',
      'supply_temp_limit', 'return_temp_limit', 'return_temp_min',
      'delta_heating_reduction', 'delta_mk1_reduction',
      'temp_zwe_enable', 'temp_2nd_comp_heating', 'temp_2nd_comp_hotwater',
      'cooling_release_temp_cap', 'cooling_inlet_temp_cap',
      'heatpump_state_string', 'measure_temp_flow',
      // Hinweis: cooling_operation_mode, measure_temp_room, measure_temp_suction_air,
      // measure_hours_cooling, measure_power, meter_power werden bedingt hinzugefügt
    ];
    for (const cap of NEW_CAPABILITIES) {
      if (!this.hasCapability(cap)) {
        this.log(`Füge neue Capability hinzu: ${cap}`);
        try { await this.addCapability(cap); }
        catch (e) { this.error(`Capability ${cap} konnte nicht hinzugefügt werden:`, e.message); }
      }
    }
    // ── Settings-Migration: hide_cooling → cooling_visibility ───────────────────
    if (this.getSetting('hide_cooling') === true && this.getSetting('cooling_visibility') === 'auto') {
      this.log('Migriere hide_cooling → cooling_visibility: hide');
      try { await this.setSettings({ cooling_visibility: 'hide' }); } catch (e) { this.error('Settings-Migration hide_cooling fehlgeschlagen:', e.message); }
    }

    // ── Cleanup: unerwünschte Capabilities entfernen ────────────────────────────
    const REMOVE_CAPABILITIES = ['thermal_disinfection', 'warmwater_target_temperature', 'heating_temperature_correction', 'target_temperature.tdi'];
    for (const cap of REMOVE_CAPABILITIES) {
      if (this.hasCapability(cap)) {
        this.log(`Entferne Capability: ${cap}`);
        try { await this.removeCapability(cap); }
        catch (e) { this.error(`removeCapability ${cap} fehlgeschlagen:`, e.message); }
      }
    }


    // ── Capability-Titel korrigieren (wurden beim ersten addCapability() in der alten
    //    App-Version ggf. auf Deutsch gespeichert; setCapabilityOptions() überschreibt
    //    den in Homey gespeicherten Titel für bereits vorhandene Capabilities) ─────────
    for (const [cap, options] of Object.entries(CAPABILITY_TITLE_FIXES)) {
      if (this.hasCapability(cap)) {
        try { await this.setCapabilityOptions(cap, options); }
        catch (e) { this.error(`setCapabilityOptions ${cap} fehlgeschlagen:`, e.message); }
      }
    }

    // ── Ende Migration ────────────────────────────────────────────────────────

    const s = this.getSettings();
    this._ip           = s.ip;
    this._port         = Number(s.port) || 8889;
    this._pollInterval = (Number(s.poll_interval) || 60) * 1000;
    this._pump         = null;
    this._timer        = null;
    this._lastState    = null;
    this._lastPollTime = null;
    this._lastHeatingMode   = null;
    this._lastWarmwaterMode = null;
    this._lastCoolingMode   = null;
    this._lastErrorState    = false;
    // Timestamp map: nach einem Write diese Capability für 2 Polls nicht überschreiben
    this._writeProtectUntil = {};
    // Erst nach dem ersten erfolgreichen Poll dürfen Einstellungen an den Controller
    // geschrieben werden — verhindert dass Default-Werte (aus driver.compose.json)
    // oder Stale-Values aus der vorherigen Session den Controller überschreiben,
    // bevor die echten Werte gelesen wurden.
    this._firstPollDone = false;
    // Schnelladungs-Timer
    this._boostTimer      = null;
    this._boostPartyTimer = null;
    this._lastSuccessfulPoll = null;
    this._watchdogTimer      = null;
    this._pollTimeout        = null;

    // Flow-Trigger
    this._triggerHeatingModeChanged  = this.homey.flow.getDeviceTriggerCard('heating_operation_mode_changed');
    this._triggerWarmwaterModeChanged = this.homey.flow.getDeviceTriggerCard('warmwater_operation_mode_changed');
    this._triggerCoolingModeChanged   = this.homey.flow.getDeviceTriggerCard('cooling_operation_mode_changed');
    this._triggerStateChanged         = this.homey.flow.getDeviceTriggerCard('heatpump_state_changed');
    this._triggerErrorOccurred        = this.homey.flow.getDeviceTriggerCard('error_occurred');
    this._triggerBoostStarted             = this.homey.flow.getDeviceTriggerCard('hotwater_boost_started');
    this._triggerBoostEnded               = this.homey.flow.getDeviceTriggerCard('hotwater_boost_ended');
    this._triggerBoostPartyStarted        = this.homey.flow.getDeviceTriggerCard('hotwater_boost_party_started');
    this._triggerBoostPartyEnded          = this.homey.flow.getDeviceTriggerCard('hotwater_boost_party_ended');
    this._triggerDeviceUnavailable        = this.homey.flow.getDeviceTriggerCard('device_unavailable');
    this._triggerDeviceAvailable          = this.homey.flow.getDeviceTriggerCard('device_available');
    this._triggerThermalDisinfEnded       = this.homey.flow.getDeviceTriggerCard('thermal_disinfection_ended');
    this._triggerErrorCleared             = this.homey.flow.getDeviceTriggerCard('error_cleared');
    this._triggerOutdoorTempDroppedBelow  = this.homey.flow.getDeviceTriggerCard('outdoor_temp_dropped_below')
      .registerRunListener((args, state) => state.temperature <= args.temperature);
    this._triggerOutdoorTempRoseAbove     = this.homey.flow.getDeviceTriggerCard('outdoor_temp_rose_above')
      .registerRunListener((args, state) => state.temperature >= args.temperature);

    // Flow-Bedingungen
    this.homey.flow.getConditionCard('heating_operation_mode_is')
      .registerRunListener((args) => String(this.getCapabilityValue('heating_operation_mode')) === String(args.mode));

    this.homey.flow.getConditionCard('warmwater_operation_mode_is')
      .registerRunListener((args) => String(this.getCapabilityValue('warmwater_operation_mode')) === String(args.mode));

    this.homey.flow.getConditionCard('cooling_operation_mode_is')
      .registerRunListener((args) => String(this.getCapabilityValue('cooling_operation_mode')) === String(args.mode));

    this.homey.flow.getConditionCard('heatpump_state_is')
      .registerRunListener((args) => this.getCapabilityValue('heatpump_state') === args.state);

    this.homey.flow.getConditionCard('thermal_disinfection_is_active')
      .registerRunListener(() => this.getCapabilityValue('thermal_disinfection_continuous') === true);

    this.homey.flow.getConditionCard('hotwater_boost_is_active')
      .registerRunListener(() => this.getCapabilityValue('hotwater_boost') === true);

    this.homey.flow.getConditionCard('hotwater_boost_party_is_active')

    this.homey.flow.getConditionCard('device_is_available')
      .registerRunListener(() => this.getAvailable());

    this.homey.flow.getConditionCard('heating_state_is')
      .registerRunListener((args) => {
        const current = this.getCapabilityValue('heating_state_string') || '';
        return current.toLowerCase().includes(args.state.toLowerCase());
      });

    this.homey.flow.getConditionCard('hotwater_state_is')
      .registerRunListener((args) => {
        const current = this.getCapabilityValue('hotwater_state_string') || '';
        return current === args.state;
      });

    this.homey.flow.getConditionCard('outdoor_temp_above')
      .registerRunListener((args) => {
        const temp = this.getCapabilityValue('measure_temp_outdoor');
        return temp !== null && temp > args.temperature;
      });

    this.homey.flow.getConditionCard('outdoor_temp_below')
      .registerRunListener((args) => {
        const temp = this.getCapabilityValue('measure_temp_outdoor');
        return temp !== null && temp < args.temperature;
      });

    this.homey.flow.getConditionCard('hotwater_boost_party_is_active')
      .registerRunListener(() => this.getCapabilityValue('hotwater_boost_party') === true);

    // Flow-Aktionen
    this.homey.flow.getActionCard('set_heating_operation_mode')
      .registerRunListener(async (args) => this._setHeatingOperationMode(parseInt(args.mode, 10)));

    this.homey.flow.getActionCard('set_warmwater_operation_mode')
      .registerRunListener(async (args) => this._setWarmwaterOperationMode(parseInt(args.mode, 10)));

    this.homey.flow.getActionCard('set_cooling_operation_mode')
      .registerRunListener(async (args) => this._setCoolingOperationMode(parseInt(args.mode, 10)));

    this.homey.flow.getActionCard('set_heating_temperature_correction')
      .registerRunListener(async (args) => this._setHeatingTemperatureCorrection(parseFloat(args.value)));

    this.homey.flow.getActionCard('set_warmwater_target_temperature')
      .registerRunListener(async (args) => this._setWarmwaterTargetTemperature(parseFloat(args.value)));

    this.homey.flow.getActionCard('start_hotwater_boost')
      .registerRunListener(async (args) => this._startHotwaterBoost(parseInt(args.duration, 10)));

    this.homey.flow.getActionCard('stop_hotwater_boost')
      .registerRunListener(async () => this._stopHotwaterBoost());

    this.homey.flow.getActionCard('start_hotwater_boost_party')
      .registerRunListener(async (args) => this._startHotwaterBoostParty(parseInt(args.duration, 10)));

    this.homey.flow.getActionCard('stop_hotwater_boost_party')
      .registerRunListener(async () => this._stopHotwaterBoostParty());


    this.homey.flow.getActionCard('enable_thermal_disinfection')
      .registerRunListener(async () => this._setThermalDisinfectionContinuous(true));

    this.homey.flow.getActionCard('disable_thermal_disinfection')
      .registerRunListener(async () => this._setThermalDisinfectionContinuous(false));

    this.homey.flow.getActionCard('set_outdoor_temp_max')
      .registerRunListener(async (args) => this._setOutdoorTempMax(parseFloat(args.value)));

    this.homey.flow.getActionCard('set_heating_limit')
      .registerRunListener(async (args) => this._setHeatingLimit(parseFloat(args.value)));

    this.homey.flow.getActionCard('set_return_temp_hysteresis')
      .registerRunListener(async (args) => this._setReturnTempHysteresis(parseFloat(args.value)));

    this.homey.flow.getActionCard('set_hotwater_hysteresis')
      .registerRunListener(async (args) => this._setHotwaterHysteresis(parseFloat(args.value)));

    // Capability-Listener (UI)
    this.registerCapabilityListener('heating_operation_mode',        async (v) => this._setHeatingOperationMode(parseInt(v, 10)));
    this.registerCapabilityListener('warmwater_operation_mode',       async (v) => this._setWarmwaterOperationMode(parseInt(v, 10)));
    this.registerCapabilityListener('cooling_operation_mode',         async (v) => this._setCoolingOperationMode(parseInt(v, 10)));
    if (this.hasCapability('heating_temperature_correction')) this.registerCapabilityListener('heating_temperature_correction', async (v) => this._setHeatingTemperatureCorrection(parseFloat(v)));
    this.registerCapabilityListener('target_temperature',               async (v) => this._setWarmwaterTargetTemperature(parseFloat(v)));
    this.registerCapabilityListener('target_temperature.heating',      async (v) => this._setHeatingTemperatureCorrection(parseFloat(v)));
    if (this.hasCapability('warmwater_target_temperature')) this.registerCapabilityListener('warmwater_target_temperature',   async (v) => this._setWarmwaterTargetTemperature(parseFloat(v)));
    this.registerCapabilityListener('hotwater_boost_party',             async (v) => {
      const s = await this.getSettings();
      if (v) {
        await this._startHotwaterBoostParty(Number(s.hotwater_boost_duration) || 60);
      } else {
        await this._stopHotwaterBoostParty();
      }
    });

    this.registerCapabilityListener('thermal_disinfection_continuous', async (v) => {
      await this._setThermalDisinfectionContinuous(v);
    });

    this.registerCapabilityListener('hotwater_boost',                  async (v) => {
      if (v) {
        const s = this.getSettings();
        await this._startHotwaterBoost(Number(s.hotwater_boost_duration) || 60);
      } else {
        await this._stopHotwaterBoost();
      }
    });

    // Force-Poll Button: Capability bedingt hinzufügen und Listener registrieren
    if (this.getSetting('show_force_poll') === true) {
      if (!this.hasCapability('force_poll')) {
        try { await this.addCapability('force_poll'); } catch (e) { this.error('addCapability force_poll:', e.message); }
      }
      this._registerForcePollListener();
    } else if (this.hasCapability('force_poll')) {
      try { await this.removeCapability('force_poll'); } catch (e) { this.error('removeCapability force_poll:', e.message); }
    }

    this._connectPump();
    await this._doPoll();
    this._firstPollDone = true;  // Ab jetzt dürfen onSettings-Handler schreiben
    this._startPolling();
  }

  async onDeleted() {
    this._stopPolling();
    if (this._boostTimer)           { clearTimeout(this._boostTimer);           this._boostTimer           = null; }
    if (this._boostPartyTimer)      { clearTimeout(this._boostPartyTimer);      this._boostPartyTimer      = null; }
    if (this._watchdogTimer)        { clearInterval(this._watchdogTimer);       this._watchdogTimer        = null; }
    if (this._pollTimeout)          { clearTimeout(this._pollTimeout);          this._pollTimeout          = null; }
    if (this._pollAfterWriteTimer)  { clearTimeout(this._pollAfterWriteTimer);  this._pollAfterWriteTimer  = null; }
  }

  async onSettings({ newSettings, changedKeys }) {
    this._stopPolling();
    this._ip           = newSettings.ip;
    this._port         = Number(newSettings.port) || 8889;
    this._pollInterval = (Number(newSettings.poll_interval) || 60) * 1000;

    // Hilfsfunktion: Einstellung nur schreiben wenn:
    // 1. Der erste Poll bereits abgeschlossen ist (echte Werte von der WP gelesen)
    // 2. Die Capability bereits einen Wert hat (kein Null-/Default-Zustand)
    // Verhindert dass Default-Werte oder Stale-Values aus der vorherigen Session
    // den Controller überschreiben bevor die echten Werte geladen wurden.
    const _shouldWrite = (capabilityId) => this._firstPollDone && this.getCapabilityValue(capabilityId) !== null;

    // TDI-Solltemperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('tdi_setpoint_setting') && _shouldWrite('tdi_target_temperature')) {
      const val = parseFloat(newSettings.tdi_setpoint_setting);
      if (val >= 50 && val <= 80) {
        this._connectPump();
        await this._setTdiTargetTemperature(val).catch((e) => this.error('TDI-Solltemperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Max. Aussentemperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('outdoor_temp_max_setting') && _shouldWrite('outdoor_temp_max')) {
      const val = parseFloat(newSettings.outdoor_temp_max_setting);
      if (val >= 10 && val <= 45) {
        this._connectPump();
        await this._setOutdoorTempMax(val).catch((e) => this.error('Max. Aussentemperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Heizgrenze: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('heating_limit_setting') && _shouldWrite('heating_limit')) {
      const val = parseFloat(newSettings.heating_limit_setting);
      if (val >= 5 && val <= 30) {
        this._connectPump();
        await this._setHeatingLimit(val).catch((e) => this.error('Heizgrenze Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Warmwasser-Hysterese: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('hotwater_hysteresis_setting') && _shouldWrite('hotwater_hysteresis')) {
      const val = parseFloat(newSettings.hotwater_hysteresis_setting);
      if (val >= 0.5 && val <= 10) {
        this._connectPump();
        await this._setHotwaterHysteresis(val).catch((e) => this.error('Warmwasser-Hysterese Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Rücklauf-Hysterese: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('return_temp_hysteresis_setting') && _shouldWrite('return_temp_hysteresis')) {
      const val = parseFloat(newSettings.return_temp_hysteresis_setting);
      if (val >= 0.5 && val <= 10) {
        this._connectPump();
        await this._setReturnTempHysteresis(val).catch((e) => this.error('Rücklauf-Hysterese Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Heizkurve Endpunkt: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('heating_curve_endpoint_setting') && _shouldWrite('heating_curve_endpoint')) {
      const val = parseFloat(newSettings.heating_curve_endpoint_setting);
      if (val >= 20 && val <= 70) {
        this._connectPump();
        await this._setHeatingCurveEndpoint(val).catch((e) => this.error('Heizkurve Endpunkt Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Heizkurve Parallelverschiebung: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('heating_curve_offset_setting') && _shouldWrite('heating_curve_offset')) {
      const val = parseFloat(newSettings.heating_curve_offset_setting);
      if (val >= 5 && val <= 35) {
        this._connectPump();
        await this._setHeatingCurveOffset(val).catch((e) => this.error('Heizkurve Parallelverschiebung Schreiben fehlgeschlagen:', e.message));
      }
    }

    // MK1 Kurve Endpunkt: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('mk1_curve_endpoint_setting') && _shouldWrite('mk1_curve_endpoint')) {
      const val = parseFloat(newSettings.mk1_curve_endpoint_setting);
      if (val >= 20 && val <= 70) {
        this._connectPump();
        await this._setMk1CurveEndpoint(val).catch((e) => this.error('MK1 Kurve Endpunkt Schreiben fehlgeschlagen:', e.message));
      }
    }

    // MK1 Kurve Parallelverschiebung: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('mk1_curve_offset_setting') && _shouldWrite('mk1_curve_offset')) {
      const val = parseFloat(newSettings.mk1_curve_offset_setting);
      if (val >= 5 && val <= 35) {
        this._connectPump();
        await this._setMk1CurveOffset(val).catch((e) => this.error('MK1 Kurve Parallelverschiebung Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Min. Aussentemperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('outdoor_temp_min_setting') && _shouldWrite('outdoor_temp_min')) {
      const val = parseFloat(newSettings.outdoor_temp_min_setting);
      if (val >= -30 && val <= 10) {
        this._connectPump();
        await this._setOutdoorTempMin(val).catch((e) => this.error('Min. Aussentemperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Absenk-Temperaturgrenze: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('temp_setback_limit_setting') && _shouldWrite('temp_setback_limit')) {
      const val = parseFloat(newSettings.temp_setback_limit_setting);
      if (val >= -20 && val <= 10) {
        this._connectPump();
        await this._setTempSetbackLimit(val).catch((e) => this.error('Absenk-Temperaturgrenze Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Vorlauftemperatur-Grenze: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('supply_temp_limit_setting') && _shouldWrite('supply_temp_limit')) {
      const val = parseFloat(newSettings.supply_temp_limit_setting);
      if (val >= 20 && val <= 70) {
        this._connectPump();
        await this._setSupplyTempLimit(val).catch((e) => this.error('Vorlauftemperatur-Grenze Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Rücklauftemperatur-Grenze: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('return_temp_limit_setting') && _shouldWrite('return_temp_limit')) {
      const val = parseFloat(newSettings.return_temp_limit_setting);
      if (val >= 20 && val <= 65) {
        this._connectPump();
        await this._setReturnTempLimit(val).catch((e) => this.error('Rücklauftemperatur-Grenze Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Rücklauftemperatur Minimum: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('return_temp_min_setting') && _shouldWrite('return_temp_min')) {
      const val = parseFloat(newSettings.return_temp_min_setting);
      if (val >= 5 && val <= 30) {
        this._connectPump();
        await this._setReturnTempMin(val).catch((e) => this.error('Rücklauftemperatur Minimum Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Absenkung Heizung Delta: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('delta_heating_reduction_setting') && _shouldWrite('delta_heating_reduction')) {
      const val = parseFloat(newSettings.delta_heating_reduction_setting);
      if (val >= -15 && val <= 10) {
        this._connectPump();
        await this._setDeltaHeatingReduction(val).catch((e) => this.error('Absenkung Heizung Delta Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Absenkung MK1 Delta: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('delta_mk1_reduction_setting') && _shouldWrite('delta_mk1_reduction')) {
      const val = parseFloat(newSettings.delta_mk1_reduction_setting);
      if (val >= -15 && val <= 10) {
        this._connectPump();
        await this._setDeltaMk1Reduction(val).catch((e) => this.error('Absenkung MK1 Delta Schreiben fehlgeschlagen:', e.message));
      }
    }

    // ZWE Freigabe-Temperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('temp_zwe_enable_setting') && _shouldWrite('temp_zwe_enable')) {
      const val = parseFloat(newSettings.temp_zwe_enable_setting);
      if (val >= -20 && val <= 20) {
        this._connectPump();
        await this._setTempZweEnable(val).catch((e) => this.error('ZWE Freigabe-Temperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // 2. Verdichter Aussentemp. Heizen: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('temp_2nd_comp_heating_setting') && _shouldWrite('temp_2nd_comp_heating')) {
      const val = parseFloat(newSettings.temp_2nd_comp_heating_setting);
      if (val >= -20 && val <= 30) {
        this._connectPump();
        await this._setTemp2ndCompHeating(val).catch((e) => this.error('2. Verdichter Aussentemp. Heizen Schreiben fehlgeschlagen:', e.message));
      }
    }

    // 2. Verdichter Vorlauftemp. Warmwasser: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('temp_2nd_comp_hotwater_setting') && _shouldWrite('temp_2nd_comp_hotwater')) {
      const val = parseFloat(newSettings.temp_2nd_comp_hotwater_setting);
      if (val >= 10 && val <= 70) {
        this._connectPump();
        await this._setTemp2ndCompHotwater(val).catch((e) => this.error('2. Verdichter Vorlauftemp. Warmwasser Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Kühlung Freigabe-Temperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('cooling_release_temp_setting') && _shouldWrite('cooling_release_temp_cap')) {
      const val = parseFloat(newSettings.cooling_release_temp_setting);
      if (val >= 10 && val <= 40) {
        this._connectPump();
        await this._setCoolingReleaseTemp(val).catch((e) => this.error('Kühlung Freigabe-Temperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Kühlung Einlauftemperatur: direkt schreiben wenn Einstellung geändert wurde
    if (changedKeys.includes('cooling_inlet_temp_setting') && _shouldWrite('cooling_inlet_temp_cap')) {
      const val = parseFloat(newSettings.cooling_inlet_temp_setting);
      if (val >= 5 && val <= 30) {
        this._connectPump();
        await this._setCoolingInletTemp(val).catch((e) => this.error('Kühlung Einlauftemperatur Schreiben fehlgeschlagen:', e.message));
      }
    }

    // Leistungssensor sofort aktualisieren ohne auf den nächsten Poll zu warten
    // _lastState enthält den zuletzt bekannten Status der WP
    if (newSettings.power_sensor_enabled === true && this._lastState) {
      if (!this.hasCapability('measure_power')) {
        try {
          await this.addCapability('measure_power');
          await this.setCapabilityOptions('measure_power', { approximated: true });
        } catch (e) { this.error('addCapability measure_power:', e.message); }
      }
      const watts = Number(newSettings[`power_${this._lastState}`]) || 0;
      await this._setIfValid('measure_power', watts);
    } else if (newSettings.power_sensor_enabled === false && this.hasCapability('measure_power')) {
      try { await this.removeCapability('measure_power'); }
      catch (e) { this.error('removeCapability measure_power:', e.message); }
    }

    // meter_power entfernen wenn Bedingungen nicht mehr erfüllt
    if (!this._meterPowerActive(newSettings) && this.hasCapability('meter_power')) {
      try { await this.removeCapability('meter_power'); }
      catch (e) { this.error('removeCapability meter_power:', e.message); }
      this._lastPollTime = null;
    }

    // Force-Poll Button: bei Einstellungsänderung Capability hinzufügen oder entfernen
    if (changedKeys.includes('show_force_poll')) {
      if (newSettings.show_force_poll === true) {
        if (!this.hasCapability('force_poll')) {
          try { await this.addCapability('force_poll'); } catch (e) { this.error('addCapability force_poll:', e.message); }
        }
        this._registerForcePollListener();
      } else {
        if (this.hasCapability('force_poll')) {
          try { await this.removeCapability('force_poll'); } catch (e) { this.error('removeCapability force_poll:', e.message); }
        }
      }
    }

    this._connectPump();
    await this._doPoll();
    this._startPolling();
  }

  // ─── Verbindung ────────────────────────────────────────────────────────────

  _connectPump() {
    try {
      this._pump = new luxtronik.createConnection(this._ip, this._port, {
        // RBE-Raumdisplay: Ist-/Soll-Raumtemperatur liegen bei neuerer Firmware auf
        // Calc-Index 227/228 (×10). Der Legacy-Key 'temperaturw_RFV' (Index 23) liefert
        // dort nur den "kein Sensor"-Platzhalter (−3.7 °C). luxtronik2 mappt 227/228 nicht,
        // daher hier per onProcessValues nachreichen.
        onProcessValues: (values) => {
          const extra = {};
          // values ist array-ähnlich (kein echtes Array → kein Array.isArray-Guard).
          // Indizes direkt prüfen; ältere Firmware ohne RBE liefert hier undefined → Skip.
          if (values && typeof values[227] === 'number' && typeof values[228] === 'number') {
            extra.rbe_room_temperature        = values[227] / 10;
            extra.rbe_room_temperature_target = values[228] / 10;
          }
          return extra;
        },
      });
      this.log(`Verbunden mit ${this._ip}:${this._port}`);
    } catch (err) {
      this.error('Verbindung fehlgeschlagen:', err.message);
      this._pump = null;
    }
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  _startWatchdog() {
    if (this._watchdogTimer) { clearInterval(this._watchdogTimer); this._watchdogTimer = null; }
    // Watchdog prüft alle 60s ob ein erfolgreicher Poll stattgefunden hat
    // Schwellwert: 3x Polling-Intervall
    const checkIntervalSec = Number(this.getSetting('watchdog_check_interval')) || 60;
    this._watchdogTimer = setInterval(() => {
      if (!this._lastSuccessfulPoll) return;
      const elapsed = Date.now() - this._lastSuccessfulPoll.getTime();
      const watchdogFactor = Number(this.getSetting('watchdog_threshold')) || 3;
      const threshold = this._pollInterval * watchdogFactor;
      if (elapsed > threshold) {
        const minutes = Math.round(elapsed / 60000);
        this.error(`Watchdog: Kein erfolgreicher Poll seit ${minutes} Minuten`);
        this.setUnavailable(
          (this.homey.__('errors.watchdog') || `Keine Verbindung seit ${minutes} Min.`)
        ).catch(() => {});
      }
    }, checkIntervalSec * 1000);
  }

  _startPolling() {
    this._stopPolling();
    this._timer = setInterval(() => this._doPoll(), this._pollInterval);
  }

  _stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _doPoll() {
    if (!this._pump) { this._connectPump(); if (!this._pump) return; }

    // Poll-Timeout: wenn keine Antwort nach 30s → Fehler
    if (this._pollTimeout) { clearTimeout(this._pollTimeout); }
    const timeoutSec = Number((await this.getSettings()).watchdog_timeout) || 30;
    this._pollTimeout = setTimeout(() => {
      this._pollTimeout = null;
      this.error(`Poll-Timeout: Keine Antwort von der Wärmepumpe nach ${timeoutSec}s`);
      this.setUnavailable(this.homey.__('errors.timeout') || `Keine Antwort (Timeout nach ${timeoutSec}s)`).catch(() => {});
    }, timeoutSec * 1000);

    return new Promise((resolve) => {
      this._pump.read((err, data) => {
        if (err) {
          this.error('Poll-Fehler:', err.message || err);
          const wasAvail = this.getAvailable();
      this.setUnavailable(err.message || 'Verbindungsfehler').catch(() => {});
      if (wasAvail) {
        this._triggerDeviceUnavailable.trigger(this, {}).catch(() => {});
      }
          resolve();
          return;
        }
        const wasUnavail = !this.getAvailable();
        this.setAvailable().catch(() => {});
        if (wasUnavail) {
          this._triggerDeviceAvailable.trigger(this, {}).catch(() => {});
        }
        // Watchdog: Zeitstempel aktualisieren und Timeout zurücksetzen
        this._lastSuccessfulPoll = new Date();
        if (this._pollTimeout) { clearTimeout(this._pollTimeout); this._pollTimeout = null; }
        const tz = this.homey.clock.getTimezone();
        const timeStr = this._lastSuccessfulPoll.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz, hour12: false });
        this._setIfValid('last_poll', timeStr).catch(() => {});
        this._processData(data).then(() => {
          // Erstes erfolgreiches Lesen: ab jetzt dürfen onSettings-Handler schreiben
          if (!this._firstPollDone) {
            this._firstPollDone = true;
            this.log('Erster Poll abgeschlossen — onSettings-Schreibsperre aufgehoben');
          }
          resolve();
        }).catch((e) => {
          this.error('Fehler bei Datenverarbeitung:', e.message);
          resolve();
        });
      });
    });
  }

  // ─── Datenverarbeitung ─────────────────────────────────────────────────────
  //
  // Echte Feldnamen des luxtronik2 npm-Pakets (snake_case):
  //   data.values.*       → Berechnete Werte / Sensoren
  //   data.parameters.*   → Einstellbare Parameter

  async _processData(data) {
    const v = data.values     || {};
    const p = data.parameters || {};

    // Debug: vollständige Daten einmalig loggen
    if (!this._dataDumped) {
      this.log('=== Luxtronik Daten (Erstabfrage) ===');
      this.log('values:', JSON.stringify(v, null, 2));
      this.log('parameters:', JSON.stringify(p, null, 2));
      this._dataDumped = true;
    }

    // Debug-Daten für die Einstellungsseite speichern (Timer-Tabellen ausschliessen — zu gross)
    try {
      const debugParams = Object.fromEntries(
        Object.entries(p).filter(([k]) => !k.toLowerCase().includes('timertable'))
      );
      this.homey.settings.set('luxtronik_debug', {
        timestamp: new Date().toISOString(),
        values:     v,
        parameters: debugParams,
      });
    } catch (_e) { /* ignore */ }

    // ── Temperaturen (data.values) ───────────────────────────────────────────
    const outdoorTemp = this._n(v.temperature_outside);
    if (outdoorTemp !== null && this._lastOutdoorTemp !== null) {
      if (this._lastOutdoorTemp >= 0 && outdoorTemp < 0 ||
          this._lastOutdoorTemp > outdoorTemp) {
        await this._triggerOutdoorTempDroppedBelow.trigger(this, {}, { temperature: outdoorTemp }).catch(() => {});
      }
      if (this._lastOutdoorTemp <= 0 && outdoorTemp > 0 ||
          this._lastOutdoorTemp < outdoorTemp) {
        await this._triggerOutdoorTempRoseAbove.trigger(this, {}, { temperature: outdoorTemp }).catch(() => {});
      }
    }
    if (outdoorTemp !== null) this._lastOutdoorTemp = outdoorTemp;
    await this._setIfValid('measure_temp_outdoor',      outdoorTemp);
    await this._setIfValid('measure_temp_outdoor_avg',  this._n(v.temperature_outside_avg));
    await this._setIfValid('measure_temp_flow',         this._n(v.temperature_supply));
    await this._setIfValid('measure_temp_return',       this._n(v.temperature_return));
    await this._setIfValid('measure_temp_return_target',this._n(v.temperature_target_return));
    await this._setIfValid('measure_temp_hotgas',       this._n(v.temperature_hot_gas));
    await this._setIfValid('measure_temp_hotwater',     this._n(v.temperature_hot_water));
    // Mirror → built-in measure_temperature (Thermostat-Widget Ist-Wert, kein Insights-Duplikat)
    await this._setIfValid('measure_temperature', this._n(v.temperature_hot_water));
    // Thermische Desinfektion Dauerbetrieb: Wert aus Controller lesen
    if (p.thermal_desinfection_continuous_operation !== undefined) {
      const contActive = p.thermal_desinfection_continuous_operation === 1;
      await this._setIfValid('thermal_disinfection_continuous', contActive);
    }
    // Brauchwasser Schnellladung (Zuheizung): automatisch beenden wenn Zieltemperatur erreicht
    if (this._boostTimer && this.getCapabilityValue('hotwater_boost') === true) {
      const currentTemp = this._n(v.temperature_hot_water);
      const targetTemp  = this.hasCapability('warmwater_target_temperature') ? this.getCapabilityValue('warmwater_target_temperature') : this.getCapabilityValue('target_temperature');
      if (currentTemp !== null && targetTemp !== null && currentTemp >= targetTemp) {
        this.log(`Schnelladung: Zieltemperatur ${targetTemp}°C erreicht (${currentTemp}°C) — beende automatisch`);
        await this._stopHotwaterBoost();
        await this._triggerBoostEnded.trigger(this, {}).catch(() => {});
      }
    }
    // Brauchwasser Schnellladung (Party): automatisch beenden wenn Zieltemperatur erreicht
    if (this._boostPartyTimer && this.getCapabilityValue('hotwater_boost_party') === true) {
      const currentTempP = this._n(v.temperature_hot_water);
      const targetTempP  = this.hasCapability('warmwater_target_temperature') ? this.getCapabilityValue('warmwater_target_temperature') : this.getCapabilityValue('target_temperature');
      if (currentTempP !== null && targetTempP !== null && currentTempP >= targetTempP) {
        this.log(`Schnellladung (Party): Zieltemperatur ${targetTempP}°C erreicht (${currentTempP}°C) — beende automatisch`);
        await this._stopHotwaterBoostParty();
        await this._triggerBoostPartyEnded.trigger(this, {}).catch(() => {});
      }
    }
    // Thermische Desinfektion: automatisch deaktivieren wenn Zieltemperatur erreicht
    if (this.getCapabilityValue('thermal_disinfection_continuous') === true) {
      const currentTemp = this._n(v.temperature_hot_water);
      const tdiTarget   = (this.getCapabilityValue('tdi_target_temperature') ?? 65) - 1;
      if (currentTemp !== null && currentTemp >= tdiTarget) {
        this.log(`Thermische Desinfektion: ${tdiTarget}°C erreicht (${currentTemp}°C) — deaktiviere Dauerbetrieb`);
        await this._setThermalDisinfectionContinuous(false).catch((e) => this.error('TDI auto-off fehlgeschlagen:', e.message));
        await this._triggerThermalDisinfEnded.trigger(this, {}).catch(() => {});
        await this._notify(this._tl(
          `🧫 Thermische Desinfektion abgeschlossen (${currentTemp} °C)`,
          `🧫 Thermal disinfection completed (${currentTemp} °C)`
        ));
      }
    }

    await this._setIfValid('measure_temp_hotwater_target', this._n(v.temperature_hot_water_target));
    await this._setIfValid('measure_temp_source_in',    this._n(v.temperature_heat_source_in));
    await this._setIfValid('measure_temp_source_out',   this._n(v.temperature_heat_source_out));
    // Ansaugluft / Zuluft (Luft-WP)
    // Ansaugluft nur bei Luft-WP vorhanden → nur anzeigen wenn Wert > 0
    const suctionAirTemp = this._n(v.Temp_Lueftung_Zuluft);
    await this._setCapabilityConditional('measure_temp_suction_air', suctionAirTemp, suctionAirTemp !== null && suctionAirTemp > 0);
    // Raumtemperatur (nur mit RBE-Raumdisplay — Capability nur anzeigen wenn Wert > 0)
    // Neuere Firmware liefert Ist/Soll auf Calc-Index 227/228 (via onProcessValues injiziert).
    // Fallback auf den Legacy-Key 'temperaturw_RFV' (Index 23, Tippfehler in luxtronik2) für
    // ältere Firmware. Index 23 liefert auf neueren Geräten nur −3.7 °C (kein Sensor).
    let roomTemp       = this._n(v.rbe_room_temperature);
    let roomTempTarget = this._n(v.rbe_room_temperature_target);
    if (roomTemp === null || roomTemp <= 0)             roomTemp       = this._n(v.temperaturw_RFV);
    if (roomTempTarget === null || roomTempTarget <= 0) roomTempTarget = this._n(v.Temperatur_RFV2);
    await this._setCapabilityConditional('measure_temp_room',        roomTemp,       roomTemp !== null && roomTemp > 0);
    await this._setCapabilityConditional('measure_temp_room_target', roomTempTarget, roomTempTarget !== null && roomTempTarget > 0);

    // ── Volumenstrom ─────────────────────────────────────────────────────────
    // Durchfluss_WQ: Rohwert vom Controller direkt in l/h (keine Umrechnung nötig)
    // flowRate (Index 155): ebenfalls direkt in l/h
    const flowRaw = v.Durchfluss_WQ;
    if (flowRaw !== undefined && flowRaw !== 'no') {
      await this._setIfValid('measure_volume_flow', this._n(flowRaw));
    } else if (v.flowRate !== undefined && v.flowRate !== 'no' && v.flowRate !== 'inconsistent') {
      await this._setIfValid('measure_volume_flow', this._n(v.flowRate));
    }

    // ── Energie (kWh) ────────────────────────────────────────────────────────
    await this._setIfValid('meter_energy_heating',  this._n(v.thermalenergy_heating));
    await this._setIfValid('meter_energy_hotwater', this._n(v.thermalenergy_warmwater));
    await this._setIfValid('meter_energy_total',    this._n(v.thermalenergy_total));

    // ── Betriebsstunden ──────────────────────────────────────────────────────
    // luxtronik2 liefert Stunden direkt als Zahl
    await this._setIfValid('measure_hours_compressor', this._n(v.hours_compressor1));
    await this._setIfValid('measure_hours_heating',    this._n(v.hours_heating));
    await this._setIfValid('measure_hours_hotwater',   this._n(v.hours_warmwater));

    // ── Kühlung ───────────────────────────────────────────────────────────────
    // FreigabKuehl: 0 = gesperrt, 1 = freigegeben (Controller-Flag)
    // cooling_visibility: 'auto' | 'show' | 'hide'
    const coolingDetected    = v.FreigabKuehl === 1;
    const coolingVisibility  = this.getSetting('cooling_visibility') ?? 'auto';
    const showCooling =
      coolingVisibility === 'show' ||
      (coolingVisibility === 'auto' && coolingDetected);
    await this._setCapabilityConditional('measure_hours_cooling',   this._n(v.hours_cooling), showCooling);
    await this._setCapabilityConditional('cooling_release_temp_cap', this._n(p.cooling_release_temperature), showCooling);
    await this._setCapabilityConditional('cooling_inlet_temp_cap',   this._n(p.cooling_inlet_temp),          showCooling);
    if (showCooling) {
      const coolingMode = this._int(p.cooling_operation_mode) ?? 0;
      const coolingModeStr = String(coolingMode);
      await this._setCapabilityConditional('cooling_operation_mode', coolingModeStr, true);
      if (this._lastCoolingMode !== null && this._lastCoolingMode !== coolingModeStr) {
        const labelEn = coolingMode === 1 ? 'Automatic' : 'Off';
        const labelDe = coolingMode === 1 ? 'Automatik' : 'Aus';
        await this._triggerCoolingModeChanged.trigger(this, { mode: labelEn }).catch(() => {});
        await this._notify(this._tl(`❄️ Kühlbetrieb: ${labelDe}`, `❄️ Cooling mode: ${labelEn}`));
      }
      this._lastCoolingMode = coolingModeStr;
    } else {
      await this._setCapabilityConditional('cooling_operation_mode', null, false);
    }

    // ── Wärmepumpen-Status ───────────────────────────────────────────────────
    // state3 = detaillierter Betriebsstatus; state1 = grober Status (für Fehler)
    const rawState  = v.heatpump_state3;
    const state1    = v.heatpump_state1;
    const stateSlug = (state1 === HEATPUMP_STATE1_ERROR)
      ? 'off'
      : (HEATPUMP_STATE_MAP[rawState] ?? 'unknown');
    if (stateSlug !== this._lastState) {
      await this._setIfValid('heatpump_state', stateSlug);
      if (this._lastState !== null) {
        await this._triggerStateChanged.trigger(this, { state: stateSlug }).catch(() => {});
        const stateLabel = (STATE_TIMELINE_LABELS[stateSlug] || {})[this.homey.i18n.getLanguage()] || stateSlug;
        await this._notify(this._tl(`🔄 Betriebsart: ${stateLabel}`, `🔄 State: ${stateLabel}`));
      }
      this._lastState = stateSlug;
    }

    // ── Wärmepumpen-Status als Emoji (Geräteanzeige / Indicator) ─────────────
    const stateStringVal = STATE_EMOJI[stateSlug] ?? '❓';
    await this._setIfValid('heatpump_state_string', stateStringVal);

    // ── Virtueller Leistungssensor ───────────────────────────────────────────
    // measure_power wird dynamisch hinzugefügt/entfernt je nach Einstellung
    const powerEnabled = this.getSetting('power_sensor_enabled') === true;
    if (powerEnabled) {
      if (!this.hasCapability('measure_power')) {
        try {
          await this.addCapability('measure_power');
          await this.setCapabilityOptions('measure_power', { approximated: true });
        } catch (e) { this.error('addCapability measure_power:', e.message); }
      }
      const watts = Number(this.getSetting(`power_${stateSlug}`)) || 0;
      await this._setIfValid('measure_power', watts);
    } else if (this.hasCapability('measure_power')) {
      try { await this.removeCapability('measure_power'); }
      catch (e) { this.error('removeCapability measure_power:', e.message); }
    }

    // ── Kumulierter Energiezähler (meter_power) ──────────────────────────────
    // Nur aktiv wenn power_sensor_enabled=true UND Heizen/Warmwasser/Standby > 0
    const meterActive = this._meterPowerActive();
    if (meterActive) {
      if (!this.hasCapability('meter_power')) {
        try { await this.addCapability('meter_power'); }
        catch (e) { this.error('addCapability meter_power:', e.message); }
      }
      const now = Date.now();
      if (this._lastPollTime !== null) {
        const elapsedHours = (now - this._lastPollTime) / 3600000;
        const watts        = Number(this.getSetting(`power_${stateSlug}`)) || 0;
        const kwhIncrement = watts * elapsedHours / 1000;
        const currentKwh   = (await this.getStoreValue('meter_power_kwh')) || 0;
        const newKwh       = Math.round((currentKwh + kwhIncrement) * 10000) / 10000;
        await this.setStoreValue('meter_power_kwh', newKwh);
        await this._setIfValid('meter_power', newKwh);
      }
      this._lastPollTime = now;
    } else {
      this._lastPollTime = null;
      if (this.hasCapability('meter_power')) {
        try { await this.removeCapability('meter_power'); }
        catch (e) { this.error('removeCapability meter_power:', e.message); }
      }
    }

    // ── Fehler ───────────────────────────────────────────────────────────────
    // heatpump_state1 === 4 bedeutet: Steuerung befindet sich AKTUELL im Fehlerzustand
    // v.errors enthält die letzten 5 Fehler aus dem Protokoll (auch alte, behobene Fehler)
    // → nur state1 === 4 ist zuverlässig für einen aktiven Fehler
    const hasError = (v.heatpump_state1 === 4);
    await this._setIfValid('alarm_generic', hasError);
    // Heizungs-Status – via HEATING_STATE_MAP übersetzt
    if (v.heatpump_extendet_state_string !== undefined) {
      const raw  = String(v.heatpump_extendet_state_string);
      const lang = this.homey.i18n.getLanguage();
      let heatingLabel;
      if (raw.startsWith('Estrich Programm')) {
        // Dynamischer Suffix "Stufe X - Y °C" – nur das Schlüsselwort übersetzen
        const suffix    = raw.replace('Estrich Programm', '').trim();
        const base      = lang === 'de' ? 'Estrich Programm' : 'Screed Program';
        const levelWord = lang === 'de' ? 'Stufe' : 'Level';
        heatingLabel = base + ' ' + suffix.replace('Stufe', levelWord);
      } else {
        const entry = HEATING_STATE_MAP[raw];
        heatingLabel = entry ? (entry[lang] ?? entry.en) : raw;
      }
      await this._setIfValid('heating_state_string', heatingLabel);
    }
    // Warmwasser-Status – via HOTWATER_STATE_MAP übersetzt
    if (v.opStateHotWaterString !== undefined) {
      const raw   = String(v.opStateHotWaterString);
      const lang  = this.homey.i18n.getLanguage();
      const entry = HOTWATER_STATE_MAP[raw];
      await this._setIfValid('hotwater_state_string', entry ? (entry[lang] ?? entry.en) : raw);
    }
    if (hasError && !this._lastErrorState) {
      // Fehlermeldung aus dem Protokoll holen
      const msg = Array.isArray(v.errors) && v.errors.length > 0
        ? v.errors.map((e) => (typeof e === 'object' ? JSON.stringify(e) : String(e))).join(', ')
        : 'Fehler (state1=4)';
      await this._triggerErrorOccurred.trigger(this, { error: msg }).catch(() => {});
      await this._notify(this._tl(`⚠️ Fehler aktiv: ${msg}`, `⚠️ Error active: ${msg}`));
    }
    if (!hasError && this._lastErrorState === true) {
      await this._triggerErrorCleared.trigger(this, {}).catch(() => {});
      await this._notify(this._tl('✅ Fehler behoben', '✅ Error cleared'));
    }
    this._lastErrorState = hasError;

    // ── Firmware-Version ─────────────────────────────────────────────────────
    if (v.firmware && v.firmware !== '') {
      await this._setIfValid('firmware_version', String(v.firmware));
    }

    // ── Betriebsmodus aus data.parameters ────────────────────────────────────
    const heatingMode = this._int(p.heating_operation_mode);
    if (heatingMode !== null) {
      const modeStr = String(heatingMode);
      await this._setIfValid('heating_operation_mode', modeStr);
      if (this._lastHeatingMode !== null && this._lastHeatingMode !== modeStr) {
        await this._triggerHeatingModeChanged.trigger(this, { mode: OPERATION_MODE_LABELS[heatingMode] ?? modeStr }).catch(() => {});
        const labelEn = OPERATION_MODE_LABELS[heatingMode] ?? modeStr;
        const labelDe = OPERATION_MODE_LABELS_DE[heatingMode] ?? modeStr;
        await this._notify(this._tl(`🌡️ Heizung Betriebsart: ${labelDe}`, `🌡️ Heating mode: ${labelEn}`));
      }
      this._lastHeatingMode = modeStr;
    }

    const warmwaterMode = this._int(p.warmwater_operation_mode);
    if (warmwaterMode !== null) {
      const modeStr = String(warmwaterMode);
      await this._setIfValid('warmwater_operation_mode', modeStr);
      if (this._lastWarmwaterMode !== null && this._lastWarmwaterMode !== modeStr) {
        await this._triggerWarmwaterModeChanged.trigger(this, { mode: OPERATION_MODE_LABELS[warmwaterMode] ?? modeStr }).catch(() => {});
        const labelEn = OPERATION_MODE_LABELS[warmwaterMode] ?? modeStr;
        const labelDe = OPERATION_MODE_LABELS_DE[warmwaterMode] ?? modeStr;
        await this._notify(this._tl(`💧 Warmwasser Betriebsart: ${labelDe}`, `💧 Hot water mode: ${labelEn}`));
      }
      this._lastWarmwaterMode = modeStr;
    }

    // Heizungs-Temperaturkorrektur: p.heating_temperature (lesen), schreiben mit 'heating_target_temperature'
    const heatingCorr = this._n(p.heating_temperature);
    // Mirror → target_temperature.heating (Thermostat-Widget Heizung Soll)
    await this._setIfValid('target_temperature.heating', heatingCorr);

    // Brauchwasser-Solltemperatur:
    // Parameter 105 (temperature_hot_water_target) = echter WW-Sollwert auf allen Firmware-Varianten
    // Parameter 2 (warmwater_temperature) = auf manchen Firmwares (z.B. SWCV V3.92.3) = TDI-Wert, NICHT WW-Sollwert
    // → Parameter 105 bevorzugen wenn im gültigen Bereich (30–65 °C)
    const ww105 = this._n(p.temperature_hot_water_target);
    const ww2   = this._n(p.warmwater_temperature);
    const wwSetpoint = (ww105 !== null && ww105 >= 30 && ww105 <= 65) ? ww105 : ww2;
    await this._setIfValid('target_temperature', wwSetpoint);

    // Thermische Desinfektion Soll (TDI): parameter 47 = temperature_hot_water_limit
    const tdiVal = this._n(p.temperature_hot_water_limit);
    await this._setIfValid('tdi_target_temperature', tdiVal);
    await this._syncSetting('tdi_target_temperature', 'tdi_setpoint_setting', tdiVal);

    // Heizgrenze: parameter 700 = thresholdHeatingLimit (raw / 10)
    const heatingLimitVal = this._n(p.thresholdHeatingLimit);
    await this._setIfValid('heating_limit', heatingLimitVal);
    await this._syncSetting('heating_limit', 'heating_limit_setting', heatingLimitVal);

    // Max. Aussentemperatur: parameter 91 = temperature_outdoor_max (raw / 10)
    const outdoorTempMaxVal = this._n(p.temperature_outdoor_max);
    await this._setIfValid('outdoor_temp_max', outdoorTempMaxVal);
    await this._syncSetting('outdoor_temp_max', 'outdoor_temp_max_setting', outdoorTempMaxVal);

    // Warmwasser-Hysterese: parameter 74 = hotWaterTemperatureHysteresis (raw / 10)
    const hotwaterHystVal = this._n(p.hotWaterTemperatureHysteresis);
    await this._setIfValid('hotwater_hysteresis', hotwaterHystVal);
    await this._syncSetting('hotwater_hysteresis', 'hotwater_hysteresis_setting', hotwaterHystVal);

    // Rücklauf-Hysterese: parameter 88 = returnTemperatureHysteresis (raw / 10)
    // Nur vorhanden wenn heatpumpVisibility[93] === 1, sonst 'no'
    const returnHyst = p.returnTemperatureHysteresis;
    const returnHystVal = this._n(returnHyst);
    await this._setCapabilityConditional(
      'return_temp_hysteresis',
      returnHystVal,
      returnHyst !== undefined && returnHyst !== 'no' && returnHystVal !== null,
    );
    await this._syncSetting('return_temp_hysteresis', 'return_temp_hysteresis_setting', returnHystVal);

    // ── Heizkurve (bedingt: sichtbar wenn heatpumpVisibility[207] === 1) ────────
    // p.heating_curve_end_point gibt 'no' zurück wenn Parameter nicht verfügbar ist
    const hcEndpoint = this._n(p.heating_curve_end_point);
    await this._setCapabilityConditional('heating_curve_endpoint', hcEndpoint, hcEndpoint !== null);
    await this._syncSetting('heating_curve_endpoint', 'heating_curve_endpoint_setting', hcEndpoint);
    const hcOffset = this._n(p.heating_curve_parallel_offset);
    await this._setCapabilityConditional('heating_curve_offset', hcOffset, hcOffset !== null);
    await this._syncSetting('heating_curve_offset', 'heating_curve_offset_setting', hcOffset);
    const mk1Endpoint = this._n(p.mk1_curve_end_point);
    await this._setCapabilityConditional('mk1_curve_endpoint', mk1Endpoint, mk1Endpoint !== null);
    await this._syncSetting('mk1_curve_endpoint', 'mk1_curve_endpoint_setting', mk1Endpoint);
    const mk1Offset = this._n(p.mk1_curve_parallel_offset);
    await this._setCapabilityConditional('mk1_curve_offset', mk1Offset, mk1Offset !== null);
    await this._syncSetting('mk1_curve_offset', 'mk1_curve_offset_setting', mk1Offset);

    // ── Betriebsgrenzen Aussentemperatur ─────────────────────────────────────────
    const outdoorTempMinVal = this._n(p.temperature_outdoor_min);
    await this._setIfValid('outdoor_temp_min', outdoorTempMinVal);
    await this._syncSetting('outdoor_temp_min', 'outdoor_temp_min_setting', outdoorTempMinVal);
    const tempSetbackVal = this._n(p.thresholdTemperatureSetBack);
    await this._setIfValid('temp_setback_limit', tempSetbackVal);
    await this._syncSetting('temp_setback_limit', 'temp_setback_limit_setting', tempSetbackVal);

    // ── Heizkreis-Temperaturgrenzen ───────────────────────────────────────────────
    const supplyLimitVal = this._n(p.temperature_supply_limit);
    await this._setIfValid('supply_temp_limit', supplyLimitVal);
    await this._syncSetting('supply_temp_limit', 'supply_temp_limit_setting', supplyLimitVal);
    const returnLimitVal = this._n(p.temperature_return_limit);
    await this._setIfValid('return_temp_limit', returnLimitVal);
    await this._syncSetting('return_temp_limit', 'return_temp_limit_setting', returnLimitVal);
    const returnMinVal = this._n(p.returnTemperatureTargetMin);
    await this._setIfValid('return_temp_min', returnMinVal);
    await this._syncSetting('return_temp_min', 'return_temp_min_setting', returnMinVal);

    // ── Absenkung ─────────────────────────────────────────────────────────────────
    const deltaHeatingVal = this._n(p.deltaHeatingReduction);
    await this._setIfValid('delta_heating_reduction', deltaHeatingVal);
    await this._syncSetting('delta_heating_reduction', 'delta_heating_reduction_setting', deltaHeatingVal);
    const deltaMk1Val = this._n(p.deltaMk1Reduction);
    await this._setIfValid('delta_mk1_reduction', deltaMk1Val);
    await this._syncSetting('delta_mk1_reduction', 'delta_mk1_reduction_setting', deltaMk1Val);

    // ── Zuheizer / 2. Verdichter ──────────────────────────────────────────────────
    const tempZweVal = this._n(p.temperature_ZWE_possible);
    await this._setIfValid('temp_zwe_enable', tempZweVal);
    await this._syncSetting('temp_zwe_enable', 'temp_zwe_enable_setting', tempZweVal);
    const temp2ndHeatVal = this._n(p.heatingTemperatureOutside2ndCompressor);
    await this._setIfValid('temp_2nd_comp_heating', temp2ndHeatVal);
    await this._syncSetting('temp_2nd_comp_heating', 'temp_2nd_comp_heating_setting', temp2ndHeatVal);
    const temp2ndHwVal = this._n(p.hotwaterTemperatureForerun2ndCompressor);
    await this._setIfValid('temp_2nd_comp_hotwater', temp2ndHwVal);
    await this._syncSetting('temp_2nd_comp_hotwater', 'temp_2nd_comp_hotwater_setting', temp2ndHwVal);

    // ── Kühlung Temperaturen — Sync in Device Settings (nur wenn sichtbar) ───────
    if (showCooling) {
      await this._syncSetting('cooling_release_temp_cap', 'cooling_release_temp_setting', this._n(p.cooling_release_temperature));
      await this._syncSetting('cooling_inlet_temp_cap',   'cooling_inlet_temp_setting',   this._n(p.cooling_inlet_temp));
    }
  }

  // ─── Setzer ────────────────────────────────────────────────────────────────

  async _setHeatingOperationMode(mode) {
    if (mode < 0 || mode > 4) throw new Error(`Ungültiger Heizungs-Modus: ${mode}`);
    await this._write('heating_operation_mode', mode);
    await this.setCapabilityValue('heating_operation_mode', String(mode));
    await this._triggerHeatingModeChanged.trigger(this, { mode: OPERATION_MODE_LABELS[mode] ?? String(mode) }).catch(() => {});
  }

  async _setWarmwaterOperationMode(mode) {
    if (mode < 0 || mode > 4) throw new Error(`Ungültiger Brauchwasser-Modus: ${mode}`);
    await this._write('warmwater_operation_mode', mode);
    await this.setCapabilityValue('warmwater_operation_mode', String(mode));
    await this._triggerWarmwaterModeChanged.trigger(this, { mode: OPERATION_MODE_LABELS[mode] ?? String(mode) }).catch(() => {});
  }

  async _setCoolingOperationMode(mode) {
    if (mode !== 0 && mode !== 1) throw new Error(`Ungültiger Kühlbetrieb-Modus: ${mode}`);
    this.log(`Setze Kühlbetrieb-Betriebsart: ${mode} (${mode === 1 ? 'Automatik' : 'Aus'})`);
    await this._write('cooling_operation_mode', mode);
    await this.setCapabilityValue('cooling_operation_mode', String(mode)).catch(() => {});
    const label = mode === 1 ? 'Automatic' : 'Off';
    await this._triggerCoolingModeChanged.trigger(this, { mode: label }).catch(() => {});
    this._lastCoolingMode = String(mode);
  }

  async _setHeatingTemperatureCorrection(value) {
    const clamped = Math.min(5, Math.max(-5, Math.round(value * 2) / 2));
    this.log(`Setze Heizungs-Temperaturkorrektur: ${clamped} °C`);
    this._setWriteProtect('heating_temperature_correction', 120000);
    this._setWriteProtect('target_temperature.heating', 120000);
    await this._write('heating_target_temperature', clamped);
    await this.setCapabilityValue('heating_temperature_correction', clamped).catch(() => {});
    await this.setCapabilityValue('target_temperature.heating', clamped).catch(() => {});
  }


  async _setWarmwaterTargetTemperature(value) {
    const clamped = Math.min(65, Math.max(30, value));
    this.log(`Setze Brauchwasser Soll-Temperatur: ${clamped} °C`);
    await this.setCapabilityValue('target_temperature', clamped).catch(() => {});
    this._setWriteProtect('target_temperature', 120000);
    // parameter 2 (warmwater_target_temperature) = Standard WW-Sollwert
    await this._write('warmwater_target_temperature', clamped);
    // parameter 105 (temperature_hot_water_target) = alternativer WW-Sollwert auf manchen Firmware-Varianten
    await this._write('temperature_hot_water_target', clamped).catch(() => {});
    this.log(`Brauchwasser Soll-Temperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setTdiTargetTemperature(value) {
    // parameter 47 = temperature_hot_water_limit; kein Named-Write in luxtronik2 → _writeRaw
    const clamped = Math.min(80, Math.max(50, Math.round(value * 2) / 2));
    this.log(`Setze TDI-Solltemperatur: ${clamped} °C (parameter 47)`);
    this._setWriteProtect('tdi_target_temperature', 120000);
    await this._writeRaw(47, Math.round(clamped * 10));
    this.log(`TDI-Solltemperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setHotwaterHysteresis(value) {
    const clamped = Math.min(10, Math.max(0.5, Math.round(value * 2) / 2));
    this.log(`Setze Warmwasser-Hysterese: ${clamped} K`);
    this._setWriteProtect('hotwater_hysteresis', 120000);
    await this._write('hotwater_temperature_hysteresis', clamped);
    this.log(`Warmwasser-Hysterese erfolgreich gesendet: ${clamped} K`);
  }

  async _setReturnTempHysteresis(value) {
    const clamped = Math.min(10, Math.max(0.5, Math.round(value * 2) / 2));
    this.log(`Setze Rücklauf-Hysterese: ${clamped} K`);
    this._setWriteProtect('return_temp_hysteresis', 120000);
    await this._write('return_temperature_hysteresis', clamped);
    this.log(`Rücklauf-Hysterese erfolgreich gesendet: ${clamped} K`);
  }

  async _setHeatingLimit(value) {
    // parameter 700 = thresholdHeatingLimit; kein Named-Write → _writeRaw
    const clamped = Math.min(30, Math.max(5, Math.round(value * 2) / 2));
    this.log(`Setze Heizgrenze: ${clamped} °C (parameter 700)`);
    this._setWriteProtect('heating_limit', 120000);
    await this._writeRaw(700, Math.round(clamped * 10));
    this.log(`Heizgrenze erfolgreich gesendet: ${clamped} °C`);
  }

  async _setOutdoorTempMax(value) {
    // parameter 91 = temperature_outdoor_max; kein Named-Write → _writeRaw
    const clamped = Math.min(45, Math.max(10, Math.round(value * 2) / 2));
    this.log(`Setze Max. Aussentemperatur: ${clamped} °C (parameter 91)`);
    this._setWriteProtect('outdoor_temp_max', 120000);
    await this._writeRaw(91, Math.round(clamped * 10));
    this.log(`Max. Aussentemperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setHeatingCurveEndpoint(value) {
    const clamped = Math.min(70, Math.max(20, Math.round(value * 2) / 2));
    this.log(`Setze Heizkurve Endpunkt: ${clamped} °C (parameter 11)`);
    this._setWriteProtect('heating_curve_endpoint', 120000);
    await this._write('heating_curve_end_point', clamped);
    this.log(`Heizkurve Endpunkt erfolgreich gesendet: ${clamped} °C`);
  }

  async _setHeatingCurveOffset(value) {
    const clamped = Math.min(35, Math.max(5, Math.round(value * 2) / 2));
    this.log(`Setze Heizkurve Parallelverschiebung: ${clamped} °C (parameter 12)`);
    this._setWriteProtect('heating_curve_offset', 120000);
    await this._write('heating_curve_parallel_offset', clamped);
    this.log(`Heizkurve Parallelverschiebung erfolgreich gesendet: ${clamped} °C`);
  }

  async _setMk1CurveEndpoint(value) {
    const clamped = Math.min(70, Math.max(20, Math.round(value * 2) / 2));
    this.log(`Setze MK1 Kurve Endpunkt: ${clamped} °C (parameter 14)`);
    this._setWriteProtect('mk1_curve_endpoint', 120000);
    await this._write('mk1_curve_end_point', clamped);
    this.log(`MK1 Kurve Endpunkt erfolgreich gesendet: ${clamped} °C`);
  }

  async _setMk1CurveOffset(value) {
    const clamped = Math.min(35, Math.max(5, Math.round(value * 2) / 2));
    this.log(`Setze MK1 Kurve Parallelverschiebung: ${clamped} °C (parameter 15)`);
    this._setWriteProtect('mk1_curve_offset', 120000);
    await this._write('mk1_curve_parallel_offset', clamped);
    this.log(`MK1 Kurve Parallelverschiebung erfolgreich gesendet: ${clamped} °C`);
  }

  async _setOutdoorTempMin(value) {
    // parameter 92 = temperature_outdoor_min; kein Named-Write → _writeRaw
    const clamped = Math.min(10, Math.max(-30, Math.round(value * 2) / 2));
    this.log(`Setze Min. Aussentemperatur: ${clamped} °C (parameter 92)`);
    this._setWriteProtect('outdoor_temp_min', 120000);
    await this._writeRaw(92, Math.round(clamped * 10));
    this.log(`Min. Aussentemperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setTempSetbackLimit(value) {
    // parameter 111 = thresholdTemperatureSetBack; kein Named-Write → _writeRaw
    const clamped = Math.min(10, Math.max(-20, Math.round(value * 2) / 2));
    this.log(`Setze Absenk-Temperaturgrenze: ${clamped} °C (parameter 111)`);
    this._setWriteProtect('temp_setback_limit', 120000);
    await this._writeRaw(111, Math.round(clamped * 10));
    this.log(`Absenk-Temperaturgrenze erfolgreich gesendet: ${clamped} °C`);
  }

  async _setSupplyTempLimit(value) {
    // parameter 149 = temperature_supply_limit; kein Named-Write → _writeRaw
    const clamped = Math.min(70, Math.max(20, Math.round(value * 2) / 2));
    this.log(`Setze Vorlauftemperatur-Grenze: ${clamped} °C (parameter 149)`);
    this._setWriteProtect('supply_temp_limit', 120000);
    await this._writeRaw(149, Math.round(clamped * 10));
    this.log(`Vorlauftemperatur-Grenze erfolgreich gesendet: ${clamped} °C`);
  }

  async _setReturnTempLimit(value) {
    // parameter 87 = temperature_return_limit; kein Named-Write → _writeRaw
    const clamped = Math.min(65, Math.max(20, Math.round(value * 2) / 2));
    this.log(`Setze Rücklauftemperatur-Grenze: ${clamped} °C (parameter 87)`);
    this._setWriteProtect('return_temp_limit', 120000);
    await this._writeRaw(87, Math.round(clamped * 10));
    this.log(`Rücklauftemperatur-Grenze erfolgreich gesendet: ${clamped} °C`);
  }

  async _setReturnTempMin(value) {
    // parameter 979 = returnTemperatureTargetMin; kein Named-Write → _writeRaw
    const clamped = Math.min(30, Math.max(5, Math.round(value * 2) / 2));
    this.log(`Setze Rücklauftemperatur Minimum: ${clamped} °C (parameter 979)`);
    this._setWriteProtect('return_temp_min', 120000);
    await this._writeRaw(979, Math.round(clamped * 10));
    this.log(`Rücklauftemperatur Minimum erfolgreich gesendet: ${clamped} °C`);
  }

  async _setDeltaHeatingReduction(value) {
    const clamped = Math.min(10, Math.max(-15, Math.round(value * 10) / 10));
    this.log(`Setze Absenkung Heizung Delta: ${clamped} K (parameter 13)`);
    this._setWriteProtect('delta_heating_reduction', 120000);
    await this._write('deltaHeatingReduction', clamped);
    this.log(`Absenkung Heizung Delta erfolgreich gesendet: ${clamped} K`);
  }

  async _setDeltaMk1Reduction(value) {
    const clamped = Math.min(10, Math.max(-15, Math.round(value * 10) / 10));
    this.log(`Setze Absenkung MK1 Delta: ${clamped} K (parameter 16)`);
    this._setWriteProtect('delta_mk1_reduction', 120000);
    await this._write('deltaMk1Reduction', clamped);
    this.log(`Absenkung MK1 Delta erfolgreich gesendet: ${clamped} K`);
  }

  async _setTempZweEnable(value) {
    // parameter 90 = temperature_ZWE_possible; kein Named-Write → _writeRaw
    const clamped = Math.min(20, Math.max(-20, Math.round(value * 2) / 2));
    this.log(`Setze ZWE Freigabe-Temperatur: ${clamped} °C (parameter 90)`);
    this._setWriteProtect('temp_zwe_enable', 120000);
    await this._writeRaw(90, Math.round(clamped * 10));
    this.log(`ZWE Freigabe-Temperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setTemp2ndCompHeating(value) {
    const clamped = Math.min(30, Math.max(-20, Math.round(value * 2) / 2));
    this.log(`Setze 2. Verdichter Aussentemp. Heizen: ${clamped} °C (parameter 95)`);
    this._setWriteProtect('temp_2nd_comp_heating', 120000);
    await this._write('heating_temperature_outside_2nd_compressor', clamped);
    this.log(`2. Verdichter Aussentemp. Heizen erfolgreich gesendet: ${clamped} °C`);
  }

  async _setTemp2ndCompHotwater(value) {
    const clamped = Math.min(70, Math.max(10, Math.round(value * 2) / 2));
    this.log(`Setze 2. Verdichter Vorlauftemp. Warmwasser: ${clamped} °C (parameter 96)`);
    this._setWriteProtect('temp_2nd_comp_hotwater', 120000);
    await this._write('hotwater_temperature_forerun_2nd_compressor', clamped);
    this.log(`2. Verdichter Vorlauftemp. Warmwasser erfolgreich gesendet: ${clamped} °C`);
  }

  async _setCoolingReleaseTemp(value) {
    const clamped = Math.min(40, Math.max(10, Math.round(value * 2) / 2));
    this.log(`Setze Kühlung Freigabe-Temperatur: ${clamped} °C (parameter 110)`);
    this._setWriteProtect('cooling_release_temp_cap', 120000);
    await this._write('cooling_release_temp', clamped);
    this.log(`Kühlung Freigabe-Temperatur erfolgreich gesendet: ${clamped} °C`);
  }

  async _setCoolingInletTemp(value) {
    const clamped = Math.min(30, Math.max(5, Math.round(value * 2) / 2));
    this.log(`Setze Kühlung Einlauftemperatur: ${clamped} °C (parameter 132)`);
    this._setWriteProtect('cooling_inlet_temp_cap', 120000);
    await this._write('cooling_inlet_temp', clamped);
    this.log(`Kühlung Einlauftemperatur erfolgreich gesendet: ${clamped} °C`);
  }

  _writeRaw(parameterIndex, setValue) {
    return new Promise((resolve, reject) => {
      if (!this._pump) { reject(new Error('Nicht verbunden')); return; }
      this._stopPolling();
      this.log(`_writeRaw: parameter[${parameterIndex}] = ${setValue} (Polling pausiert)`);
      setTimeout(() => {
        this._pump._startWrite(parameterIndex, setValue, (err, res) => {
          // Polling nach dem Write immer neu starten + 3s verzögerter Bestätigungs-Poll
          this._startPolling();
          this._schedulePollAfterWrite();
          if (err) {
            const msg = (err && err.message) ? err.message : String(err);
            this.error(`WriteRaw-Fehler (param${parameterIndex}=${setValue}): ${msg}`);
            reject(new Error(msg));
          } else {
            this.log(`WriteRaw OK: param[${parameterIndex}]=${setValue}`, JSON.stringify(res));
            resolve(res);
          }
        });
      }, 200);
    });
  }

  // ─── Schnelladung ─────────────────────────────────────────────────────────────

  async _startHotwaterBoost(durationMinutes) {
    const duration = Math.min(480, Math.max(5, durationMinutes || 60));
    this.log(`Schnelladung starten: ${duration} Minuten`);

    // Laufenden Boost-Timer canceln falls aktiv
    if (this._boostTimer) {
      clearTimeout(this._boostTimer);
      this._boostTimer = null;
    }

    // Zuheizer-Modus setzen
    await this._setWarmwaterOperationMode(1);
    await this.setCapabilityValue('hotwater_boost', true);
    await this._triggerBoostStarted.trigger(this, { duration }).catch(() => {});
    await this._notify(this._tl(`💧 Schnellladung gestartet (${duration} min)`, `💧 Hot water boost started (${duration} min)`));

    // Auto-Reset nach konfigurierbarer Zeit
    this._boostTimer = setTimeout(async () => {
      this.log(`Schnelladung beendet (${duration} min), schalte zurück auf Automatik`);
      this._boostTimer = null;
      await this._setWarmwaterOperationMode(0).catch((e) => this.error('Boost-Reset fehlgeschlagen:', e.message));
      await this.setCapabilityValue('hotwater_boost', false).catch(() => {});
      await this._triggerBoostEnded.trigger(this, {}).catch(() => {});
      await this._notify(this._tl('💧 Schnellladung beendet', '💧 Hot water boost ended'));
    }, duration * 60 * 1000);
  }

  async _stopHotwaterBoost() {
    this.log('Schnelladung manuell gestoppt');
    if (this._boostTimer) {
      clearTimeout(this._boostTimer);
      this._boostTimer = null;
      await this._triggerBoostEnded.trigger(this, {}).catch(() => {});
      await this._notify(this._tl('💧 Schnellladung beendet', '💧 Hot water boost ended'));
    }
    await this._setWarmwaterOperationMode(0);
    await this.setCapabilityValue('hotwater_boost', false);
  }

  async _startHotwaterBoostParty(durationMinutes) {
    const duration = Math.min(480, Math.max(5, durationMinutes || 60));
    this.log(`Schnellladung (Party) starten: ${duration} Minuten`);
    if (this._boostPartyTimer) {
      clearTimeout(this._boostPartyTimer);
      this._boostPartyTimer = null;
    }
    // Party-Modus setzen
    await this._setWarmwaterOperationMode(2);
    await this.setCapabilityValue('hotwater_boost_party', true);
    await this._triggerBoostPartyStarted.trigger(this, { duration }).catch(() => {});
    await this._notify(this._tl(`🎉 Schnellladung (Party) gestartet (${duration} min)`, `🎉 Hot water boost (party) started (${duration} min)`));
    // Auto-Reset nach konfigurierbarer Zeit
    this._boostPartyTimer = setTimeout(async () => {
      this.log(`Schnellladung (Party) beendet (${duration} min), schalte zurück auf Automatik`);
      this._boostPartyTimer = null;
      await this._setWarmwaterOperationMode(0).catch((e) => this.error('Party-Boost-Reset fehlgeschlagen:', e.message));
      await this.setCapabilityValue('hotwater_boost_party', false).catch(() => {});
      await this._triggerBoostPartyEnded.trigger(this, {}).catch(() => {});
      await this._notify(this._tl('🎉 Schnellladung (Party) beendet', '🎉 Hot water boost (party) ended'));
    }, duration * 60 * 1000);
  }

  async _stopHotwaterBoostParty() {
    this.log('Schnellladung (Party) manuell gestoppt');
    if (this._boostPartyTimer) {
      clearTimeout(this._boostPartyTimer);
      this._boostPartyTimer = null;
      await this._triggerBoostPartyEnded.trigger(this, {}).catch(() => {});
      await this._notify(this._tl('🎉 Schnellladung (Party) beendet', '🎉 Hot water boost (party) ended'));
    }
    await this._setWarmwaterOperationMode(0);
    await this.setCapabilityValue('hotwater_boost_party', false);
  }

  async _setThermalDisinfectionContinuous(enabled) {
    const value = enabled ? 1 : 0;
    this.log(`Thermische Desinfektion Dauerbetrieb: ${enabled ? 'ein' : 'aus'}`);
    await new Promise((resolve, reject) => {
      this._pump.writeRaw(27, value, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    await this.setCapabilityValue('thermal_disinfection_continuous', enabled);
    this.log(`Thermische Desinfektion Dauerbetrieb erfolgreich gesetzt: ${value}`);
  }

  // ─── Force Poll ────────────────────────────────────────────────────────────

  _registerForcePollListener() {
    if (!this.hasCapability('force_poll')) return;
    try {
      this.registerCapabilityListener('force_poll', async () => {
        this.log('Force-Poll ausgelöst via Capability');
        await this._doPoll();
      });
    } catch (e) {
      // Listener bereits registriert — ignorieren
    }
  }

  // ─── Low-level Write ───────────────────────────────────────────────────────

  // Gibt true zurück wenn meter_power aktiv sein soll:
  // power_sensor_enabled=true UND Heizen, Warmwasser und Standby alle > 0
  _meterPowerActive(settings) {
    const s = settings || this.getSettings();
    return s.power_sensor_enabled === true
      && Number(s.power_heating) > 0
      && Number(s.power_hotwater) > 0
      && Number(s.power_standby) > 0;
  }

  // Debounced Poll nach Write: mehrere schnelle Writes lösen nur einen Poll aus
  _schedulePollAfterWrite(delayMs = 3000) {
    if (this._pollAfterWriteTimer) clearTimeout(this._pollAfterWriteTimer);
    this._pollAfterWriteTimer = setTimeout(() => {
      this._pollAfterWriteTimer = null;
      this.log('Bestätigungs-Poll nach Write');
      this._doPoll();
    }, delayMs);
  }

  _write(parameter, value) {
    return new Promise((resolve, reject) => {
      if (!this._pump) { reject(new Error('Nicht verbunden')); return; }

      // Polling stoppen damit keine konkurrierende TCP-Verbindung offen ist
      this._stopPolling();
      this.log(`_write: ${parameter} = ${value} (Polling pausiert)`);

      // Kurz warten bis eine laufende Poll-Verbindung geschlossen ist
      setTimeout(() => {
        this._pump.write(parameter, value, (err, res) => {
          // Polling nach dem Write immer neu starten + 3s verzögerter Bestätigungs-Poll
          this._startPolling();
          this._schedulePollAfterWrite();

          if (err) {
            const msg = (err && err.message) ? err.message : String(err);
            this.error(`Write-Fehler (${parameter}=${value}): ${msg}`);
            reject(new Error(msg));
          } else {
            this.log(`Write OK: ${parameter}=${value}`, JSON.stringify(res));
            resolve(res);
          }
        });
      }, 1500);
    });
  }

  // ─── Hilfsfunktionen ───────────────────────────────────────────────────────

  async _setCapabilityConditional(capability, value, condition) {
    if (condition) {
      // Wert vorhanden → Capability hinzufügen falls noch nicht da, dann setzen
      if (!this.hasCapability(capability)) {
        this.log(`Aktiviere Capability (Wert vorhanden): ${capability}`);
        try { await this.addCapability(capability); }
        catch (e) { this.error(`addCapability ${capability} fehlgeschlagen:`, e.message); return; }
        // Titel nach addCapability() explizit setzen – Homey speichert den Titel beim ersten
        // Hinzufügen; ohne diesen Aufruf könnte ein veralteter/falscher Titel gespeichert werden.
        const titleFix = CAPABILITY_TITLE_FIXES[capability];
        if (titleFix) {
          try { await this.setCapabilityOptions(capability, titleFix); }
          catch (e) { this.error(`setCapabilityOptions ${capability} fehlgeschlagen:`, e.message); }
        }
      }
      await this._setIfValid(capability, value);
    } else {
      // Kein gültiger Wert → Capability entfernen falls vorhanden
      if (this.hasCapability(capability)) {
        this.log(`Deaktiviere Capability (kein Wert): ${capability}`);
        try { await this.removeCapability(capability); }
        catch (e) { this.error(`removeCapability ${capability} fehlgeschlagen:`, e.message); }
      }
    }
  }

  async _setIfValid(capability, value) {
    if (value === null || value === undefined || value === 'no' || Number.isNaN(value)) return;
    if (!this.hasCapability(capability)) return;
    // Write-Schutz: nach einem manuellen Schreiben kurz nicht überschreiben
    if (this._writeProtectUntil[capability] && Date.now() < this._writeProtectUntil[capability]) return;
    try { await this.setCapabilityValue(capability, value); }
    catch (e) { this.error(`Fehler beim Setzen von ${capability}:`, e.message); }
  }

  _setWriteProtect(capability, ms = 120000) {
    this._writeProtectUntil[capability] = Date.now() + ms;
  }

  /**
   * Synchronisiert den Wert einer Einstellung mit dem aktuell gelesenen Controller-Wert.
   * Wird nach jedem Poll aufgerufen damit die Einstellungs-UI den echten Controller-Wert
   * anzeigt (nicht den Default aus driver.compose.json).
   * Schreibt NICHT wenn Write-Schutz aktiv ist (= Nutzer hat gerade manuell geändert).
   * Hinweis: Device.setSettings() löst onSettings() NICHT aus, daher keine Schleife.
   */
  async _syncSetting(capabilityId, settingKey, value) {
    if (value === null || value === undefined) return;
    if (this._writeProtectUntil[capabilityId] && Date.now() < this._writeProtectUntil[capabilityId]) return;
    try { await this.setSettings({ [settingKey]: value }); } catch (e) { /* ignore */ }
  }

  _n(val) {
    if (val === null || val === undefined || val === 'no') return null;
    const n = parseFloat(val);
    return Number.isNaN(n) ? null : n;
  }

  _int(val) {
    if (val === null || val === undefined) return null;
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? null : n;
  }

  // ─── Benachrichtigungen ────────────────────────────────────────────────────

  /** Sendet eine Push-Benachrichtigung via Homey Notifications */
  _notify(excerpt) {
    return this.homey.notifications.createNotification({ excerpt })
      .catch((e) => this.error('Benachrichtigungs-Fehler:', e.message));
  }

  /** Gibt den deutschen oder englischen Text zurück je nach Homey-Sprache */
  _tl(de, en) {
    return this.homey.i18n.getLanguage() === 'de' ? de : en;
  }

}

module.exports = LuxtronikHeatpumpDevice;
