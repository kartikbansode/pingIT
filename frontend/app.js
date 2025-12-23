console.log("🔥 pingIT app.js loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;

let sendStats = {};
let recvFiles = [];
let startTime = 0;

// ---- UI ----
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const dropZone = document.getElementById("dropZone");
const sendList = document.getElementById("sendList");
const recvList = document.getElementById("recvList");
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
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: len },
    () => c[Math.floor(Math.random() * c.length)]
  ).join("");
}

// ---------- Browse & Drag-Drop ----------
browseBtn.onclick = () => fileInput.click();
dropZone.onclick = () => fileInput.click();

dropZone.ondragover = (e) => {
  e.preventDefault();
  dropZone.classList.add("drag");
};
dropZone.ondragleave = () => dropZone.classList.remove("drag");
dropZone.ondrop = (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag");
  handleFiles(e.dataTransfer.files);
};

fileInput.onchange = () => handleFiles(fileInput.files);

function handleFiles(list) {
  filesToSend = Array.from(list);
  sendStats = {};
  sendList.innerHTML = "";

  filesToSend.forEach((f) => {
    sendStats[f.name] = { sent: 0, size: f.size };

    const li = document.createElement("li");
    li.id = `send-${f.name}`;
    li.innerHTML = `
      <div>${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)</div>
      <div class="progress-bar"><span></span></div>
    `;
    sendList.appendChild(li);
  });
}

// ---------- WebSocket ----------
ws.onopen = () => {
  log("✅ Connected to signaling server");
  createBtn.disabled = false;
  joinBtn.disabled = false;
};

ws.onclose = () => log("ℹ️ Signaling closed");
ws.onerror = (e) => console.error("WS error", e);

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  if (data.roomId !== roomId) return;
  console.log("📨 WS:", data);

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

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log("🧊 Local ICE:", e.candidate.candidate);
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate, roomId }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    log("🧊 ICE: " + pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    log("🔗 Conn: " + pc.connectionState);
  };

  pc.ondatachannel = (e) => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    log("📡 Data channel ready");
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    log("🚀 Channel open. Sending files...");
    startTime = Date.now();
    sendFiles();
  };

  channel.onclose = () => log("📴 Channel closed");
  channel.onerror = (e) => console.error("Channel error", e);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---------- Buttons ----------
createBtn.onclick = async () => {
  if (filesToSend.length === 0) return alert("Choose files first");

  isSender = true;
  roomId = genRoomId();
  roomIdSpan.textContent = roomId;
  roomBox.classList.remove("hidden");

  document.getElementById("qr").innerHTML = "";
  new QRCode(document.getElementById("qr"), roomId);

  await createPeer();
  ws.send(JSON.stringify({ type: "join", roomId }));
  log("🟢 Room created. Waiting for receiver...");
};

joinBtn.onclick = () => {
  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Enter Room ID");

  ws.send(JSON.stringify({ type: "join", roomId }));
  log("📤 Join request sent...");
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(roomIdSpan.textContent);
  alert("Room ID copied!");
};

// ---------- File Send ----------
async function sendFiles() {
  for (const file of filesToSend) {
    channel.send(
      JSON.stringify({ meta: true, name: file.name, size: file.size })
    );
    await sendOneFile(file);
  }
  channel.send(JSON.stringify({ done: true }));
  log("✅ All files sent");
}

function sendOneFile(file) {
  return new Promise((resolve) => {
    const CHUNK = 64 * 1024;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      channel.send(e.target.result);
      offset += e.target.result.byteLength;

      sendStats[file.name].sent = offset;
      const percent = (offset / file.size) * 100;
      document.querySelector(
        `#send-${CSS.escape(file.name)} span`
      ).style.width = percent + "%";

      const elapsed = (Date.now() - startTime) / 1000;
      const speed = offset / elapsed;
      const eta = (file.size - offset) / speed;

      status.textContent = `Sending ${file.name} • ${(
        speed /
        1024 /
        1024
      ).toFixed(2)} MB/s • ETA ${eta.toFixed(1)}s`;

      if (offset < file.size) readSlice(offset);
      else resolve();
    };

    const readSlice = (o) => {
      const slice = file.slice(o, o + CHUNK);
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  });
}

// ---------- Receive ----------
function setupReceiver() {
  let currentFile = null;
  let buffers = [];
  let received = 0;

  channel.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);

      if (msg.meta) {
        currentFile = msg;
        buffers = [];
        received = 0;
        log(`📥 Receiving ${msg.name}`);
      }

      if (msg.done) log("✅ All files received");
      return;
    }

    buffers.push(e.data);
    received += e.data.byteLength;

    if (currentFile && received >= currentFile.size) {
      const blob = new Blob(buffers);
      const url = URL.createObjectURL(blob);

      recvFiles.push({ name: currentFile.name, blob });

      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = "Download";

      btn.onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = currentFile.name;
        a.click();
      };

      li.textContent = currentFile.name + " ";
      li.appendChild(btn);
      recvList.appendChild(li);

      downloadAllBtn.classList.remove("hidden");
      log(`✅ Received ${currentFile.name}`);
      currentFile = null;
    }
  };
}

// ---------- Download All ----------
downloadAllBtn.onclick = async () => {
  const zip = new JSZip();
  recvFiles.forEach((f) => zip.file(f.name, f.blob));
  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pingIT-files.zip";
  a.click();
};
