const http = require('http');
const WebSocket = require('ws');

// Create an HTTP server that responds to baseline cloud platform health checks
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Collapse Game Server is alive and healthy!\n');
});
const wss = new WebSocket.Server({ server });

// Global Room Configuration
let roomConfig = {
    ruleMode: 'classic',
    rows: 5,
    cols: 5,
    maxPlayers: 2,
    activePlayerList: ['red', 'blue']
};

let players = { red: null, blue: null, green: null, yellow: null };
let spectators = new Set();
let matchStarted = false;

console.log("🚀 Authoritative Multi-Mode Collapse Server Initialized.");

wss.on('connection', (ws) => {
    let assignedColor = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join_lobby') {
                if (matchStarted) {
                    assignedColor = 'spectator';
                    spectators.add(ws);
                    ws.send(JSON.stringify({ type: 'init', color: 'spectator' }));
                    return;
                }

                const isFirst = !players.red && !players.blue && !players.green && !players.yellow;

                if (isFirst) {
                    assignedColor = 'red';
                    players.red = ws;
                    
                    roomConfig.ruleMode = data.ruleMode;
                    if (data.ruleMode === '3player') {
                        roomConfig.maxPlayers = 3;
                        roomConfig.activePlayerList = ['red', 'blue', 'green'];
                    } else if (data.ruleMode === '4player') {
                        roomConfig.maxPlayers = 4;
                        roomConfig.activePlayerList = ['red', 'blue', 'green', 'yellow'];
                    } else {
                        roomConfig.maxPlayers = 2;
                        roomConfig.activePlayerList = ['red', 'blue'];
                    }

                    if (data.ruleMode === '7x7') { roomConfig.rows = 7; roomConfig.cols = 7; }
                    else if (data.ruleMode === '9x9') { roomConfig.rows = 9; roomConfig.cols = 9; }
                    else { roomConfig.rows = 5; roomConfig.cols = 5; }

                    console.log(` LOBBY CREATED BY HOST. Mode: ${roomConfig.ruleMode.toUpperCase()} (${roomConfig.maxPlayers} Players Required)`);
                } else {
                    const requiredSeats = roomConfig.activePlayerList;
                    for (let seat of requiredSeats) {
                        if (!players[seat]) {
                            assignedColor = seat;
                            players[seat] = ws;
                            break;
                        }
                    }
                    if (!assignedColor) {
                        assignedColor = 'spectator';
                        spectators.add(ws);
                    }
                }

                console.log(`User registered successfully as: ${assignedColor.toUpperCase()}`);
                ws.send(JSON.stringify({ type: 'init', color: assignedColor }));

                let currentActiveCount = 0;
                roomConfig.activePlayerList.forEach(p => { if (players[p]) currentActiveCount++; });

                if (currentActiveCount === roomConfig.maxPlayers) {
                    matchStarted = true;
                    console.log(" All seats filled! Syncing board configurations...");
                    broadcast({
                        type: 'start',
                        ruleMode: roomConfig.ruleMode,
                        rows: roomConfig.rows,
                        cols: roomConfig.cols,
                        activePlayers: roomConfig.activePlayerList
                    });
                }
            }

            if (data.type === 'move') {
                if (assignedColor === 'spectator' || !matchStarted) return;
                broadcast({
                    type: 'execute',
                    r: data.r,
                    c: data.c
                });
            }

        } catch (err) {
            console.error("Failed to parse packet payload data:", err);
        }
    });

    ws.on('close', () => {
        console.log(`Connection to player slot ${assignedColor ? assignedColor.toUpperCase() : 'UNKNOWN'} severed.`);
        if (assignedColor && assignedColor !== 'spectator') {
            players[assignedColor] = null;
            if (matchStarted) {
                matchStarted = false;
                players = { red: null, blue: null, green: null, yellow: null };
                spectators.clear();
                console.log("Match disrupted. Lobby variables reset.");
                broadcast({ type: 'reset' });
            }
        } else {
            spectators.delete(ws);
        }
    });
});

function broadcast(payload) {
    const message = JSON.stringify(payload);
    Object.values(players).forEach(client => {
        if (client && client.readyState === WebSocket.OPEN) client.send(message);
    });
    spectators.forEach(client => {
        if (client && client.readyState === WebSocket.OPEN) client.send(message);
    });
}

// CRITICAL STEP: Bind dynamically to the cloud host's system port, fallback to 8080 locally
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🎮 Collapse Engine Server active on port :${PORT}`);
});