const { Server: IOServer } = require('socket.io');

const PLAYER_COLORS = ['#00b2e1', '#ff5252', '#2ecc71', '#ffd700'];

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateBlocks() {
  const blocks = [];
  for (let i = 0; i < 120; i++) {
    const roll = Math.random();
    const id = 'b_' + Date.now() + '_' + i + '_' + Math.random();
    if (roll < 0.15) {
      blocks.push({
        id,
        x: Math.random() * 4000,
        y: Math.random() * 4000,
        s: 100,
        hp: 400,
        maxHp: 400,
        pts: 250,
        color: '#ff00ff',
        isRainbow: false,
        isLegendary: false,
      });
    } else {
      blocks.push({
        id,
        x: Math.random() * 4000,
        y: Math.random() * 4000,
        s: 45,
        hp: 50,
        maxHp: 50,
        pts: 60,
        color: '#ffd700',
        isRainbow: false,
        isLegendary: false,
      });
    }
  }
  return blocks;
}

function setupSocketIO(httpServer) {
  const io = new IOServer(httpServer, {
    path: '/api/socket.io',
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  const rooms = new Map();

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    let currentRoom = null;

    socket.on('create_room', ({ nickname, color }) => {
      let code = generateCode();
      while (rooms.has(code)) code = generateCode();

      const player = {
        id: socket.id,
        nickname,
        color: color || PLAYER_COLORS[0],
        x: 2000,
        y: 2000,
        angle: 0,
        hp: 100,
        maxHp: 100,
        score: 0,
        type: 'normal',
        size: 28,
        speed: 0,
        isZombie: false,
      };

      const room = {
        code,
        hostId: socket.id,
        players: new Map([[socket.id, player]]),
        blocks: generateBlocks(),
      };

      rooms.set(code, room);
      currentRoom = code;
      socket.join(code);

      socket.emit('room_created', {
        roomCode: code,
        playerId: socket.id,
        players: Array.from(room.players.values()),
        blocks: room.blocks,
      });
    });

    socket.on('join_room', ({ roomCode, nickname, color }) => {
      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('error_msg', 'Sala no encontrada');
        return;
      }
      if (room.players.size >= 4) {
        socket.emit('error_msg', 'Sala llena (máx 4)');
        return;
      }

      const colorIdx = room.players.size % PLAYER_COLORS.length;
      const player = {
        id: socket.id,
        nickname,
        color: color || PLAYER_COLORS[colorIdx],
        x: 2000 + room.players.size * 150,
        y: 2000,
        angle: 0,
        hp: 100,
        maxHp: 100,
        score: 0,
        type: 'normal',
        size: 28,
        speed: 0,
        isZombie: false,
      };

      room.players.set(socket.id, player);
      currentRoom = roomCode;
      socket.join(roomCode);

      socket.emit('room_joined', {
        roomCode,
        playerId: socket.id,
        players: Array.from(room.players.values()),
        blocks: room.blocks,
      });

      socket.to(roomCode).emit('player_joined', { players: Array.from(room.players.values()) });
    });

    socket.on('player_update', (state) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (player) Object.assign(player, state);
      socket.to(currentRoom).emit('player_update', { ...state, id: socket.id });
    });

    socket.on('bullet_fired', (bullet) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('bullet_fired', bullet);
    });

    socket.on('block_hit', ({ blockId, damage, scorerId }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const block = room.blocks.find((b) => b.id === blockId);
      if (!block) return;
      block.hp -= damage;
      if (block.hp <= 0) {
        const pts = block.pts;
        const newBlock = {
          id: 'b_' + Date.now() + '_' + Math.random(),
          x: Math.random() * 4000,
          y: Math.random() * 4000,
          s: 45,
          hp: 50,
          maxHp: 50,
          pts: 60,
          color: '#ffd700',
          isRainbow: false,
          isLegendary: false,
        };
        const idx = room.blocks.indexOf(block);
        room.blocks.splice(idx, 1, newBlock);
        io.to(currentRoom).emit('block_destroyed', { blockId, newBlock, scorerId, pts });
      } else {
        io.to(currentRoom).emit('block_damaged', { blockId, hp: block.hp });
      }
    });

    socket.on('player_hit', ({ targetId, damage }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const target = room.players.get(targetId);
      if (!target || target.hp <= 0) return;
      target.hp = Math.max(0, target.hp - damage);
      io.to(currentRoom).emit('player_hit', { targetId, hp: target.hp });
      if (target.hp <= 0) io.to(currentRoom).emit('player_died', { deadId: targetId });
    });

    socket.on('evo_chosen', ({ type }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (player) player.type = type;
      socket.to(currentRoom).emit('player_evo', { id: socket.id, type, player });
    });

    socket.on('chat_message', ({ text }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const player = room.players.get(socket.id);
      const from = (player && player.nickname) || 'Jugador';
      io.to(currentRoom).emit('chat_message', { from, text });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(currentRoom);
        console.log('Room deleted (empty):', currentRoom);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players.keys().next().value;
          io.to(currentRoom).emit('new_host', { hostId: room.hostId });
        }
        io.to(currentRoom).emit('player_left', { players: Array.from(room.players.values()) });
      }
    });
  });

  return io;
}

module.exports = { setupSocketIO };
