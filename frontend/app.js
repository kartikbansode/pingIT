console.log("🔥 pingIT app.js loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;

let recvFiles = [];

// UI
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const dropZone = document.getElementById("dropZone");
const sendList = document.getElementById("sendList");
const recvList = document.getElementById("recvList");
const sendSummary = document.getElementById("sendSummary");
const recvSummary = document.getElementById("recvSummary");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomBox = document.getElementById("roomBox");
const roomIdSpan = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const status = document.getElementById("status");

function log(m) {
  console.log(m);
  status.textContent = m;
}

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// --------- Drag & Browse ----------
browseBtn.onclick = () => fileInput.click();
dropZone.onclick = () => fileInput.click();

dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add("drag"); };
dropZone.ondragleave = () => dropZone.classList.remove("drag");
dropZone.ondrop = e => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  handleFiles(e.dataTransfer.files);
};
fileInput.onchange = () => handleFiles(fileInput.files);

function handleFiles(list) {
  filesToSend = Array.from(list);
  sendList.innerHTML = "";

  let total = 0;
  filesToSend.forEach(f => total += f.size);
  sendSummary.textContent = `${filesToSend.length} files • ${(total/1024/1024).toFixed(1)} MB`;

  filesToSend.forEach(f => {
    const tr = document.createElement("tr");
    tr.id = `send-${f.name}`;
    tr.innerHTML = `
      <td>${f.name}</td>
      <td>${(f.size/1024/1024).toFixed(1)} MB</td>
      <td><div class="progress"><span></span></div></td>
    `;
    sendList.appendChild(tr);
  });
}

// ---------- WebSocket ----------
ws.onopen = () => {
  log("✅ Connected");
  createBtn.disabled = false;
  joinBtn.disabled = false;
};

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  if (data.roomId !== roomId) return;

  if (data.type === "join" && isSender) {
    log("📥 Receiver joined");
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

  if (data.type === "ice" && pc) {
    await pc.addIceCandidate(data.candidate);
  }
};

// ---------- WebRTC ----------
async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "3925f5a71308b78d75a1f5fd",
        credential: "kWUIj7VlrSk9/9+D",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "3925f5a71308b78d75a1f5fd",
        credential: "kWUIj7VlrSk9/9+D",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "3925f5a71308b78d75a1f5fd",
        credential: "kWUIj7VlrSk9/9+D",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "3925f5a71308b78d75a1f5fd",
        credential: "kWUIj7VlrSk9/9+D",
      },
  ]
  });

  pc.onicecandidate = e => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate, roomId }));
    }
  };

  pc.ondatachannel = e => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    log("📡 Channel ready");
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";
  channel.onopen = () => sendFiles();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---------- Buttons ----------
createBtn.onclick = async () => {
  if (filesToSend.length === 0) return alert("Select files first");

  isSender = true;
  roomId = genRoomId();
  roomIdSpan.textContent = roomId;
  roomBox.classList.remove("hidden");

  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  document.getElementById("qr").innerHTML = "";
  new QRCode(document.getElementById("qr"), url);

  await createPeer();
  ws.send(JSON.stringify({ type: "join", roomId }));
  log("🟢 Room created");
};

joinBtn.onclick = () => {
  roomId = document.getElementById("roomInput").value.trim().toUpperCase();
  if (!roomId) return alert("Enter room code");
  ws.send(JSON.stringify({ type: "join", roomId }));
  log("📤 Joining room...");
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(roomIdSpan.textContent);
  alert("Room code copied!");
};

// ---------- Auto join from QR ----------
const params = new URLSearchParams(location.search);
if (params.get("room")) {
  document.getElementById("roomInput").value = params.get("room").toUpperCase();
  setTimeout(() => joinBtn.click(), 800);
}

// ---------- Send ----------
async function sendFiles() {
  for (const file of filesToSend) {
    channel.send(JSON.stringify({ meta: true, name: file.name, size: file.size }));
    await sendOneFile(file);
  }
  channel.send(JSON.stringify({ done: true }));
  log("✅ Files sent");
}

function sendOneFile(file) {
  return new Promise(resolve => {
    const CHUNK = 64 * 1024;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = e => {
      channel.send(e.target.result);
      offset += e.target.result.byteLength;
      const pct = (offset / file.size) * 100;
      document.querySelector(`#send-${CSS.escape(file.name)} span`).style.width = pct + "%";
      if (offset < file.size) readSlice(offset);
      else resolve();
    };

    const readSlice = o => reader.readAsArrayBuffer(file.slice(o, o + CHUNK));
    readSlice(0);
  });
}

// ---------- Receive ----------
function setupReceiver() {
  let currentFile = null;
  let buffers = [];
  let received = 0;

  channel.onmessage = e => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);
      if (msg.meta) {
        currentFile = msg;
        buffers = [];
        received = 0;
        log(`📥 Receiving ${msg.name}`);
      }
      return;
    }

    buffers.push(e.data);
    received += e.data.byteLength;

    if (currentFile && received >= currentFile.size) {
      const blob = new Blob(buffers);
      const url = URL.createObjectURL(blob);
      recvFiles.push({ name: currentFile.name, blob });

      const tr = document.createElement("tr");
      const a = document.createElement("a");
      a.href = url;
      a.download = currentFile.name;
      a.textContent = "Download";

      tr.innerHTML = `
        <td>${currentFile.name}</td>
        <td>${(currentFile.size/1024/1024).toFixed(1)} MB</td>
        <td></td>
      `;
      tr.children[2].appendChild(a);
      recvList.appendChild(tr);

      recvSummary.textContent = `${recvFiles.length} files received`;
      downloadAllBtn.classList.remove("hidden");

      currentFile = null;
    }
  };
}

// ---------- Download All ----------
downloadAllBtn.onclick = async () => {
  const zip = new JSZip();
  recvFiles.forEach(f => zip.file(f.name, f.blob));
  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pingIT-files.zip";
  a.click();
};
