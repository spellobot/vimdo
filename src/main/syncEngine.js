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

/* ===============================================================
 * P2P Sync Engine
 * 
 * Function:
 * 1. Peer Discovery via mDNS (Bonjour)
 * 2. HTTP Server to receive incoming task updates
 * 3. Broadcast updates to known peers
 * =============================================================== */

const http = require('http');
const os = require('os');
const Bonjour = require('bonjour-service').default;

class SyncEngine {
    constructor(storageManager) {
        this.storage = storageManager;
        this.bonjour = new Bonjour();
        this.peers = new Map(); // Stores { ip, port } of peers
        this.server = null;
        this.myPort = 0;
        this.instanceId = `VimDo-${os.hostname()}-${Math.floor(Math.random() * 1000)}`;
    }

    async start() {
        // 1. Start the HTTP Server to listen for updates
        this.server = http.createServer((req, res) => this._handleIncomingRequests(req, res));

        return new Promise((resolve) => {
            // Listening on port 0 makes the OS freely pick a random port
            this.server.listen(0, '0.0.0.0', () => {
                this.myPort = this.server.address().port;
                console.log(`[P2P] Local server listening on port ${this.myPort}`);

                // 2. Announce our presence in the local network
                this._startDiscovery();
                resolve();
            });
        });
    }

    _startDiscovery() {
        // Announce this peer
        this.bonjour.publish({
            name: this.instanceId,
            type: 'vimdo',
            port: this.myPort
        });

        // Search for other peers in the network
        this.bonjour.find({ type: 'vimdo' }, (service) => {
            if (!service.addresses || !Array.isArray(service.addresses) || service.addresses.length === 0) {
                return; 
            }
            
            const peerIp = service.addresses.find(ip => ip.includes('.')) || service.addresses[0];
            const peerId = service.name;
            
            this.peers.set(peerId, { ip: peerIp, port: service.port });
            console.log(`[P2P] Peer discovered: ${peerId} at ${peerIp}:${service.port}`);
        });
    }

    // Handles received files of other peers
    _handleIncomingRequests(req, res) {
        if (req.method === 'POST' && req.url === '/sync') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async() => {
                try {
                    const incomingTask = JSON.parse(body);
                    await this._resolveConflict(incomingTask);
                    res.writeHead(200);
                    res.end('OK');
                } catch (err) {
                    res.writeHead(400);
                    res.end('Bad Request');
                }
            });
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    // LWW (Last-Write-Wins)
    async _resolveConflict(incomingTask) {
        const localTask = await this.storage.getTask(incomingTask.id);

        // If we don't get the task, or if the received has a more recent `updated_at`, we save
        if (!localTask || incomingTask.updated_at > localTask.updated_at) {
            console.log(`[P2P] Update accepted for task: ${incomingTask.title}`);
            // Uses original `saveTask`, it will generate the YAML, Markdown and save
            await this.storage.saveTask(incomingTask);
        } else {
            console.log(`[P2P] Task rejected (our version is newer): ${incomingTask.title}`);
        }
    }

    // Function to send our task to all the peers
    broadcastTask(taskFull) {
        if (this.peers.size === 0) return;

        const payload = JSON.stringify(taskFull);

        for (const [peerId, peer] of this.peers.entries()) {
            const url = `http://${peer.ip}:${peer.port}/sync`;

            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            }).catch(err => {
                console.error(`[P2P] Falha ao enviar para ${peerId}:`, err.message);
                // Se falhar (ex: amigo fechou o PC), removemos da lista
                this.peers.delete(peerId);
            });
        }
    }

    // Takes all local tasks and sends them in mass
    async broadcastAllTasks() {
        if (this.peers.size === 0) return { peers: 0, tasks: 0 };

        const allTasksMeta = this.storage.getAllTasks();
        let count = 0;

        for (const meta of allTasksMeta) {
            const fullTask = await this.storage.getTask(meta.id);
            if (fullTask) {
                this.broadcastTask(fullTask);
                count++;
            }
        }
        
        return { peers: this.peers.size, tasks: count };
    }
}

module.exports = { SyncEngine };