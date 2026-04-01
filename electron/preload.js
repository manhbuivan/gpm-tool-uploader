const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  runCommand: (cmd) => ipcRenderer.invoke('run-command', cmd),
  stopCommand: () => ipcRenderer.invoke('stop-command'),
  getExcelPath: () => ipcRenderer.invoke('get-excel-path'),
  onLog: (callback) => ipcRenderer.on('log', (_, data) => callback(data)),
  onCommandDone: (callback) => ipcRenderer.on('command-done', (_, data) => callback(data)),
});
