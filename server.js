const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const ROOM_CODE_LENGTH = 6;

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('🔌 Conectado:', socket.id);

  socket.on('createRoom', () => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    rooms.set(code, { players: [socket.id], createdAt: Date.now() });
    socket.join(code);
    socket.emit('roomCreated', { code });
    console.log('🏠 Sala:', code);
  });

  socket.on('joinRoom', (code) => {
    code = code.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Sala cheia' });
      return;
    }

    room.players.push(socket.id);
    socket.join(code);
    socket.emit('joined', { code });
    io.to(code).emit('matchReady', { code });
    console.log('✅ Entrou na sala:', code);
  });

  socket.on('updatePosition', (data) => {
    for (const [code, room] of rooms.entries()) {
      if (room.players.includes(socket.id)) {
        socket.to(code).emit('playerUpdate', {
          id: socket.id,
          x: data.x,
          z: data.z,
          health: data.health,
          rotY: data.rotY
        });
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Desconectado:', socket.id);
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.indexOf(socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        socket.to(code).emit('playerLeft', { id: socket.id });
        if (room.players.length === 0) rooms.delete(code);
        break;
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('GHOST FIRE Server Online ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Rodando na porta ${PORT}`);
});
