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

/* ============================================================
 * VimDo (Renderer)
 *
 * Function:
 * 1. Render the sidebar + main viewer.
 * 2. Drive the Vim-style state machine.
 * 3. Parse & execute command-line commands.
 * 4. Persist changes through the IPC bridge (`window.api`). 
 * ============================================================ */

// --- DOM Handles ----------------------------------------------
const viewer = document.getElementById('renderView');
const editor = document.getElementById('markdownEditor');
const commandInput = document.getElementById('commandInput');
const statusMode = document.getElementById('vimMode');
const syncStatus = document.getElementById('syncStatus');
const fileTree = document.getElementById('fileTree');
const taskTitle = document.getElementById('taskTitle');
const markdownContent = document.getElementById('markdownContent');
const priorityBadge = document.getElementById('priorityBadge');
const statusBadge = document.getElementById('statusBadge');
const taskTags = document.getElementById('taskTags');
const folderBreadcrumb = document.getElementById('folderBreadcrumb');
const taskCount = document.getElementById('taskCount');

// --- State -----------------------------------------------------
let currentMode = 'NORMAL';
let selectedTaskId = null;
let errorTimeoutId = null;

/** Lightweight metadata list currently displayed (after filter). */
let allTasks = [];
/** Full task currently loaded (with body). */
let currentTaskFull = null;
/** Active folder ("") means "show all". */
let activeFolder = '';
/** Active tag filter (null = no filter). */
let tagFilter = null;

// ===============================================================
// DOM Helpers
// ===============================================================

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setMode(mode) {
    currentMode = mode;
    statusMode.textContent = mode;
    statusMode.closest('.status-bar').className =
        mode === 'NORMAL' ? 'status-bar' : `status-bar mode-${mode.toLowerCase()}`;
}

function showStatus(msg, kind = 'info') {
    if (errorTimeoutId) clearTimeout(errorTimeoutId);
    syncStatus.textContent = `● ${msg}`;
    syncStatus.style.color =
        kind === 'error' ? 'var(--terminal-red)' :
        kind === 'warn'  ? 'var(--terminal-amber)' :
                           'var(--terminal-green)';
    errorTimeoutId = setTimeout(() => {
        syncStatus.textContent = '● Ready';
        syncStatus.style.color = '';
        errorTimeoutId = null;
    }, 2200);
}

function showError(msg) { showStatus(msg, 'error'); }
function showWarn(msg)  { showStatus(msg, 'warn'); }

// ===============================================================
// Data Loading
// ===============================================================

async function loadTasks() {
    const filter = {};
    if (activeFolder) filter.folder = activeFolder;
    if (tagFilter) filter.tag = tagFilter;

    try {
        allTasks = await window.api.getTasks(filter);
    } catch (err) {
        console.error(err);
        showError('Storage unavailable');
        allTasks = [];
    }

    // Safely check if the currently selected task ID still exists in the newly loaded list.
    // If not, default to the first available task.
    const exists = allTasks.some((t) => t.id === selectedTaskId);
    if (!exists) {
        selectedTaskId = allTasks.length > 0 ? allTasks[0].id : null;
    }

    renderSidebar();
    await renderSelection();
    updateStatusBar();
}

async function reloadCurrentTask() {
    if (allTasks.length === 0 || !selectedTaskId) {
        currentTaskFull = null;
        return;
    }
    try {
        const result = await window.api.getTaskContent(selectedTaskId);
        
        // Vamos buscar os metadados da tarefa ativa (title, id, tags, etc.)
        const activeTask = allTasks.find(t => t.id === selectedTaskId);
        
        // Normalizamos para garantir que o currentTaskFull é SEMPRE um objeto completo
        if (typeof result === 'string') {
            currentTaskFull = { ...activeTask, body: result };
        } else if (typeof result === 'object' && result !== null) {
            currentTaskFull = { ...activeTask, ...result };
        } else {
            currentTaskFull = { ...activeTask, body: '' };
        }

    } catch (err) {
        console.error(err);
        currentTaskFull = null;
    }
}

// ===============================================================
// Slugify
// ===============================================================

// Turns title string into a URL-friendly slug
function slugify(text) {
    let s = String(text).toLowerCase();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/\s+/g, '-');
    s = s.replace(/[^a-z0-9-]/g, '');
    s = s.replace(/-+/g, '-');
    s = s.replace(/^-+|-+$/g, '');
    return s || 'untitled';
}

// ===============================================================
// Rendering
// ===============================================================

