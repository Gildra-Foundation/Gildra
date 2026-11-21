const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame && location.protocol === 'gear:') {
  contextBridge.exposeInMainWorld('gear', {
    state: () => ipcRenderer.invoke('gear:state'),
    action: (action, value) => ipcRenderer.invoke('gear:action', action, value),
    subscribe: (fn) => {
      const update = (_, snapshot) => fn(snapshot);
      ipcRenderer.on('gear:state', update);
      return () => ipcRenderer.removeListener('gear:state', update);
    },
  });
}
