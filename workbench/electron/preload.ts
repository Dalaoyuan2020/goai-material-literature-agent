import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('knowledge', {
  load: () => ipcRenderer.invoke('knowledge:load')
});

contextBridge.exposeInMainWorld('citespace', {
  pickDataDirectory: () => ipcRenderer.invoke('citespace:pick-data-directory')
});

contextBridge.exposeInMainWorld('engines', {
  detect: () => ipcRenderer.invoke('engines:detect'),
  launch: (id: string, dataDir?: string) => ipcRenderer.invoke('engines:launch', id, dataDir),
  cleanPaths: () => ipcRenderer.invoke('engines:clean-paths')
});