function renderSidebar() {
    fileTree.innerHTML = '';

    // Group tasks by folder for display.
    const grouped = new Map();
    for (const task of allTasks) {
        const folder = task.folder || 'Sem Pasta';
        if (!grouped.has(folder)) grouped.set(folder, []);
        grouped.get(folder).push(task);
    }

    let htmlBuffer = '';
    if (grouped.size === 0) {
        htmlBuffer = `
            <div class="empty-sidebar">
                <p>No tasks found.</p>
                <p>Press <kbd>:</kbd> then type <code>new [title]</code>.</p>
            </div>`;
    } else {
        for (const [folder, tasks] of grouped.entries()) {
            htmlBuffer += renderFolder(folder, tasks);
        }
    }

    fileTree.innerHTML = htmlBuffer;
}

function renderFolder(folder, tasks) {
    let items = '';
    tasks.forEach((task) => {
        const globalIdx = allTasks.indexOf(task);
        const statusCls = task.status === 'completed' ? 'completed' : 'pending';
        items += `
            <div class="file-item" data-index="${globalIdx}" data-id="${escapeHtml(task.id)}">
                <span class="status-indicator ${statusCls}"></span>
                <span class="file-title">${escapeHtml(task.title)}</span>
            </div>`;
    });
    return `
        <div class="folder-item">
            <span class="folder-name" data-folder="${escapeHtml(folder)}">${escapeHtml(folder)}</span>
            <div class="folder-content">${items}</div>
        </div>`;
}

async function renderSelection() {
    // Highlight selected file in the sidebar.
    const elements = document.querySelectorAll('.file-item');
    elements.forEach((el) => el.classList.remove('active'));

    const activeTask = allTasks.find(task => task.id === selectedTaskId);

    if (activeTask) {
        const activeElement = document.querySelector(`.file-item[data-id="${selectedTaskId}"]`);
        if (activeElement) {
            activeElement.classList.add('active');
            activeElement.scrollIntoView({ block: 'nearest' });
        }
    }

    if (allTasks.length === 0 || !activeTask) {
        taskTitle.textContent = '—';
        priorityBadge.className = 'badge';
        priorityBadge.textContent = '';
        statusBadge.className = 'badge';
        statusBadge.textContent = '';
        taskTags.innerHTML = '';
        markdownContent.innerHTML = `
            <p class="empty-state">
                No task selected.<br>
                Press <kbd>:</kbd> to enter command mode, then type <code>new &lt;title&gt;</code>.
            </p>`;
        currentTaskFull = null;
        return;
    }

    await reloadCurrentTask();

    taskTitle.textContent = activeTask.title;

    priorityBadge.className = `badge priority-${activeTask.priority}`;
    priorityBadge.textContent = activeTask.priority;
    statusBadge.className = `badge status-${activeTask.status}`;
    statusBadge.textContent = activeTask.status;

    let tagsHtml = '';
    for (const tag of (activeTask.tags || [])) {
        tagsHtml += `<span class="tag-item">#${escapeHtml(String(tag).toLowerCase())}</span>`;
    }
    taskTags.innerHTML = tagsHtml;

    // Handles both an object containing .body or raw body string safely.
    const markdownBody = currentTaskFull?.body || '';
    markdownContent.innerHTML = renderMarkdown(markdownBody);
}

function updateStatusBar() {
    const task = allTasks.find(t => t.id === selectedTaskId);
    if (task) {
        const slug = slugify(task.title);
        const folderPrefix = task.folder ? `${task.folder}/` : '';
        fileInfo.textContent = `${folderPrefix}${task.id}-${slug}.md`;
    } else {
        fileInfo.textContent = '—';
    }

    const folderLabel = activeFolder || (tagFilter ? `#${tagFilter}` : 'All folders');
    folderBreadcrumb.textContent = folderLabel;
    taskCount.textContent = `${allTasks.length} task${allTasks.length === 1 ? '' : 's'}`;
}

// ===============================================================
// Markdown to HTML Renderer
// ===============================================================

