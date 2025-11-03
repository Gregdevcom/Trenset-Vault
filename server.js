// server.js - WebSocket signaling server for WebRTC
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from 'public' directory
app.use(express.static("public"));

// Store connected clients and room information
const rooms = new Map(); // roomId -> Set of client WebSockets
const clientRooms = new Map(); // client WebSocket -> roomId

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received:", data.type);

      switch (data.type) {
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

        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    handleDisconnect(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Handle client joining a room
function handleJoin(ws, roomId) {
  // Leave current room if in one
  handleDisconnect(ws);

  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);

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

  console.log(`Client joined room ${roomId}. Room size: ${room.size}`);

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
    console.log("Client not in a room");
    return;
  }

  const room = rooms.get(roomId);

  if (!room) {
    console.log("Room not found");
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
      }
    }

    clientRooms.delete(ws);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
