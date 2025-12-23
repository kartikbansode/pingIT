import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("pingIT signaling server");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on("connection", (ws) => {
  ws.roomId = null;
  console.log("🔌 Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📨", data);

      const { type, roomId } = data;
      if (!roomId) return;

      if (type === "join") {
        ws.roomId = roomId;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        console.log(`👥 Client joined room ${roomId}`);
      }

      // Relay message to others in the room
      if (rooms.has(roomId)) {
        for (const client of rooms.get(roomId)) {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(JSON.stringify(data));
          }
        }
      }
    } catch (e) {
      console.error("❌ Error:", e);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    if (ws.roomId && rooms.has(ws.roomId)) {
      rooms.get(ws.roomId).delete(ws);
      if (rooms.get(ws.roomId).size === 0) {
        rooms.delete(ws.roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 pingIT signaling server running on ${PORT}`);
});