function renderMarkdown(md) {
    if (!md || !md.trim()) {
        return '<p class="empty-state">No content yet. Press <kbd>i</kbd> to edit.</p>';
    }

    const codeBlocks = [];
    md = md.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ lang, code });
        return `\u0000CODEBLOCK${idx}\u0000`;
    });

    md = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    md = md.replace(/\r\n/g, '\n');

    const lines = md.split('\n');
    const out = [];
    let i = 0;

    const inline = (s) => s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

    while (i < lines.length) {
        const line = lines[i];

        const codeMatch = line.match(/^\u0000CODEBLOCK(\d+)\u0000$/);
        if (codeMatch) {
            const block = codeBlocks[Number(codeMatch[1])];
            out.push(`<pre><code class="lang-${escapeHtml(block.lang || '')}">${escapeHtml(block.code.replace(/\n$/, ''))}</code></pre>`);
            i++;
            continue;
        }

        if (line.trim() === '') { i++; continue; }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
            out.push('<hr>');
            i++;
            continue;
        }

        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            const level = h[1].length;
            out.push(`<h${level}>${inline(h[2])}</h${level}>`);
            i++;
            continue;
        }

        if (/^>\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }
            out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
            continue;
        }

        const taskItem = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (taskItem) {
            const checked = taskItem[1].toLowerCase() === 'x';
            const cls = checked ? 'task-check checked' : 'task-check unchecked';
            const mark = checked ? '☑' : '☐';
            // CORREÇÃO: Adicionado o <span class="text-content"> para o CSS atuar corretamente
            out.push(`<div class="${cls}"><span class="check-box">${mark}</span> <span class="text-content">${inline(taskItem[2])}</span></div>`);
            i++;
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
                i++;
            }
            out.push(`<ol>${items.join('')}</ol>`);
            continue;
        }

        const buf = [];
        while (i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,6}\s|>\s?|[-*]\s|\d+\.\s|(-{3,}|\*{3,}|_{3,})$)/.test(lines[i]) &&
            !/^\u0000CODEBLOCK/.test(lines[i])) {
            buf.push(lines[i]);
            i++;
        }
        if (buf.length) {
            out.push(`<p>${inline(buf.join('<br>'))}</p>`);
        }
    }

    return out.join('\n');
}

// ===============================================================
// Command Parser
// ===============================================================

