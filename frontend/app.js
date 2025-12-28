console.log("pingIT loaded");

const CONFIG = window.PINGIT_CONFIG || {};
const WS_URL = CONFIG.WS_URL || "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;
let recvFiles = [];

let totalSendBytes = 0;
let sentBytes = 0;
let totalRecvBytes = 0;
let recvBytes = 0;

// Detect pages
const isSendPage = document.getElementById("fileInput") !== null;
const isRecvPage = document.querySelector(".otp") !== null;

// Common
const status = document.getElementById("status");

// Send UI
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const dropZone = document.getElementById("dropZone");
const sendList = document.getElementById("sendList");
const sendSummary = document.getElementById("sendSummary");
const sendTableWrap = document.getElementById("sendTableWrap");
const createBtn = document.getElementById("createBtn");
const roomBox = document.getElementById("roomBox");
const roomIdSpan = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const overallSendWrap = document.getElementById("overallSendWrap");
const overallSendBar = document.getElementById("overallSendBar");

// Receive UI
const otpInputs = document.querySelectorAll(".otp");
const joinBtn = document.getElementById("joinBtn");
const recvList = document.getElementById("recvList");
const recvSummary = document.getElementById("recvSummary");
const recvTableWrap = document.getElementById("recvTableWrap");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const overallRecvWrap = document.getElementById("overallRecvWrap");
const overallRecvBar = document.getElementById("overallRecvBar");

function log(m) {
  console.log(m);
  if (status) status.textContent = m;
}

ws.onopen = () => {
  log("Connected to server");
  if (createBtn) createBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;
};

ws.onerror = () => log("WebSocket error");
ws.onclose = () => log("WebSocket closed");

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// ---------- SEND PAGE ----------
if (isSendPage) {
  function openPicker() {
    fileInput.value = "";
    fileInput.click();
  }

  browseBtn.onclick = (e) => {
    e.stopPropagation();
    openPicker();
  };
  dropZone.onclick = () => openPicker();

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
    sendList.innerHTML = "";
    sendTableWrap.classList.remove("hidden");
    sendSummary.classList.remove("hidden");

    totalSendBytes = 0;
    sentBytes = 0;
    filesToSend.forEach(f => totalSendBytes += f.size);

    sendSummary.textContent = `${filesToSend.length} files • ${(totalSendBytes / 1024 / 1024).toFixed(1)} MB`;

    filesToSend.forEach((f) => {
      const tr = document.createElement("tr");
      tr.id = `send-${f.name}`;
      tr.innerHTML = `
        <td><i class="fa-solid fa-file"></i> ${f.name}</td>
        <td>${(f.size / 1024 / 1024).toFixed(1)} MB</td>
        <td><div class="file-bar"><span></span></div></td>
      `;
      sendList.appendChild(tr);
    });
  }

  createBtn.onclick = async () => {
    if (filesToSend.length === 0) return alert("Select files first");

    isSender = true;
    roomId = genRoomId();
    roomIdSpan.textContent = roomId;
    roomBox.classList.remove("hidden");
    overallSendWrap.classList.remove("hidden");

    const url = `${location.origin}${location.pathname.replace("send.html","receive.html")}?room=${roomId}`;
    document.getElementById("qr").innerHTML = "";
    new QRCode(document.getElementById("qr"), url);

    await createPeer();
    ws.send(JSON.stringify({ type: "join", roomId }));
    log("Room created. Waiting for receiver...");
  };

  copyBtn.onclick = () => navigator.clipboard.writeText(roomIdSpan.textContent);
  copyLinkBtn.onclick = () => {
    const link = `${location.origin}${location.pathname.replace("send.html","receive.html")}?room=${roomIdSpan.textContent}`;
    navigator.clipboard.writeText(link);
  };
}

// ---------- RECEIVE PAGE (OTP setup remains same as before) ----------

