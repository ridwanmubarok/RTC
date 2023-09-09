const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const SimplePeer = require('simple-peer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
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

  socket.on('disconnect', () => {
    console.log('Klien terputus');
    
    // Keluar dari ruang saat klien terputus
    const room = socket.room;
    if (room && rooms[room]) {
      rooms[room].delete(socket.id);
    }
  });

  // Event untuk bergabung ke ruang (room) baru
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
    socket.room = roomName;

    // Membuat objek set (untuk menghindari duplikat) untuk setiap ruang
    if (!rooms[roomName]) {
      rooms[roomName] = new Set();
    }
    rooms[roomName].add(socket.id);
  });

  // Handle event untuk memulai panggilan video
  socket.on('start-call', (targetSocketId) => {
    const room = socket.room;

    if (!room || !rooms[room]) {
      socket.emit('room-not-found');
      return;
    }

    const targetSocket = Array.from(rooms[room]).find(
      (id) => id === targetSocketId
    );

    if (!targetSocket) {
      socket.emit('user-not-found');
      return;
    }

    // Buat instance simple-peer untuk inisiasi panggilan
    const initiatorPeer = new SimplePeer({ initiator: true });
    const targetPeer = new SimplePeer();

    // Kirim offer dari initiator ke target
    initiatorPeer.on('signal', (offer) => {
      io.to(targetSocket).emit('offer', offer);
    });

    // Kirim answer dari target ke initiator
    targetPeer.on('signal', (answer) => {
      socket.emit('answer', answer);
    });

    // Terima stream video dari initiator dan kirimkan ke target
    initiatorPeer.on('stream', (stream) => {
      io.to(targetSocket).emit('stream', stream);
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
  });
});

// Mulai server Express
server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});