async function parseCommand(buffer) {
    const trimmed = buffer.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const argument = parts.slice(1).join(' ');

    switch (command) {
        // ----- new [folder]/[title] or new [title] ----------------------
        case 'new': {
            let folder, title;
            if (argument.includes('/')) {
                const slashIdx = argument.lastIndexOf('/');
                folder = argument.slice(0, slashIdx);
                title = argument.slice(slashIdx + 1);
            } else {
                folder = activeFolder;
                title = argument;
            }

            if (!title) { showError('new: title required'); return; }

            try {
                const saved = await window.api.saveTask({
                    title,
                    status: 'pending',
                    priority: 'low',
                    tags: [],
                    folder,
                    //body: `# ${title}\n`
                    body: ''
                });
                selectedTaskId = saved.id;
                await loadTasks();
                showStatus(`Created: ${title}`);
            } catch (err) {
                showError(`new: ${err.message}`);
            }
            return;
        }

        // ----- del [folder]/[title] or del ------------------------------
        case 'del':
        case 'delete':
        case 'rm': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('del: no task to delete'); return; }

            let targetId;
            if (argument) {
                const found = allTasks.find((t) => {
                    const full = (t.folder ? t.folder + '/' : '') + t.title;
                    return full.toLowerCase() === argument.toLowerCase() ||
                        t.title.toLowerCase() === argument.toLowerCase();
                });
                if (!found) { showError(`del: not found: ${argument}`); return; }
                targetId = found.id;
            } else {
                targetId = selectedTaskId;
            }

            try {
                // If deleting the active task, select its closest visual sibling next
                if (selectedTaskId === targetId) {
                    const elements = Array.from(document.querySelectorAll('.file-item'));
                    const currentIdx = elements.findIndex((el) => el.dataset.id === selectedTaskId);
                    if (currentIdx >= 0) {
                        const nextSelected = elements[currentIdx + 1] || elements[currentIdx - 1];
                        selectedTaskId = nextSelected ? nextSelected.dataset.id : null;
                    }
                }
                await window.api.deleteTask(targetId);
                await loadTasks();
                showStatus('Deleted');
            } catch (err) {
                showError(`del: ${err.message}`);
            }
            return;
        }

        // ----- cd [folder] / open [folder] ------------------------------
        case 'cd': {
            if (!argument || argument === '/') {
                activeFolder = '';
                tagFilter = null;
                selectedTaskId = null;
                await loadTasks();
                showStatus('Showing all folders');
                return;
            }
            try {
                const folders = await window.api.getFolders();
                if (folders.includes(argument)) {
                    activeFolder = argument;
                    tagFilter = null;
                    selectedTaskId = null;
                    await loadTasks();
                    showStatus(`Folder: ${argument}`);
                } else {
                    showError(`cd: folder not found: ${argument}`);
                }
            } catch (err) {
                showError(`cd: ${err.message}`);
            }
            return;
        }

        // ----- open [folder]/[title] or open ----------------------------
        case 'open': {
            if (!argument) {
                await renderSelection();
                return;
            }
            try {
                const folders = await window.api.getFolders();
                if (folders.includes(argument)) {
                    activeFolder = argument;
                    tagFilter = null;
                    selectedTaskId = null;
                    await loadTasks();
                    showStatus(`Folder: ${argument}`);
                    return;
                }
            } catch (_) { /* ignore */ }

            const found = allTasks.find((t) => {
                const full = (t.folder ? t.folder + '/' : '') + t.title;
                return full.toLowerCase() === argument.toLowerCase();
            });
            if (found) {
                selectedTaskId = found.id;
                await renderSelection();
                updateStatusBar();
                showStatus(`Opened: ${found.title}`);
            } else {
                showError(`open: not found: ${argument}`);
            }
            return;
        }

        // ----- tag [name] ------------------------------------------------
        case 'tag': {
            if (!argument) {
                tagFilter = null;
                showStatus('Tag filter cleared');
            } else {
                tagFilter = argument.replace(/^#/, '').toLowerCase();
                showStatus(`Filter: #${tagFilter}`);
            }
            selectedTaskId = null;
            await loadTasks();
            return;
        }

        // ----- done / undo ----------------------------------------------
        case 'done':
        case 'complete': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('done: no task selected'); return; }
            await patchCurrentTask({ status: 'completed' });
            showStatus('Marked done');
            return;
        }

        case 'undo':
        case 'pending': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('undo: no task selected'); return; }
            await patchCurrentTask({ status: 'pending' });
            showStatus('Marked pending');
            return;
        }

        case 'toggle': {
            if (allTasks.length === 0 || !selectedTaskId) return;
            const task = allTasks.find((t) => t.id === selectedTaskId);
            if (!task) return;
            const next = task.status === 'completed' ? 'pending' : 'completed';
            await patchCurrentTask({ status: next });
            showStatus(`Status: ${next}`);
            return;
        }

        // ----- priority [low|medium|high] -------------------------------
        case 'priority':
        case 'p': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('priority: no task selected'); return; }
            const p = (argument || '').toLowerCase();
            if (!['low', 'medium', 'high'].includes(p)) {
                showError('priority: must be low | medium | high');
                return;
            }
            await patchCurrentTask({ priority: p });
            showStatus(`Priority: ${p}`);
            return;
        }

        // ----- tag add/remove -------------------------------------------
        case 'tag+': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('tag+: no task selected'); return; }
            if (!argument) { showError('tag+: name required'); return; }
            const name = argument.replace(/^#/, '').toLowerCase();
            const tags = Array.from(new Set([...(currentTaskFull?.tags || []), name]));
            await patchCurrentTask({ tags });
            showStatus(`Added #${name}`);
            return;
        }

        case 'tag-': {
            if (allTasks.length === 0 || !selectedTaskId) { showError('tag-: no task selected'); return; }
            if (!argument) { showError('tag-: name required'); return; }
            const name = argument.replace(/^#/, '').toLowerCase();
            const tags = (currentTaskFull?.tags || []).filter((t) => t !== name);
            await patchCurrentTask({ tags });
            showStatus(`Removed #${name}`);
            return;
        }

        // ----- help ------------------------------------------------------
        case 'help':
        case '?': {
            showStatus('new, del, cd, open, tag, tag+, tag-, done, undo, toggle, priority, help');
            return;
        }

        default:
            showError(`Unknown: ${command.substring(0, 12)}`);
    }
}

/**
 * Patch the currently selected task with partial fields and reload.
 */
async function patchCurrentTask(patch) {
    if (!currentTaskFull) return;
    try {
        await window.api.saveTask({
            ...currentTaskFull,
            ...patch
        });
        await loadTasks();
    } catch (err) {
        showError(err.message);
    }
}

// ===============================================================
// Keyboard State Machine
// ===============================================================

window.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
        if (currentMode === 'INSERT') {
            event.preventDefault();
            await handleInsertEscape();
            return;
        }
        if (currentMode === 'COMMAND') {
            event.preventDefault();
            exitCommandMode();
            return;
        }
    }

    if (currentMode === 'INSERT' && document.activeElement === editor) {
        return;
    }

    if (currentMode === 'COMMAND' && document.activeElement === commandInput) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const buffer = commandInput.value;
            exitCommandMode();
            await parseCommand(buffer);
        }
        return;
    }

    if (currentMode === 'NORMAL') {
        await handleNormalMode(event);
    }
});

function exitCommandMode() {
    setMode('NORMAL');
    commandInput.readOnly = true;
    commandInput.blur();
    commandInput.value = '';
}

