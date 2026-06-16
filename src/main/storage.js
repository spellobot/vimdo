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

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto'); // Used to generate UUIDs for P2P
const chokidar = require('chokidar');
const YAML = require('yaml');

const DEFAULT_TASKS_DIR = path.join(os.homedir(), '.vimdo', 'tasks');

class StorageManager {
    constructor(tasksDir = DEFAULT_TASKS_DIR) {
        this.tasksDir = tasksDir;
        /** @type {Map<string, object>} id -> metadata */
        this.index = new Map();
        /** @type {Set<Function>} listeners invoked when the index changes */
        this.listeners = new Set();
        this.watcher = null;
    }

    async init() {
        await fs.mkdir(this.tasksDir, { recursive: true });
        await this.rebuildIndex();
        this._startWatcher();
    }

    // ------------------------------------------------------------------
    // Indexing
    // ------------------------------------------------------------------

    async rebuildIndex() {
        this.index.clear();
        await this._scanDirectory(this.tasksDir, '');
    }

    async _scanDirectory(dirPath, relativeFolder) {
        let entries;
        try {
            entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch (err) {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.trash') continue;
                const subFolder = relativeFolder
                    ? `${relativeFolder}/${entry.name}`
                    : entry.name;
                await this._scanDirectory(fullPath, subFolder);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                await this._indexFile(fullPath, relativeFolder);
            }
        }
    }

    async _indexFile(fullPath, folder) {
        try {
            const metadata = await this._readFrontmatter(fullPath);
            if (metadata && metadata.id) {
                metadata.folder = folder || '';
                metadata.filePath = fullPath;
                this.index.set(metadata.id, metadata);
            }
        } catch (err) {
            console.error('Failed to index file:', fullPath, err.message);
        }
    }

    async _readFrontmatter(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        return this._parseFrontmatter(content);
    }

    _parseFrontmatter(content) {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!match) {
            return { id: null, body: content };
        }
        
        const yamlBlock = match[1];
        let body = match[2];
        
        // Cleans whitespace
        body = body.replace(/^(\r?\n)+/, '');
        
