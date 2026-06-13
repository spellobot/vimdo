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
     * tags: (string)
     * content: (string) 
     */
    {id:generateUniqueID(), title:'Task 0', status:'pending', priority:'high', tags:["test", "other-test"], content:"<h1>Task</h1><p>This is a <b>test</b>.</p>"},
    {id:generateUniqueID(), title:'Task 1', status:'completed', priority:'low', tags:["test"], content:'<h1>Another task</h1> This is <i>another</i> <b>test</b>.'}
];
let selectedIndex = 0;

const viewer = document.getElementById('renderView');
const editor = document.getElementById('markdownEditor');
//
const commandInput = document.getElementById('commandInput');
const statusMode = document.getElementById('vimMode');
const syncStatus = document.getElementById('syncStatus');
const fileTree = document.getElementById('fileTree');
//
const taskTitle = document.getElementById('taskTitle');
const markdownContent = document.getElementById('markdownContent');
const priorityBadge = document.getElementById('priorityBadge');
const statusBadge = document.getElementById('statusBadge');
const taskTags = document.getElementById('taskTags');
//
let errorTimeoutId = null;

// Generates unique task ID using current date in YYYYMMDD_HHmmsssss format
function generateUniqueID() {
    let year, month, day, hours, minutes, seconds, miliseconds;
    
    const d = new Date();
    
    year = d.getFullYear();
    month = String(d.getMonth() + 1).padStart(2, "0");
    day = String(d.getDate()).padStart(2, "0");
    hours = String(d.getHours()).padStart(2, "0");
    minutes = String(d.getMinutes()).padStart(2, "0");
    seconds = String(d.getSeconds()).padStart(2, "0");
    miliseconds = String(d.getMilliseconds()).padStart(3, "0");

    return `${year}${month}${day}_${hours}${minutes}${seconds}${miliseconds}`;
}

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

    let htmlBuffer = '';

    activeTask.tags.forEach((tag, index) => {
        htmlBuffer += `
            <span class="tag-item">#${activeTask.tags[index].toLowerCase()}</span>
        `
    });

    console.log('Task object: ' + activeTask);

    taskTags.innerHTML = htmlBuffer;
}

// Handles parsing and executing input commands
function parseCommand(buffer) {
    let sections = buffer.trim().split(' ');
    let command = sections[0].toLowerCase();
    let argument = sections.slice(1).join(' ');

    switch (command) {
        case 'new':
            console.log("Action: Create task with title ->", argument);
            // TODO: call create task function
            break;
        
        case 'del':
            console.log("Action: Delete current task with index ->", selectedIndex);
            // TODO: call delete task function
            break;
        
        default:
            if (errorTimeoutId) {
                clearTimeout(errorTimeoutId);
            }

            let safeCommand = command.length > 5 ? command.substring(0,5) + '...' : command;

            syncStatus.textContent = `● Error: ${safeCommand} invalid`;
            syncStatus.style.color = 'red';

            errorTimeoutId = setTimeout(() => {
                syncStatus.textContent = '● Connected';
                syncStatus.style.color = '';
                errorTimeoutId = null;
            }, 2000);
            break; 
    }
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

        event.preventDefault();
        commandInput.readOnly = false;
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

    if (key === "Enter") {
        event.preventDefault();

        let commandBuffer = commandInput.value;
        parseCommand(commandBuffer);

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