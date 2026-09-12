import { browser } from 'wxt/browser';

// Registers the REPRO tab next to Elements / Console / Network.
browser.devtools.panels.create('REPRO', '', 'devtools-panel.html');
