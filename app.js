'use strict';

const { App } = require('homey');

class LuxtronikApp extends App {

  async onInit() {
    this.log('Luxtronik Heat Pump App has been initialized');
    // App-Version für die Debug-Seite in den Settings speichern
    try {
      this.homey.settings.set('app_version', this.homey.manifest.version);
    } catch (_e) { /* ignore */ }
  }

}

module.exports = LuxtronikApp;
