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

console.log("🚀 Resilient Lockstep Collapse Server Initialized.");

function broadcast(payload) {
    const message = JSON.stringify(payload);
    Object.values(players).forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(message);
    });
    spectators.forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(message);
    });
}

function checkLobbyStart() {
    let currentActiveCount = 0;
    roomConfig.activePlayerList.forEach(p => { if (players[p]) currentActiveCount++; });

    if (currentActiveCount === roomConfig.maxPlayers) {
        matchStarted = true;
        console.log(`🎮 LOBBY READY: Booting online ${roomConfig.ruleMode.toUpperCase()} match.`);
        broadcast({
            type: 'start',
            ruleMode: roomConfig.ruleMode,
            rows: roomConfig.rows,
            cols: roomConfig.cols,
            activePlayers: roomConfig.activePlayerList
        });
    }
}

wss.on('connection', (ws) => {
    let assignedColor = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Lobby Entry Control Block
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

                    console.log(`Lobby configured by host. Rule Profile: ${roomConfig.ruleMode.toUpperCase()}`);
                } else {
                    for (let seat of roomConfig.activePlayerList) {
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

                ws.send(JSON.stringify({ type: 'init', color: assignedColor }));
                checkLobbyStart();
            }

            // 2. Lockstep Move Processing Node
            if (data.type === 'move') {
                if (assignedColor === 'spectator' || !matchStarted) return;
                broadcast({ type: 'execute', r: data.r, c: data.c });
            }

            // 3. Persistent Instant Match Reset Handler
            if (data.type === 'request_reset') {
                if (assignedColor && assignedColor !== 'spectator') {
                    console.log(`Match reset command initialized by ${assignedColor.toUpperCase()}`);
                    broadcast({
                        type: 'start',
                        ruleMode: roomConfig.ruleMode,
                        rows: roomConfig.rows,
                        cols: roomConfig.cols,
                        activePlayers: roomConfig.activePlayerList
                    });
                }
            }

        } catch (err) {
            console.error("Failed to sequence network packet:", err);
        }
    });

    ws.on('close', () => {
        if (assignedColor && assignedColor !== 'spectator') {
            console.log(`Seated player assignment ${assignedColor.toUpperCase()} dropped connection.`);
            players[assignedColor] = null;
            matchStarted = false;
            
            // Revert current players to lobby status without dropping their seat allocations
            broadcast({ type: 'player_left', color: assignedColor });
        } else {
            spectators.delete(ws);
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🎮 Collapse Master Control active on port :${PORT}`);
});
