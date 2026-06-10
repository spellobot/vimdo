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

let currentMode = 'NORMAL';
let testArray = [
    /* id: (int)
     * title: (string)
     * status: [pending, completed]
     * priority: [low, high]
     * content: (string) 
     */
    {id:0, title:'Task 0', status:'pending', priority:'high', content:"<h1>Task</h1><p>This is a <b>test</b>.</p>"},
    {id:1, title:'Task 1', status:'completed', priority:'low', content:"<h1>Another task</h1> This is <i>another</i> <b>test</b>."}
];
let selectedIndex = 0;

const viewer = document.getElementById('renderView');
const editor = document.getElementById('markdownEditor');

const commandInput = document.getElementById('commandInput');
const statusMode = document.getElementById('vimMode');
const fileTree = document.getElementById('fileTree');

const taskTitle = document.getElementById('taskTitle');
const markdownContent = document.getElementById('markdownContent');
const priorityBadge = document.getElementById('priorityBadge');
const statusBadge = document.getElementById('statusBadge');

// Handles sidebar file list rendering
function renderSidebar() {
    fileTree.innerHTML = '';
    
    let htmlBuffer = '';
    
    testArray.forEach((task, index) => {
        htmlBuffer += `
            <div class="file-item" data-index="${index}">
                <span class="status-indicator ${task.status.toLowerCase()}"></span>
                <span class="file-title">${task.title}</span>
            </div>
        `;
    });

    fileTree.innerHTML = htmlBuffer;
}


// Handles sidebar cursor selection & task content rendering
function renderSelection() {

    // Sidebar cursor selection
    let elementList = document.querySelectorAll('.file-item');
    elementList.forEach(element => {
        element.classList.remove('active');
    });
    elementList[selectedIndex].classList.add('active');

    // Selected task content
    let activeTask = testArray[selectedIndex];

    taskTitle.textContent = activeTask.title;
    markdownContent.innerHTML = activeTask.content;
    priorityBadge.className = `badge priority-${activeTask.priority}`;
    priorityBadge.textContent = `${activeTask.priority}`;
    statusBadge.className = `badge status-${activeTask.status}`;
    statusBadge.textContent = `${activeTask.status}`;
}

window.addEventListener('keydown', function(event) {
    switch (currentMode) {
        case 'NORMAL':
            handleNormalMode(event);
            break;

        case 'COMMAND':
            handleCommandMode(event);
            break;

        case 'INSERT':
            handleInsertMode(event);
            break;
    }
});

function handleNormalMode(event) {
    let key = event.key;

    if (key === ":") {
        currentMode = 'COMMAND';
        statusMode.textContent = currentMode;

        commandInput.readOnly = false;
        event.preventDefault();
        commandInput.focus();
    }

    if (key === "i") {
        currentMode = 'INSERT';
        statusMode.textContent = currentMode;

        event.preventDefault();
        editor.value = testArray[selectedIndex].content;
        viewer.classList.add('hidden');
        editor.classList.remove('hidden');
        editor.focus();
    }
    
    if (key === "j") {
        if (selectedIndex + 1 < testArray.length) {
                selectedIndex++;
                renderSelection();
        }
    }

    if (key === "k") {
        if (selectedIndex > 0) {
            selectedIndex--;
            renderSelection();
        }
    }
}

function handleCommandMode(event) {
    let key = event.key;

    if (key === "Escape") {
        currentMode = 'NORMAL';
        statusMode.textContent = currentMode;

        commandInput.readOnly = true;
        commandInput.blur();
        commandInput.value = '';
    }
}

function handleInsertMode(event) {
    let key = event.key;

    if (key === "Escape") {
        currentMode = 'NORMAL';
        statusMode.textContent = currentMode;

        testArray[selectedIndex].content = editor.value;
        viewer.classList.remove('hidden');
        editor.classList.add('hidden');
        editor.blur();

        renderSelection();
    }
}

renderSidebar();
renderSelection();