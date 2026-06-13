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
    getTasks: () => ipcRenderer.invoke('tasks:get-all'),
    getTaskContent: (taskId) => ipcRenderer.invoke('tasks:get-content', taskId),
    saveTask: (task) => ipcRenderer.invoke('tasks:save', task),
    deleteTask: (taskId) => ipcRenderer.invoke('tasks:delete', taskId)
});