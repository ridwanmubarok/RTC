const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://amubhya.test', 'https://katakreasi.com'],
    methods: ["GET", "POST"]
  }
});
const port = process.env.PORT || 3000;

// Middleware untuk mengatasi CORS - Hapus middleware ini jika Anda telah mengkonfigurasi CORS di socket.io
app.use((req, res, next) => {
  const allowedOrigins = ['https://amubhya.test', 'https://katakreasi.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Objek untuk menyimpan informasi tentang setiap ruang (room)
const rooms = {};

// Event handler ketika klien terhubung
io.on('connection', (socket) => {
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
    io.to(roomName).emit('user-connected', socket.id);
    socket.on('disconnect', () => {
      io.to(roomName).emit('user-disconnected', socket.id);
    });
    socket.on('message', (message) => {
      io.to(roomName).emit('message', message);
    });
  });
});

// Mulai server Express
server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});