async function handleNormalMode(event) {
    const key = event.key;

    if (key === ':') {
        event.preventDefault();
        setMode('COMMAND');
        commandInput.readOnly = false;
        commandInput.focus();
        return;
    }

    if (key === 'i' || key === 'a') {
        if (allTasks.length === 0 || !selectedTaskId) return;
        event.preventDefault();
        setMode('INSERT');
        editor.value = currentTaskFull?.body || '';
        viewer.classList.add('hidden');
        editor.classList.remove('hidden');
        editor.focus();
        return;
    }

    // Visual tree lookup to move exactly one row up/down in DOM folder order
    if (key === 'j' || key === 'ArrowDown') {
        event.preventDefault();
        const elements = Array.from(document.querySelectorAll('.file-item'));
        const currentIdx = elements.findIndex((el) => el.dataset.id === selectedTaskId);
        if (currentIdx !== -1 && currentIdx + 1 < elements.length) {
            selectedTaskId = elements[currentIdx + 1].dataset.id;
            await renderSelection();
            updateStatusBar();
        }
        return;
    }
    if (key === 'k' || key === 'ArrowUp') {
        event.preventDefault();
        const elements = Array.from(document.querySelectorAll('.file-item'));
        const currentIdx = elements.findIndex((el) => el.dataset.id === selectedTaskId);
        if (currentIdx !== -1 && currentIdx > 0) {
            selectedTaskId = elements[currentIdx - 1].dataset.id;
            await renderSelection();
            updateStatusBar();
        }
        return;
    }

    if (key === 'g') {
        event.preventDefault();
        const elements = document.querySelectorAll('.file-item');
        if (elements.length > 0) {
            selectedTaskId = elements[0].dataset.id;
            await renderSelection();
            updateStatusBar();
        }
        return;
    }
    if (key === 'G') {
        event.preventDefault();
        const elements = document.querySelectorAll('.file-item');
        if (elements.length > 0) {
            selectedTaskId = elements[elements.length - 1].dataset.id;
            await renderSelection();
            updateStatusBar();
        }
        return;
    }

    if (key === 'x') {
        event.preventDefault();
        await parseCommand('toggle');
        return;
    }

    if (key === '?') {
        event.preventDefault();
        showStatus('Commands: new, del, cd, open, tag, done, undo, toggle, priority, help');
    }
}

async function handleInsertEscape() {
    setMode('NORMAL');

    // CORREÇÃO: Aplicar .trim() para evitar que cada Esc crie novos espaços indesejados
    const newBody = editor.value.trim();
    if (currentTaskFull && newBody !== (currentTaskFull.body || '').trim()) {
        try {
            currentTaskFull.body = newBody;
            await window.api.saveTask(currentTaskFull);
            showStatus('Saved');
        } catch (err) {
            showError(`Save failed: ${err.message}`);
        }
    }

    viewer.classList.remove('hidden');
    editor.classList.add('hidden');
    editor.blur();

    await loadTasks();
}

// ===============================================================
// Mouse Interactions
// ===============================================================

fileTree.addEventListener('click', async (event) => {
    const folderEl = event.target.closest('.folder-name');
    if (folderEl) {
        const folder = folderEl.dataset.folder;
        if (folder && folder !== 'Sem Pasta') {
            activeFolder = folder;
            tagFilter = null;
            selectedTaskId = null;
            await loadTasks();
        } else if (folder === 'Sem Pasta') {
            activeFolder = '';
            tagFilter = null;
            selectedTaskId = null;
            await loadTasks();
        }
        return;
    }

    const item = event.target.closest('.file-item');
    if (!item) return;
    const taskId = item.dataset.id;
    if (taskId) {
        selectedTaskId = taskId;
        await renderSelection();
        updateStatusBar();
    }
});

taskTags.addEventListener('click', async (event) => {
    const tagEl = event.target.closest('.tag-item');
    if (!tagEl) return;
    const name = tagEl.textContent.replace(/^#/, '');
    tagFilter = name;
    selectedTaskId = null;
    await loadTasks();
    showStatus(`Filter: #${name}`);
});

// ===============================================================
// External FS Change Listener
// ===============================================================

// TODO: P2P Sync, External Editing

if (window.api && typeof window.api.onTasksChanged === 'function') {
    window.api.onTasksChanged(async () => {
        await loadTasks();
        showStatus('Files updated externally');
    });
}

// ===============================================================
// Bootstrap
// ===============================================================

(async () => {
    await loadTasks();
    showStatus('Ready');
})();