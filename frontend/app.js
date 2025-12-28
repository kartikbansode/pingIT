console.log("pingIT loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;
let recvFiles = [];

let totalBytes = 0;
let transferred = 0;
let startTime = 0;

// Detect page
const isSendPage = document.getElementById("fileInput") !== null;
const isRecvPage = document.querySelector(".otp") !== null;

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

// Receive UI
const otpInputs = document.querySelectorAll(".otp");
const joinBtn = document.getElementById("joinBtn");
const recvList = document.getElementById("recvList");
const recvSummary = document.getElementById("recvSummary");
const recvTableWrap = document.getElementById("recvTableWrap");
const downloadAllBtn = document.getElementById("downloadAllBtn");

const overallBox = document.getElementById("overallBox");
const overallPct = document.getElementById("overallPct");
const speedInfo = document.getElementById("speedInfo");

function log(m) {
  console.log(m);
  if (status) status.textContent = m;
}

ws.onopen = () => {
  log("Connected");
  if (createBtn) createBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;
};

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

// ---------- SEND ----------
if (isSendPage) {
  function openPicker() {
    fileInput.value = "";
    fileInput.click();
  }

  browseBtn.onclick = (e) => { e.stopPropagation(); openPicker(); };
  dropZone.onclick = () => openPicker();
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add("drag"); };
  dropZone.ondragleave = () => dropZone.classList.remove("drag");
  dropZone.ondrop = (e) => {
    e.preventDefault(); dropZone.classList.remove("drag");
    handleFiles(e.dataTransfer.files);
  };
  fileInput.onchange = () => handleFiles(fileInput.files);

  function handleFiles(list) {
    filesToSend = Array.from(list);
    sendList.innerHTML = "";
    sendTableWrap.classList.remove("hidden");
    sendSummary.classList.remove("hidden");
    overallBox.classList.remove("hidden");

    totalBytes = 0;
    transferred = 0;
    startTime = Date.now();

    filesToSend.forEach(f => totalBytes += f.size);
    sendSummary.textContent = `${filesToSend.length} files • ${(totalBytes/1024/1024).toFixed(1)} MB`;

    filesToSend.forEach(f => {
      const tr = document.createElement("tr");
      tr.id = `send-${f.name}`;
      tr.innerHTML = `
        <td>${f.name}</td>
        <td>${(f.size/1024/1024).toFixed(1)} MB</td>
        <td class="pct">0%</td>
      `;
      sendList.appendChild(tr);
    });
  }

  createBtn.onclick = async () => {
    if (!filesToSend.length) return alert("Select files first");
    isSender = true;
    roomId = genRoomId();
    roomIdSpan.textContent = roomId;
    roomBox.classList.remove("hidden");

    const url = `${location.origin}${location.pathname.replace("send.html","receive.html")}?room=${roomId}`;
    document.getElementById("qr").innerHTML = "";
    new QRCode(document.getElementById("qr"), url);

    await createPeer();
    ws.send(JSON.stringify({ type: "join", roomId }));
    log("Waiting for receiver...");
  };

  copyBtn.onclick = () => navigator.clipboard.writeText(roomIdSpan.textContent);
  copyLinkBtn.onclick = () => navigator.clipboard.writeText(
    `${location.origin}${location.pathname.replace("send.html","receive.html")}?room=${roomIdSpan.textContent}`
  );
}

// ---------- RECEIVE ----------
if (isRecvPage) {
  const getCode = () => Array.from(otpInputs).map(i=>i.value).join("").toUpperCase();

  joinBtn.onclick = () => {
    roomId = getCode();
    if (roomId.length !== otpInputs.length) return;
    ws.send(JSON.stringify({ type: "join", roomId }));
    log("Joining...");
  };
}

// ---------- Signaling ----------
ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  if (data.roomId !== roomId) return;

  if (data.type === "join" && isSender) await makeOffer();

  if (data.type === "offer" && !isSender) {
    await createPeer();
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer, roomId }));
  }

  if (data.type === "answer" && isSender) await pc.setRemoteDescription(data.answer);
  if (data.type === "ice" && pc) await pc.addIceCandidate(data.candidate);
};

