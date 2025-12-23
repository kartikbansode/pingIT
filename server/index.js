import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("pingIT signaling server running");
});

const wss = new WebSocketServer({ server });
const rooms = {};

function safeSend(ws, data) {
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch (e) {
    console.error("Send error:", e);
  }
}

wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📨 Message:", data);

      const room = data.roomId;
      if (!room) return;

      rooms[room] = rooms[room] || [];
      if (!rooms[room].includes(ws)) rooms[room].push(ws);

      // Relay to others in room
      rooms[room].forEach((client) => {
        if (client !== ws) {
          safeSend(client, data);
        }
      });
    } catch (err) {
      console.error("❌ Message handling error:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    for (const r in rooms) {
      rooms[r] = rooms[r].filter(c => c !== ws);
      if (rooms[r].length === 0) delete rooms[r];
    }
  });

  ws.on("error", (err) => {
    console.error("❌ WS error:", err);
  });
});

// Keep connections alive (important on Render)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 pingIT signaling server running on port ${PORT}`);
});
