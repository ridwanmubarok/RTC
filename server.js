const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const SimplePeer = require('simple-peer');
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc'); // Import node-webrtc

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://amubhya.test', 'https://katakreasi.com'],
    methods: ["GET", "POST"]
  }
});
const port = process.env.PORT || 3000;

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

const rooms = {};

function startCallInRoom(roomName, socket) {
  const peer = new SimplePeer({ initiator: true, wrtc: RTCPeerConnection }); // Use RTCPeerConnection from node-webrtc

  peer.on('signal', (data) => {
    socket.to(roomName).emit('signal', data);
  });

  peer.on('stream', (stream) => {
    socket.to(roomName).emit('stream', stream);
  });

  socket.on('signal', (data) => {
    peer.signal(data);
  });

  socket.on('call', () => {
    if (!socket.isInCall) {
      socket.isInCall = true;
      // You may need to adapt this part to capture audio/video from server-side sources
      const mediaStream = new MediaStream(); // Create an empty MediaStream
      const audioTrack = mediaStream.addTrack(peer.addTrack(RTCAudioTrack)); // Add an audio track
      const videoTrack = mediaStream.addTrack(peer.addTrack(RTCVideoTrack)); // Add a video track
      socket.emit('stream', mediaStream);
    }
  });
}

io.on('connection', (socket) => {
  console.log('Klien terhubung');
  socket.isInCall = false;

  socket.on('disconnect', () => {
    console.log('Klien terputus');
    const room = socket.room;
    if (room && rooms[room]) {
      rooms[room].delete(socket.id);
    }
  });

  socket.on('join-room', (roomName) => {
    if (!rooms[roomName]) {
      rooms[roomName] = new Set();
      socket.join(roomName);
      socket.room = roomName;
      rooms[roomName].add(socket.id);
      socket.emit('room-joined', roomName);
    } else if (rooms[roomName].size < 2) {
      socket.join(roomName);
      socket.room = roomName;
      rooms[roomName].add(socket.id);
      socket.emit('room-joined', roomName);
    } else {
      let newRoomName = roomName;
      let roomNumber = 2;
      while (rooms[newRoomName] && rooms[newRoomName].size >= 2) {
        newRoomName = roomName + roomNumber;
        roomNumber++;
      }

      if (!rooms[newRoomName]) {
        rooms[newRoomName] = new Set();
      }
      socket.join(newRoomName);
      socket.room = newRoomName;
      rooms[newRoomName].add(socket.id);
      socket.emit('room-joined', newRoomName);
    }

    if (rooms[roomName] && rooms[roomName].size === 2 && !socket.isInCall) {
      socket.isInCall = true;
      startCallInRoom(roomName, socket);
    }
  });
});

server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const roomName in rooms) {
    const participantCount = rooms[roomName].size;
    roomList.push({ name: roomName, participant: participantCount });
  }
  res.json(roomList);
});
