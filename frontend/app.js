console.log("🔥 pingIT app.js loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc = null;
let channel = null;
let file = null;
let roomId = "";
let isSender = false;

// ---- UI Elements ----
const fileInput = document.getElementById("fileInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomBox = document.getElementById("roomBox");
const roomIdSpan = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const progress = document.getElementById("progress");
const status = document.getElementById("status");

function log(msg) {
  console.log(msg);
  status.textContent = msg;
}

// ---- Helpers ----
function genRoomId(len = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ---- WebSocket ----
ws.onopen = () => {
  log("✅ Connected to signaling server");
  createBtn.disabled = false;
  joinBtn.disabled = false;
};

ws.onerror = (e) => console.error("WS error", e);
ws.onclose = () => log("ℹ️ Signaling connection closed");

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  console.log("📨 WS:", data);

  // ignore other rooms
  if (data.roomId !== roomId) return;

  // Sender: receiver joined
  if (data.type === "join" && isSender) {
    log("📥 Receiver joined. Creating offer...");
    await makeOffer();
  }

  // Receiver: got offer
  if (data.type === "offer" && !isSender) {
    log("📨 Offer received");
    await createPeer();
    await pc.setRemoteDescription(data.offer);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    ws.send(JSON.stringify({ type: "answer", answer, roomId }));
  }

  // Sender: got answer
  if (data.type === "answer" && isSender) {
    log("📨 Answer received");
    await pc.setRemoteDescription(data.answer);
  }

  // ICE exchange
  if (data.type === "ice" && pc) {
    await pc.addIceCandidate(data.candidate);
  }
};

// ---- WebRTC ----
async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        candidate: e.candidate,
        roomId
      }));
    }
  };

  pc.ondatachannel = (e) => {
    channel = e.channel;
    log("📡 Data channel received");
    setupReceiver();
  };

  pc.onconnectionstatechange = () => {
    log("🔗 Connection: " + pc.connectionState);
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    log("🚀 Data channel open. Sending file...");
    sendFile();
  };

  channel.onclose = () => log("📴 Data channel closed");
  channel.onerror = (e) => console.error("Channel error", e);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---- UI Actions ----
createBtn.onclick = async () => {
  log("🟡 Create clicked");

  file = fileInput.files[0];
  if (!file) return alert("Select a file first!");

  isSender = true;
  roomId = genRoomId();

  roomIdSpan.textContent = roomId;
  roomBox.classList.remove("hidden");

  await createPeer();

  // sender also joins room
  ws.send(JSON.stringify({ type: "join", roomId }));

  log("🟢 Room created. Waiting for receiver...");
};

joinBtn.onclick = () => {
  log("🟡 Join clicked");

  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Enter Room ID");

  ws.send(JSON.stringify({ type: "join", roomId }));
  log("📤 Join request sent...");
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(roomIdSpan.textContent);
  alert("Room ID copied!");
};

// ---- Send File ----
function sendFile() {
  const CHUNK = 64 * 1024;
  let offset = 0;
  const reader = new FileReader();

  reader.onload = (e) => {
    channel.send(e.target.result);
    offset += e.target.result.byteLength;
    progress.value = (offset / file.size) * 100;

    if (offset < file.size) {
      readSlice(offset);
    } else {
      channel.close();
      log("✅ File sent!");
    }
  };

  const readSlice = (o) => {
    const slice = file.slice(o, o + CHUNK);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}

// ---- Receive File ----
function setupReceiver() {
  let buffers = [];

  channel.onmessage = (e) => buffers.push(e.data);

  channel.onclose = () => {
    const blob = new Blob(buffers);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "received_file";
    a.click();
    log("✅ File received!");
  };
}
