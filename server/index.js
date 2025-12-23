import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: process.env.PORT || 3000 });
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

console.log("🚀 pingIT signaling server running");
