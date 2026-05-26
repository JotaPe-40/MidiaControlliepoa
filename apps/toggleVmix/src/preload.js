const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toggleVmix', {
  getState: () => ipcRenderer.invoke('toggle:get-state'),
  setState: (enabled) => ipcRenderer.invoke('toggle:set-state', enabled),
  ensureTopmost: () => ipcRenderer.invoke('toggle:refresh-topmost'),
  testVmix: (target) => ipcRenderer.invoke('toggle:test-vmix', target),
});