const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const SimplePeer = require('simple-peer');
const session = require('express-session'); // Import modul sesi

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
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

// Middleware untuk mengelola sesi
const sessionMiddleware = session({
  secret: 'BuYz3xiRsru2Hg0C91r1khmdbLeXWS2Z', // Ganti dengan kunci rahasia yang lebih aman
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true } // Atur menjadi true jika Anda menggunakan HTTPS
});

// Tambahkan middleware sesi ke Express
app.use(sessionMiddleware);

// Gunakan middleware sesi untuk Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next);
});

// Objek untuk menyimpan informasi tentang setiap ruang (room)
const rooms = {};

// Penanganan WebRTC Peer
function startCallInRoom(roomName, socket) {
  const peer = new SimplePeer({ initiator: true }); // Penginisiasi panggilan

  peer.on('signal', (data) => {
    // Kirim sinyal ke klien lain
    socket.to(roomName).emit('signal', data);
  });

  peer.on('stream', (stream) => {
    // Kirim stream video ke klien lain
    socket.to(roomName).emit('stream', stream);
  });

  // Koneksi ke sinyal masuk dari klien lain
  socket.on('signal', (data) => {
    peer.signal(data);
  });

  // Menerima panggilan dari klien lain
  socket.on('call', () => {
    if (!socket.isInCall) {
      socket.isInCall = true;
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          peer.addStream(stream); // Tambahkan stream ke peer
          socket.emit('stream', stream); // Kirim stream video Anda sendiri
        })
        .catch((error) => {
          console.error('Error accessing media devices:', error);
        });
    }
  });
}

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
      startCallInRoom(roomName, socket);
    }
  });
});

// Mulai server Express
server.listen(port, () => {
  console.log(`Server berjalan di https://rtc.katakreasi.com:${port}`);
});

// Routing untuk mendapatkan daftar ruang yang ada
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const roomName in rooms) {
    const participantCount = rooms[roomName].size;
    roomList.push({ name: roomName, participant: participantCount });
  }
  res.json(roomList);
});
