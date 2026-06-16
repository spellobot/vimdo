/*
 * Copyright (C) 2026 Ari Brandão
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // 1. Fetch metadata list (passes optional filter object)
    getTasks: (filter) => ipcRenderer.invoke('tasks:get-all', filter),
    // 2. Fetch full body content of a single task
    getTaskContent: (taskId) => ipcRenderer.invoke('tasks:get-content', taskId),
    // 3. Save or update task content/metadata
    saveTask: (task) => ipcRenderer.invoke('tasks:save', task),
    // 4. Delete task
    deleteTask: (taskId) => ipcRenderer.invoke('tasks:delete', taskId),
    // 5. Fetch list of available folder strings
    getFolders: () => ipcRenderer.invoke('tasks:get-folders'),
    // 6. Listen for changes observed in the filesystem
    onTasksChanged: (callback) => ipcRenderer.on('tasks:changed', (_event, ...args) => callback(...args)),

    syncAll: () =>  ipcRenderer.invoke('tasks:sync-all'),
    pushTask: (taskId) => ipcRenderer.invoke('tasks:push-single', taskId)
});