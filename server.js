const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const SimplePeer = require('simple-peer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://amubhya.test', 'https://katakreasi.com'],
    methods: ["GET", "POST"]
  }
});
const port = process.env.PORT || 3000;

// Middleware untuk mengatasi CORS
app.use((req, res, next) => {
  const allowedOrigins = ['https://amubhya.test', 'https://katakreasi.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

// Objek untuk menyimpan informasi tentang setiap ruang (room)
const rooms = {};

// Atur socket.io
io.on('connection', (socket) => {
  console.log('Klien terhubung');

  // Tambahkan properti untuk melacak apakah pengguna sudah memulai panggilan
  socket.isInCall = false;

  socket.on('disconnect', () => {
    console.log('Klien terputus');
    
    // Keluar dari ruang saat klien terputus
    const room = socket.room;
    if (room && rooms[room]) {
      rooms[room].delete(socket.id);
    }
  });

  // Event untuk bergabung ke ruang (room) atau membuat baru jika belum ada
  socket.on('join-room', (roomName) => {
    if (!rooms[roomName]) {
      // Jika ruang belum ada, maka buat ruang baru
      rooms[roomName] = new Set();
      socket.join(roomName);
      socket.room = roomName;
      rooms[roomName].add(socket.id);
      socket.emit('room-joined', roomName);
    } else if (rooms[roomName].size < 2) {
      // Jika ruang kurang dari 2 pengguna, pengguna dapat bergabung
      socket.join(roomName);
      socket.room = roomName;
      rooms[roomName].add(socket.id);
      socket.emit('room-joined', roomName);
    } else {
      // Jika ruang sudah penuh, coba cari atau buat ruang baru
      let newRoomName = roomName;
      let roomNumber = 2;
      while (rooms[newRoomName] && rooms[newRoomName].size >= 2) {
        newRoomName = roomName + roomNumber;
        roomNumber++;
      }
    
      // Jika ditemukan atau dibuat ruang baru, pengguna dapat bergabung
      if (!rooms[newRoomName]) {
        rooms[newRoomName] = new Set();
      }
      socket.join(newRoomName);
      socket.room = newRoomName;
      rooms[newRoomName].add(socket.id);
      socket.emit('room-joined', newRoomName);
    }
    
    // Jika sudah ada 2 pengguna di ruang ini, dan pengguna ini belum memulai panggilan, maka mulailah panggilan
    if (rooms[roomName] && rooms[roomName].size === 2 && !socket.isInCall) {
      socket.isInCall = true;
      startCallInRoom(roomName);
    }
  });

  // Fungsi untuk memulai panggilan di ruang tertentu
  function startCallInRoom(roomName) {
    const room = io.sockets.adapter.rooms[roomName];
    if (room && room.size === 2) {
      let targetSocketId;
      room.forEach((socketId) => {
        if (socketId !== socket.id) {
          targetSocketId = socketId;
        }
      });

      if (targetSocketId) {
        // Buat instance simple-peer untuk inisiasi panggilan
        const initiatorPeer = new SimplePeer({ initiator: true });
        const targetPeer = new SimplePeer();

        // Kirim offer dari initiator ke target
        initiatorPeer.on('signal', (offer) => {
          io.to(targetSocketId).emit('offer', offer);
        });

        // Kirim answer dari target ke initiator
        targetPeer.on('signal', (answer) => {
          socket.emit('answer', answer);
        });

        // Terima stream video dari initiator dan kirimkan ke target
        initiatorPeer.on('stream', (stream) => {
          io.to(targetSocketId).emit('stream', stream);
        });

        // Terima stream video dari target dan kirimkan ke initiator
        targetPeer.on('stream', (stream) => {
          socket.emit('stream', stream);
        });

        // Terima sinyal offer dari target
        socket.on('offer', (offer) => {
          targetPeer.signal(offer);
        });

        // Terima sinyal answer dari initiator
        socket.on('answer', (answer) => {
          initiatorPeer.signal(answer);
        });
      }
    }
  }
});

// Mulai server Express
server.listen(port, () => {
  console.log(`Server berjalan di https://rtc.katakreasi.com:${port}`);
});


//routing
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const roomName in rooms) {
    const participantCount = rooms[roomName].size;
    roomList.push({ name: roomName, participant: participantCount });
  }
  res.json(roomList);
});