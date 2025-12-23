import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("pingIT signaling server running");
});

const wss = new WebSocketServer({ server });
const rooms = {};

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg);
    const room = data.roomId;
    if (!room) return;

    rooms[room] = rooms[room] || [];
    if (!rooms[room].includes(ws)) rooms[room].push(ws);

    rooms[room].forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  });

  ws.on("close", () => {
    for (const r in rooms) {
      rooms[r] = rooms[r].filter(c => c !== ws);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 pingIT signaling server running on ${PORT}`);
});