// ---------- WebRTC ----------
async function createPeer() {
  pc = new RTCPeerConnection({
    ceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D" },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D" },
      { urls: "turn:global.relay.metered.ca:443", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D" },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "3925f5a71308b78d75a1f5fd", credential: "kWUIj7VlrSk9/9+D" },
    ],
  });

  pc.onicecandidate = e => e.candidate && ws.send(JSON.stringify({ type:"ice", candidate:e.candidate, roomId }));

  pc.ondatachannel = e => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";
  channel.onopen = () => sendFiles();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type:"offer", offer, roomId }));
}

// ---------- Send ----------
async function sendFiles() {
  startTime = Date.now();
  for (const f of filesToSend) {
    channel.send(JSON.stringify({ meta:true, name:f.name, size:f.size }));
    await sendOneFile(f);
  }
  channel.send(JSON.stringify({ done:true }));
  log("All files sent");
}

function updateOverall() {
  const pct = (transferred / totalBytes) * 100;
  overallPct.textContent = `${pct.toFixed(0)}%`;

  const secs = (Date.now() - startTime)/1000;
  const speed = transferred / secs;
  const eta = speed ? (totalBytes - transferred)/speed : 0;

  speedInfo.textContent =
    `${(speed/1024/1024).toFixed(2)} MB/s • ETA: ${Math.max(0,eta).toFixed(1)}s`;
}

function sendOneFile(file) {
  return new Promise(resolve => {
    const CHUNK = 32*1024;
    let offset = 0;
    const reader = new FileReader();

    reader.onload = e => {
      channel.send(e.target.result);
      offset += e.target.result.byteLength;
      transferred += e.target.result.byteLength;

      const pct = (offset/file.size)*100;
      const cell = document.querySelector(`#send-${CSS.escape(file.name)} .pct`);
      if (cell) cell.textContent = `${pct.toFixed(0)}%`;

      updateOverall();

      if (offset < file.size) reader.readAsArrayBuffer(file.slice(offset, offset+CHUNK));
      else {
        cell.innerHTML = `<span class="done"><i class="fa-solid fa-check"></i> Done</span>`;
        resolve();
      }
    };

    reader.readAsArrayBuffer(file.slice(0, CHUNK));
  });
}

// ---------- Receive ----------
function setupReceiver() {
  let currentFile = null, buffers=[], received=0, row=null;
  totalBytes = 0;
  transferred = 0;
  startTime = Date.now();

  channel.onmessage = e => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);

      if (msg.meta) {
        currentFile = msg;
        buffers = [];
        received = 0;
        totalBytes += msg.size;

        overallBox.classList.remove("hidden");
        recvTableWrap.classList.remove("hidden");
        recvSummary.classList.remove("hidden");

        row = document.createElement("tr");
        row.innerHTML = `
          <td>${msg.name}</td>
          <td>${(msg.size/1024/1024).toFixed(1)} MB</td>
          <td class="pct">0%</td>
        `;
        recvList.appendChild(row);
        return;
      }

      if (msg.done) {
        log("All files received");
        return;
      }
      return;
    }

    buffers.push(e.data);
    received += e.data.byteLength;
    transferred += e.data.byteLength;

    const pct = (received/currentFile.size)*100;
    row.querySelector(".pct").textContent = `${pct.toFixed(0)}%`;
    updateOverall();

    if (received >= currentFile.size) {
      const blob = new Blob(buffers);
      const url = URL.createObjectURL(blob);
      recvFiles.push({ name: currentFile.name, blob });

      row.querySelector(".pct").innerHTML =
        `<a href="${url}" download="${currentFile.name}" class="done">
           <i class="fa-solid fa-check"></i> Download
         </a>`;

      recvSummary.textContent = `${recvFiles.length} files received`;
      downloadAllBtn.classList.remove("hidden");

      currentFile = null;
    }
  };
}