// ---------- Signaling ----------
ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  if (data.roomId !== roomId) return;

  if (data.type === "join" && isSender) {
    log("Receiver connected. Creating offer...");
    await makeOffer();
  }

  if (data.type === "offer" && !isSender) {
    log("Offer received. Connecting...");
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

// ---------- WebRTC ----------
async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [ { urls: "stun:stun.relay.metered.ca:80", }, { urls: "turn:global.relay.metered.ca:80", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D", }, { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D", }, { urls: "turn:global.relay.metered.ca:443", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D", }, { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D", }, ],
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate, roomId }));
    }
  };

  pc.ondatachannel = (e) => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    log("Connected. Waiting for files...");
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";
  channel.onopen = () => {
    log("Connected. Starting transfer...");
    sendFiles();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---------- Send files ----------
async function sendFiles() {
  for (const file of filesToSend) {
    log(`Sending: ${file.name}`);
    channel.send(JSON.stringify({ meta: true, name: file.name, size: file.size }));
    await sendOneFile(file);
  }
  channel.send(JSON.stringify({ done: true }));
  log("All files sent");
}

function sendOneFile(file) {
  return new Promise((resolve) => {
    const CHUNK = 32 * 1024;
    let offset = 0;
    const reader = new FileReader();

    const HIGH = 8 * 1024 * 1024;
    channel.bufferedAmountLowThreshold = 2 * 1024 * 1024;

    function readSlice(o) {
      reader.readAsArrayBuffer(file.slice(o, o + CHUNK));
    }

    reader.onload = (e) => {
      const sendChunk = () => {
        channel.send(e.target.result);
        offset += e.target.result.byteLength;
        sentBytes += e.target.result.byteLength;

        const pct = (offset / file.size) * 100;
        const bar = document.querySelector(`#send-${CSS.escape(file.name)} .file-bar span`);
        if (bar) bar.style.width = pct + "%";

        const overallPct = (sentBytes / totalSendBytes) * 100;
        if (overallSendBar) overallSendBar.style.width = overallPct + "%";

        if (offset < file.size) readSlice(offset);
        else resolve();
      };

      if (channel.bufferedAmount > HIGH) {
        channel.onbufferedamountlow = () => {
          channel.onbufferedamountlow = null;
          sendChunk();
        };
      } else sendChunk();
    };

    readSlice(0);
  });
}

// ---------- Receive files ----------
function setupReceiver() {
  let currentFile = null;
  let buffers = [];
  let received = 0;
  let currentRow = null;

  channel.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);

      if (msg.meta) {
        currentFile = msg;
        buffers = [];
        received = 0;

        log(`Receiving: ${msg.name}`);
        recvTableWrap.classList.remove("hidden");
        recvSummary.classList.remove("hidden");
        overallRecvWrap.classList.remove("hidden");

        totalRecvBytes += msg.size;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><i class="fa-solid fa-file"></i> ${msg.name}</td>
          <td>${(msg.size / 1024 / 1024).toFixed(1)} MB</td>
          <td><div class="file-bar"><span></span></div></td>
        `;
        recvList.appendChild(tr);
        currentRow = tr;
        return;
      }

      if (msg.done) {
        log("All files received");
        recvSummary.textContent = `${recvFiles.length} files received`;
        return;
      }
      return;
    }

    buffers.push(e.data);
    received += e.data.byteLength;
    recvBytes += e.data.byteLength;

    if (currentFile && currentRow) {
      const pct = (received / currentFile.size) * 100;
      const bar = currentRow.querySelector(".file-bar span");
      if (bar) bar.style.width = pct + "%";

      const overallPct = (recvBytes / totalRecvBytes) * 100;
      if (overallRecvBar) overallRecvBar.style.width = overallPct + "%";
    }

    if (currentFile && received >= currentFile.size) {
      const blob = new Blob(buffers);
      const url = URL.createObjectURL(blob);

      recvFiles.push({ name: currentFile.name, blob });

      const a = document.createElement("a");
      a.href = url;
      a.download = currentFile.name;
      a.innerHTML = `<i class="fa-solid fa-download"></i> Download`;

      currentRow.children[2].innerHTML = "";
      currentRow.children[2].appendChild(a);

      recvSummary.textContent = `${recvFiles.length} files received`;
      downloadAllBtn.classList.remove("hidden");

      currentFile = null;
      currentRow = null;
    }
  };
}
