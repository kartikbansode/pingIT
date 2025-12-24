console.log("pingIT loaded");

const WS_URL = "wss://pingit-xyf7.onrender.com";
const ws = new WebSocket(WS_URL);

let pc, channel;
let filesToSend = [];
let roomId = "";
let isSender = false;
let recvFiles = [];

// Detect page
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

// Receive UI (OTP)
const otpInputs = document.querySelectorAll(".otp");
const joinBtn = document.getElementById("joinBtn");
const recvList = document.getElementById("recvList");
const recvSummary = document.getElementById("recvSummary");
const recvTableWrap = document.getElementById("recvTableWrap");
const downloadAllBtn = document.getElementById("downloadAllBtn");

function log(m) {
  console.log(m);
  if (status) status.textContent = m;
}

// Enable buttons when WS connects
ws.onopen = () => {
  log("Connected to server");
  if (createBtn) createBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;

  if (pendingJoinCode) {
    roomId = pendingJoinCode;
    ws.send(JSON.stringify({ type: "join", roomId }));
    log("Joining room...");
    pendingJoinCode = null;
  }
};


ws.onerror = () => log("WebSocket error");
ws.onclose = () => log("WebSocket closed");

function genRoomId(len = 6) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: len },
    () => c[Math.floor(Math.random() * c.length)]
  ).join("");
}

// ---------- SEND ----------
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

    let total = 0;
    filesToSend.forEach((f) => (total += f.size));
    sendSummary.textContent = `${filesToSend.length} files • ${(
      total /
      1024 /
      1024
    ).toFixed(1)} MB`;

    filesToSend.forEach((f) => {
      const tr = document.createElement("tr");
      tr.id = `send-${f.name}`;
      tr.innerHTML = `
        <td><i class="fa-solid fa-file"></i> ${f.name}</td>
        <td>${(f.size / 1024 / 1024).toFixed(1)} MB</td>
        <td><div class="progress"><span></span></div></td>
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

    const url = `${location.origin}${location.pathname.replace(
      "send.html",
      "receive.html"
    )}?room=${roomId}`;
    document.getElementById("qr").innerHTML = "";
    new QRCode(document.getElementById("qr"), url);

    await createPeer();
    ws.send(JSON.stringify({ type: "join", roomId }));
    log("Room created. Waiting...");
  };

  copyBtn.onclick = () => navigator.clipboard.writeText(roomIdSpan.textContent);

  copyLinkBtn.onclick = () => {
    const link = `${location.origin}${location.pathname.replace(
      "send.html",
      "receive.html"
    )}?room=${roomIdSpan.textContent}`;
    navigator.clipboard.writeText(link);
  };
}

// ---------- RECEIVE (OTP) ----------
// ---------- RECEIVE (OTP) ----------
let pendingJoinCode = null;

if (isRecvPage) {
  const otpWrap = document.getElementById("otpWrap");

  function getOTPCode() {
    let code = "";
    otpInputs.forEach((i) => (code += i.value.toUpperCase()));
    return code;
  }

  function shakeOTP() {
    otpWrap.classList.remove("shake");
    // force reflow so animation restarts every time
    void otpWrap.offsetWidth;
    otpWrap.classList.add("shake");
  }

  // Input & navigation
  otpInputs.forEach((input, idx) => {
    input.addEventListener("input", () => {
      let val = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

      // ✅ Keep only ONE character
      if (val.length > 1) val = val.slice(-1);
      input.value = val;

      if (val && idx < otpInputs.length - 1) {
        otpInputs[idx + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace") {
        if (!input.value && idx > 0) {
          otpInputs[idx - 1].focus();
        } else {
          input.value = "";
        }
      }
    });
  });

  // ✅ Paste support (Ctrl+V)
  otpWrap.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    otpInputs.forEach((inp, i) => {
      inp.value = text[i] || "";
    });

    if (text.length >= otpInputs.length) {
      joinBtn.click();
    }
  });

  function tryJoin() {
    const code = getOTPCode();

    if (code.length !== otpInputs.length) {
      shakeOTP();
      return;
    }

    roomId = code;

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "join", roomId }));
      log("Joining room...");
    } else {
      pendingJoinCode = roomId;
      log("Waiting for connection...");
    }
  }

  joinBtn.onclick = () => {
    tryJoin();
  };

  // ✅ Auto-fill from QR
  const params = new URLSearchParams(location.search);
  if (params.get("room")) {
    const code = params.get("room").toUpperCase();
    if (code.length === otpInputs.length) {
      otpInputs.forEach((inp, i) => (inp.value = code[i] || ""));
      pendingJoinCode = code;
    }
  }

  // Download all
  downloadAllBtn.onclick = async () => {
    const zip = new JSZip();
    recvFiles.forEach((f) => zip.file(f.name, f.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pingIT.zip";
    a.click();
  };
}

// ---------- WebSocket signaling ----------
ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);
  if (data.roomId !== roomId) return;

  if (data.type === "join" && isSender) {
    log("Receiver connected. Creating offer...");
    await makeOffer();
  }

  if (data.type === "offer" && !isSender) {
    log("Offer received. Connecting to sender...");

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
    ],
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", candidate: e.candidate, roomId }));
    }
  };

  pc.ondatachannel = (e) => {
    channel = e.channel;
    channel.binaryType = "arraybuffer";
    log("Connected to sender. Waiting for files...");
    setupReceiver();
  };
}

async function makeOffer() {
  channel = pc.createDataChannel("file");
  channel.binaryType = "arraybuffer";
  channel.onopen = () => {
    log("Connected to receiver. Starting transfer...");
    sendFiles();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// ---------- Send ----------
async function sendFiles() {
  for (const file of filesToSend) {
    log(`Sending: ${file.name}`);
    channel.send(
      JSON.stringify({ meta: true, name: file.name, size: file.size })
    );
    await sendOneFile(file);
  }
  channel.send(JSON.stringify({ done: true }));
  log("All files sent");
}

function sendOneFile(file) {
  return new Promise((resolve) => {
    const CHUNK = 32 * 1024; // smaller chunks = safer
    let offset = 0;
    const reader = new FileReader();

    const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8 MB buffer limit

    channel.bufferedAmountLowThreshold = 2 * 1024 * 1024; // resume at 2 MB

    function readSlice(o) {
      reader.readAsArrayBuffer(file.slice(o, o + CHUNK));
    }

    reader.onload = (e) => {
      // ✅ If buffer is full, wait
      if (channel.bufferedAmount > HIGH_WATER_MARK) {
        channel.onbufferedamountlow = () => {
          channel.onbufferedamountlow = null;
          channel.send(e.target.result);
          afterSend(e.target.result.byteLength);
        };
      } else {
        channel.send(e.target.result);
        afterSend(e.target.result.byteLength);
      }
    };

    function afterSend(sentBytes) {
      offset += sentBytes;

      const pct = (offset / file.size) * 100;
      const bar = document.querySelector(`#send-${CSS.escape(file.name)} span`);
      if (bar) bar.style.width = pct + "%";

      if (offset < file.size) readSlice(offset);
      else resolve();
    }

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
        log(`Receiving: ${msg.name}`);
        recvTableWrap.classList.remove("hidden");
        recvSummary.classList.remove("hidden");
      }

      if (msg.done) {
        log("All files received");
        recvSummary.textContent = `${recvFiles.length} files received`;
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
      a.innerHTML = `<i class="fa-solid fa-download"></i> Download`;

      tr.innerHTML = `
        <td><i class="fa-solid fa-file"></i> ${currentFile.name}</td>
        <td>${(currentFile.size / 1024 / 1024).toFixed(1)} MB</td>
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
