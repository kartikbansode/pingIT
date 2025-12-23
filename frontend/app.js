console.log("🔥 pingIT app.js loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel, file, roomId;
let isSender = false;

const fileInput = document.getElementById("fileInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomBox = document.getElementById("roomBox");
const roomIdSpan = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const progress = document.getElementById("progress");
const status = document.getElementById("status");

if (!fileInput || !createBtn || !joinBtn || !roomBox || !roomIdSpan || !progress || !status) {
  console.error("❌ One or more UI elements not found. Check IDs in HTML.");
}

// ---------- Helpers ----------
function log(msg) {
  console.log(msg);
  status.textContent = msg;
}

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// ---------- WebSocket ----------
ws.onopen = () => {
  log("✅ Connected to server");
  createBtn.disabled = false;
  joinBtn.disabled = false;
};

ws.onerror = () => log("❌ WebSocket error");
ws.onclose = () => log("❌ WebSocket closed");

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  log(`📨 ${data.type} received`);

  if (data.type === "join" && isSender) {
    await makeOffer();
  }

  if (data.type === "offer" && !isSender) {
    await createPeer();
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer, roomId }));
  }

  if (data.type === "answer" && isSender) {
    await pc.setRemoteDescription(data.answer);
  }

  if (data.type === "ice" && pc) {
    await pc.addIceCandidate(data.candidate);
  }
};

// ---------- Peer ----------
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
    log("🚀 Channel open. Sending file...");
    sendFile();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---------- UI ----------
createBtn.onclick = async () => {
  log("🟡 Create clicked");

  file = fileInput.files[0];
  if (!file) return alert("Select a file first!");

  isSender = true;
  roomId = genRoomId();

  roomIdSpan.textContent = roomId;
  roomBox.classList.remove("hidden");

  await createPeer();
  log("🟢 Room created. Share Room ID.");
};

joinBtn.onclick = () => {
  log("🟡 Join clicked");

  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Enter Room ID");

  ws.send(JSON.stringify({ type: "join", roomId }));
  log("📤 Join request sent");
};

if (copyBtn) {
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(roomIdSpan.textContent);
    alert("Room ID copied!");
  };
}


// ---------- Send ----------
function sendFile() {
  const CHUNK = 64 * 1024;
  let offset = 0;
  const reader = new FileReader();

  reader.onload = e => {
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

  const readSlice = o => {
    const slice = file.slice(o, o + CHUNK);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}

// ---------- Receive ----------
function setupReceiver() {
  let buffers = [];

  channel.onmessage = e => buffers.push(e.data);

  channel.onclose = () => {
    const blob = new Blob(buffers);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "received_file";
    a.click();
    log("✅ File received!");
  };
}
