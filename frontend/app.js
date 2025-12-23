console.log("🔥 pingIT app.js loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;

// UI
const fileInput = document.getElementById("fileInput");
const sendList = document.getElementById("sendList");
const recvList = document.getElementById("recvList");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomBox = document.getElementById("roomBox");
const roomIdSpan = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const progress = document.getElementById("progress");
const status = document.getElementById("status");

function log(m) {
  console.log(m);
  status.textContent = m;
}

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// ---------- UI ----------
fileInput.onchange = () => {
  filesToSend = Array.from(fileInput.files);
  sendList.innerHTML = "";
  filesToSend.forEach(f => {
    const li = document.createElement("li");
    li.textContent = `${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`;
    sendList.appendChild(li);
  });
};

// ---------- WebSocket ----------
ws.onopen = () => {
  log("✅ Connected to signaling server");
  createBtn.disabled = false;
  joinBtn.disabled = false;
};

ws.onclose = () => log("ℹ️ Signaling closed");
ws.onerror = e => console.error(e);

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
      { urls: "stun:stun.l.google.com:19302" },

      // TURN fallback
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
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

  pc.oniceconnectionstatechange = () => {
    log("🧊 ICE state: " + pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    log("🔗 Conn state: " + pc.connectionState);
  };

  pc.ondatachannel = (e) => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    log("📡 Data channel received");
    setupReceiver();
  };
}


async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    log("🚀 Data channel open. Sending files...");
    sendFiles();
  };

  channel.onclose = () => log("📴 Data channel closed");
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

// ---------- File Send Protocol ----------
async function sendFiles() {
  for (const file of filesToSend) {
    // send meta
    channel.send(JSON.stringify({ meta: true, name: file.name, size: file.size }));
    await sendOneFile(file);
  }
  channel.send(JSON.stringify({ done: true }));
  log("✅ All files sent");
}

function sendOneFile(file) {
  return new Promise(resolve => {
    const CHUNK = 64 * 1024;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = e => {
      channel.send(e.target.result);
      offset += e.target.result.byteLength;
      progress.value = (offset / file.size) * 100;

      if (offset < file.size) readSlice(offset);
      else resolve();
    };

    const readSlice = o => {
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

  channel.onmessage = e => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);

      if (msg.meta) {
        currentFile = msg;
        buffers = [];
        received = 0;
        log(`📥 Receiving ${msg.name}`);
      }

      if (msg.done) {
        log("✅ All files received");
      }
      return;
    }

    buffers.push(e.data);
    received += e.data.byteLength;

    if (currentFile && received >= currentFile.size) {
      const blob = new Blob(buffers);
      const url = URL.createObjectURL(blob);

      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.download = currentFile.name;
      a.textContent = currentFile.name;

      li.appendChild(a);
      recvList.appendChild(li);

      log(`✅ Received ${currentFile.name}`);
      currentFile = null;
    }
  };
}
