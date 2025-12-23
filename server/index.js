import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("pingIT signaling alive");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  ws.on("message", (msg) => {
    const text = msg.toString();
    console.log("📨 Relay:", text);

    // relay to everyone else
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(text);
      }
    });
  });

  ws.on("close", () => console.log("❌ Client disconnected"));
  ws.on("error", (e) => console.error("WS error:", e));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 pingIT signaling server running on", PORT);
});