        const metadata = YAML.parse(yamlBlock) || {};
        metadata.body = body;
        return metadata;
    }

    _serializeFrontmatter(metadata, body = '') {
        const fm = { ...metadata };
        delete fm.body;
        delete fm.folder;
        delete fm.filePath;
        const yamlStr = YAML.stringify(fm).trimEnd();
        
        // CORREÇÃO: Prevenir a dupla injeção de novas quebras de linha durante a gravação
        const safeBody = (body || '').replace(/^(\r?\n)+/, '');
        
        return `---\n${yamlStr}\n---\n\n${safeBody}`;
    }

    // ------------------------------------------------------------------
    // File Watching
    // ------------------------------------------------------------------

    _startWatcher() {
        if (this.watcher) this.watcher.close();
        this.watcher = chokidar.watch('**/*.md', {
            cwd: this.tasksDir,
            ignoreInitial: true,
            ignored: (p) => p.split(path.sep).includes('.trash'),
            awaitWriteFinish: {
                stabilityThreshold: 80,
                pollInterval: 25
            }
        });

        this.watcher.on('add', (rel) => this._handleFileChange(rel));
        this.watcher.on('change', (rel) => this._handleFileChange(rel));
        this.watcher.on('unlink', (rel) => this._handleFileUnlink(rel));
        this.watcher.on('error', (err) => console.error('Watcher error:', err));
    }

    async _handleFileChange(relPath) {
        const fullPath = path.join(this.tasksDir, relPath);
        const folder = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
        await this._indexFile(fullPath, folder);
        this._notifyChange();
    }

    _handleFileUnlink(relPath) {
        // CORREÇÃO: Converter o caminho relativo do Chokidar num caminho absoluto exato 
        // para garantir a remoção correta independentemente do Sistema Operativo.
        const fullPath = path.join(this.tasksDir, relPath);
        
        for (const [id, meta] of this.index.entries()) {
            if (meta.filePath === fullPath) {
                this.index.delete(id);
                break;
            }
        }
        this._notifyChange();
    }

    _notifyChange() {
        for (const fn of this.listeners) {
            try { fn(); } catch (_) { /* swallow listener errors */ }
        }
    }

    onChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    getAllTasks(filter = {}) {
        let tasks = Array.from(this.index.values());
        if (filter.folder) {
            tasks = tasks.filter((t) => t.folder === filter.folder);
        }
        if (filter.tag) {
            const tag = String(filter.tag).toLowerCase().replace(/^#/, '');
            tasks = tasks.filter(
                (t) => Array.isArray(t.tags) &&
                    t.tags.some((x) => String(x).toLowerCase() === tag)
            );
        }
        if (filter.status) {
            tasks = tasks.filter((t) => t.status === filter.status);
        }

        tasks.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

        return tasks.map((t) => ({
            id: t.id,
            title: t.title || 'Untitled',
            status: t.status || 'pending',
            priority: t.priority || 'low',
            tags: Array.isArray(t.tags) ? t.tags : [],
            folder: t.folder || '',
            updated_at: t.updated_at || 0
        }));
    }

    getFolders() {
        const folders = new Set();
        for (const meta of this.index.values()) {
            if (meta.folder) folders.add(meta.folder);
        }
        return Array.from(folders).sort();
    }

    async getTaskContent(id) {
        const meta = this.index.get(id);
        if (!meta) return null;
        const full = await this._readFrontmatter(meta.filePath);
        return full ? full.body : '';
    }

    async getTask(id) {
        const meta = this.index.get(id);
        if (!meta) return null;
        const body = await this.getTaskContent(id);
        return {
            id: meta.id,
            title: meta.title || 'Untitled',
            status: meta.status || 'pending',
            priority: meta.priority || 'low',
            tags: Array.isArray(meta.tags) ? meta.tags : [],
            folder: meta.folder || '',
            updated_at: meta.updated_at || 0,
            body: body || ''
        };
    }

    async saveTask(task) {
        const now = Date.now();
        const id = task.id || this._generateId();
        const folder = task.folder || '';
        const title = task.title || 'Untitled';
        const slug = this._slugify(title);

        const metadata = {
            id,
            title,
            priority: task.priority || 'low',
            status: task.status || 'pending',
            tags: Array.isArray(task.tags) ? task.tags : [],
            updated_at: now
        };

        const body = task.body || '';
        const fileContent = this._serializeFrontmatter(metadata, body);

        const folderPath = folder ? path.join(this.tasksDir, folder) : this.tasksDir;
        await fs.mkdir(folderPath, { recursive: true });

        const fileName = `${id}-${slug}.md`;
        const filePath = path.join(folderPath, fileName);

        const existingMeta = this.index.get(id);
        if (existingMeta && existingMeta.filePath && existingMeta.filePath !== filePath) {
            try { await fs.unlink(existingMeta.filePath); } catch (_) { /* ignore */ }
        }

        await fs.writeFile(filePath, fileContent, 'utf-8');
        await this._indexFile(filePath, folder);

        return this.index.get(id);
    }

    async deleteTask(id) {
        const meta = this.index.get(id);
        if (!meta) return false;
        if (meta.filePath) {
            try { 
                // 1. Apaga o ficheiro Markdown
                await fs.unlink(meta.filePath); 
                
                // 2. Tenta apagar a pasta pai se ela não for a pasta raiz e estiver vazia
                const dirPath = path.dirname(meta.filePath);
                if (dirPath !== this.tasksDir) {
                    const remainingFiles = await fs.readdir(dirPath);
                    if (remainingFiles.length === 0) {
                        await fs.rmdir(dirPath); // Apaga a pasta vazia
                    }
                }
            } catch (err) { 
                console.error("Erro ao apagar tarefa/pasta:", err.message);
            }
        }
        this.index.delete(id);
        return true;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    _generateId() {
        // CORREÇÃO: Usar crypto.randomUUID para Resistência a Colisões Absoluta no P2P
        return crypto.randomUUID();
    }

    _slugify(text) {
        let s = String(text).toLowerCase();
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        s = s.replace(/\s+/g, '-');
        s = s.replace(/[^a-z0-9-]/g, '');
        s = s.replace(/-+/g, '-');
        s = s.replace(/^-+|-+$/g, '');
        return s || 'untitled';
    }
}

module.exports = { StorageManager, DEFAULT_TASKS_DIR };