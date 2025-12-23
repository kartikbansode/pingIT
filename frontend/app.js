const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc;
let channel;
let file;
let roomId;
let isSender = false;

const fileInput = document.getElementById("fileInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomDisplay = document.getElementById("roomDisplay");
const progress = document.getElementById("progress");
const status = document.getElementById("status");

const CHUNK = 64 * 1024;

// 🔹 Utils
function genRoomId(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function log(msg) {
  console.log(msg);
  status.textContent = msg;
}

// 🔹 WebSocket
ws.onopen = () => log("✅ Connected to signaling server");
ws.onerror = e => log("❌ WebSocket error");
ws.onclose = () => log("❌ WebSocket closed");

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "join" && isSender) {
    log("📥 Receiver joined. Creating offer...");
    await makeOffer();
  }

  if (data.type === "offer" && !isSender) {
    log("📨 Offer received");
    await createPeer();
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer, roomId }));
  }

  if (data.type === "answer" && isSender) {
    log("📨 Answer received");
    await pc.setRemoteDescription(data.answer);
  }

  if (data.type === "ice") {
    if (pc) await pc.addIceCandidate(data.candidate);
  }
};

// 🔹 Peer
async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = e => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate, roomId }));
    }
  };

  pc.ondatachannel = e => {
    channel = e.channel;
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    log("🚀 Data channel open. Sending file...");
    sendFile();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// 🔹 UI Actions
createBtn.onclick = async () => {
  if (ws.readyState !== WebSocket.OPEN) {
    alert("WebSocket not connected yet.");
    return;
  }

  file = fileInput.files[0];
  if (!file) return alert("Select a file first!");

  isSender = true;
  roomId = genRoomId();
  roomDisplay.textContent = `Room ID: ${roomId}`;

  await createPeer();
  log("🟢 Room created. Share Room ID.");
};

joinBtn.onclick = () => {
  if (ws.readyState !== WebSocket.OPEN) {
    alert("WebSocket not connected yet.");
    return;
  }

  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Enter Room ID");

  ws.send(JSON.stringify({ type: "join", roomId }));
  log("📤 Join request sent...");
};

// 🔹 Send
function sendFile() {
  let offset = 0;
  const reader = new FileReader();

  reader.onload = e => {
    channel.send(e.target.result);
    offset += e.target.result.byteLength;
    progress.value = (offset / file.size) * 100;

    if (offset < file.size) readSlice(offset);
    else {
      channel.close();
      log("✅ File sent!");
    }
  };

  const readSlice = o => {
    const slice = file.slice(o, o + CHUNK);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}

// 🔹 Receive
function setupReceiver() {
  let buffers = [];
  let size = 0;

  channel.onmessage = e => {
    buffers.push(e.data);
    size += e.data.byteLength;
    progress.value += 0.5;
  };

  channel.onclose = () => {
    const blob = new Blob(buffers);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "received_file";
    a.click();
    log("✅ File received!");
  };
}
