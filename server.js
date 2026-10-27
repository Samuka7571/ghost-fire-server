
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const rooms = new Map();

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });
        res.end(JSON.stringify({
            status: "online",
            service: "GHOST FIRE"
        }));
        return;
    }

    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("GHOST FIRE multiplayer server");
});

const wss = new WebSocket.Server({
    server: server,
    path: "/ws",
    maxPayload: 16384
});

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data, except) {
    room.players.forEach(player => {
        if (player && player !== except) {
            send(player, data);
        }
    });
}

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;

    do {
        code = "";
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(
                Math.floor(Math.random() * chars.length)
            );
        }
    } while (rooms.has(code));

    return code;
}

function closeRoom(code, leavingPlayer) {
    const room = rooms.get(code);
    if (!room) return;

    broadcast(room, {
        type: "opponent_left",
        message: "O outro jogador saiu da sala."
    }, leavingPlayer);

    room.players.forEach(player => {
        if (player && player !== leavingPlayer) {
            player.roomCode = null;
            player.playerNumber = 0;
        }
    });

    rooms.delete(code);
}

wss.on("connection", function(ws) {
    ws.roomCode = null;
    ws.playerNumber = 0;

    send(ws, {
        type: "connected",
        message: "Conectado ao servidor GHOST FIRE."
    });

    ws.on("message", function(raw) {
        let msg;

        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            send(ws, {
                type: "error",
                message: "Mensagem inválida."
            });
            return;
        }

        if (!msg || typeof msg.type !== "string") {
            send(ws, {
                type: "error",
                message: "Tipo de mensagem ausente."
            });
            return;
        }

        if (msg.type === "create") {
            if (ws.roomCode) {
                send(ws, {
                    type: "error",
                    message: "Você já está em uma sala."
                });
                return;
            }

            const code = makeCode();
            const room = {
                code: code,
                players: [ws, null]
            };

            rooms.set(code, room);
            ws.roomCode = code;
            ws.playerNumber = 1;

            send(ws, {
                type: "room_created",
                code: code,
                player: 1,
                message: "Sala criada. Aguarde o adversário."
            });
            return;
        }

        if (msg.type === "join") {
            if (ws.roomCode) {
                send(ws, {
                    type: "error",
                    message: "Você já está em uma sala."
                });
                return;
            }

            const code = String(msg.code || "")
                .trim().toUpperCase();
            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Sala não encontrada."
                });
                return;
            }

            if (room.players[0] && room.players[1]) {
                send(ws, {
                    type: "error",
                    message: "Esta sala já está cheia."
                });
                return;
            }

            const slot = room.players[0] ? 1 : 0;
            room.players[slot] = ws;
            ws.roomCode = code;
            ws.playerNumber = slot + 1;

            send(ws, {
                type: "joined",
                code: code,
                player: slot + 1
            });

            broadcast(room, {
                type: "match_ready",
                code: code,
                message: "Dois jogadores conectados."
            });

            return;
        }

        if (msg.type === "leave") {
            if (ws.roomCode) {
                const code = ws.roomCode;
                ws.roomCode = null;
                ws.playerNumber = 0;
                closeRoom(code, ws);
            }

            send(ws, { type: "left" });
            return;
        }

        if (msg.type === "ping") {
            send(ws, { type: "pong" });
            return;
        }

        if (msg.type === "state" || msg.type === "action") {
            if (!ws.roomCode) {
                send(ws, {
                    type: "error",
                    message: "Entre em uma sala primeiro."
                });
                return;
            }

            const room = rooms.get(ws.roomCode);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "A sala não existe mais."
                });
                return;
            }

            broadcast(room, {
                type: msg.type,
                player: ws.playerNumber,
                data: msg.data || {}
            }, ws);

            return;
        }

        send(ws, {
            type: "error",
            message: "Comando desconhecido."
        });
    });

    ws.on("close", function() {
        if (ws.roomCode) {
            const code = ws.roomCode;
            ws.roomCode = null;
            closeRoom(code, ws);
        }
    });

    ws.on("error", function() {});
});

server.listen(PORT, "0.0.0.0", function() {
    console.log(
        "GHOST FIRE server listening on port " + PORT
    );
});
