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

const { app, BrowserWindow, ipcMain } = require('electron');
const { join } = require('path');
const { StorageManager } = require('./storage');
const { SyncEngine } = require('./syncEngine.js');

/* Performance / sandbox switches – keeps the renderer light 
   and avoids requiring GPU acceleration inside containers or VMs. */
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --max-semi-space-size=4');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');

let storage;
let syncEngine;
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 720,
        minHeight: 480,
        backgroundColor: '#0a0c10',
        title: 'VimDo',
        icon: join(__dirname, "../assets/icon.png"),
        webPreferences: {
            preload: join(__dirname, '../preload/preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
    storage = new StorageManager();
    await storage.init();

    syncEngine = new SyncEngine(storage);
    await syncEngine.start();

    // Seed a few sample tasks on the very first launch so the user can see
    // how the app behaves without having to create anything.
    if (storage.getAllTasks().length === 0) {
        await seedSampleTasks(storage);
    }

    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
});

function registerIpcHandlers() {
    ipcMain.handle('tasks:get-all', (_event, filter) => {
        return storage.getAllTasks(filter || {});
    });

    ipcMain.handle('tasks:get-content', (_event, id) => {
        return storage.getTaskContent(id);
    });

    ipcMain.handle('tasks:get', (_event, id) => {
        return storage.getTask(id);
    });

    ipcMain.handle('tasks:save', (_event, task) => {        
        return storage.saveTask(task);
    });

    ipcMain.handle('tasks:sync-all', async () => {
        return await syncEngine.broadcastAllTasks();
    });

    ipcMain.handle('tasks:push-single', async (_, id) => {
        const fullTask = await storage.getTask(id);
        if (fullTask) {
            syncEngine.broadcastTask(fullTask);
        } 
        return true;
    });

    ipcMain.handle('tasks:delete', (_event, id) => {
        return storage.deleteTask(id);
    });

    ipcMain.handle('tasks:get-folders', () => {
        return storage.getFolders();
    });

    // When the file system changes (external edit / future sync), nudge the
    // renderer so it can refresh its index.
    storage.onChange(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('tasks:changed');
        }
    });
}

async function seedSampleTasks(storage) {
    const samples = [
        {
            title: 'Estudar IPC',
            status: 'pending',
            priority: 'high',
            tags: ['universidade', 'electron'],
            folder: 'Universidade',
            body: [
                '# Estudar IPC',
                '',
                'O processo de renderização deve ler apenas o bloco necessário.',
                '',
                '- [ ] Configurar os canais de escuta',
                '- [ ] Testar a latência de comunicação',
                '- [ ] Documentar o fluxo de dados',
                '',
                '> O `preload` atua como ponte segura entre os processos.'
            ].join('\n')
        },
        {
            title: 'Definir package.json',
            status: 'completed',
            priority: 'low',
            tags: ['universidade'],
            folder: 'Universidade',
            body: [
                '# Definir package.json',
                '',
                'Configuração inicial do projeto Electron.',
                '',
                '- [x] Versão do Electron definida',
                '- [x] Scripts de inicialização criados',
                '- [x] Dependências instaladas'
            ].join('\n')
        },
        {
            title: 'Reunião com cliente',
            status: 'pending',
            priority: 'high',
            tags: ['trabalho'],
            folder: 'Trabalho',
            body: [
                '# Reunião com cliente',
                '',
                'Pauta:',
                '',
                '1. Apresentação do MVP',
                '2. Definição de prazos',
                '3. Alinhamento de expectativas'
            ].join('\n')
        },
        {
            title: 'Compras da semana',
            status: 'pending',
            priority: 'medium',
            tags: ['pessoal'],
            folder: 'Pessoal',
            body: [
                '# Compras da semana',
                '',
                '- Pão',
                '- Leite',
                '- Café',
                '- Fruta'
            ].join('\n')
        }
    ];

    for (const task of samples) {
        try {
            await storage.saveTask(task);
        } catch (err) {
            console.error(`[VimDo] Failed to seed task "${task.title}":`, err.message);
        }
    }
}