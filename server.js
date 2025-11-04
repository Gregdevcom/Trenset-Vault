// server.js - WebSocket signaling server for WebRTC with reconnection support
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from current directory
app.use(express.static("."));

// ✨ NEW: API endpoint to check if a room exists
app.get("/api/check-room", (req, res) => {
  // Get the roomId from the URL query parameter
  // Example: /api/check-room?roomId=abc123
  // req.query.roomId will be "abc123"
  const roomId = req.query.roomId;

  // Check if this room was properly created
  const exists = validRooms.has(roomId);

  // Send back a JSON response
  // This is like the server saying "yes" or "no"
  res.json({ exists: exists });
});

// Store connected clients and room information
const rooms = new Map(); // roomId -> Set of client WebSockets
const clientRooms = new Map(); // client WebSocket -> roomId
const validRooms = new Set();
// Heartbeat to detect disconnected clients
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Clean up any closed/dead connections from a room
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Find and remove any dead connections
  room.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) {
      room.delete(client);
      clientRooms.delete(client);
    }
  });

  // If room is now empty, delete it entirely
  if (room.size === 0) {
    rooms.delete(roomId);
  }
}

wss.on("connection", (ws) => {
  // Setup heartbeat
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case "create-room": // ✨ NEW
          handleCreateRoom(ws, data.roomId);
          break;
        case "join":
          handleJoin(ws, data.roomId);
          break;

        case "offer":
          broadcastToRoom(ws, data);
          break;

        case "answer":
          broadcastToRoom(ws, data);
          break;

        case "ice-candidate":
          broadcastToRoom(ws, data);
          break;

        case "restart":
          broadcastToRoom(ws, data);
          break;

        case "check-peer":
          broadcastToRoom(ws, data);
          break;

        case "peer-ready":
          broadcastToRoom(ws, data);
          break;

        default:
          console.log("Unknown message type:", data.type);
      }
    } catch {}
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });
});

// Heartbeat interval to detect dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      handleDisconnect(ws);
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

// Create a new room (only called by room creator)
function handleCreateRoom(ws, roomId) {
  // Mark this room as valid
  validRooms.add(roomId);

  // Now join the room
  handleJoin(ws, roomId);
}

// Handle client joining a room
function handleJoin(ws, roomId) {
  // Leave current room if in one
  handleDisconnect(ws);

  // ✨ NEW: Check if room is valid (was properly created)
  if (!validRooms.has(roomId)) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Room does not exist",
        redirect: true, // Tell client to redirect
      })
    );
    return;
  }

  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);

  // ✨ NEW: Clean up any dead connections first
  cleanupRoom(roomId);

  // Check if room is full (limit to 2 users for 1-on-1 call)
  if (room.size >= 2) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
    return;
  }

  // Add client to room
  room.add(ws);
  clientRooms.set(ws, roomId);

  // Notify client they joined successfully
  ws.send(
    JSON.stringify({
      type: "joined",
      roomId: roomId,
      isInitiator: room.size === 1, // First person creates offer
    })
  );

  // If second person joined, notify first person to start call
  if (room.size === 2) {
    room.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "ready" }));
      }
    });
  }
}

// Broadcast message to all other clients in the same room
function broadcastToRoom(sender, data) {
  const roomId = clientRooms.get(sender);

  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);

  if (!room) {
    return;
  }

  // Send to all clients in room except sender
  room.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Handle client disconnect
function handleDisconnect(ws) {
  const roomId = clientRooms.get(ws);

  if (roomId) {
    const room = rooms.get(roomId);

    if (room) {
      room.delete(ws);

      // Notify other clients in room
      room.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "peer-disconnected" }));
        }
      });

      // Delete room if empty
      if (room.size === 0) {
        rooms.delete(roomId);
        validRooms.delete(roomId);
      }
    }

    clientRooms.delete(ws);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
