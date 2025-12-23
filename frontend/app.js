const ws = new WebSocket("wss://pingit-xyf7.onrender.com");

let pc;
let dataChannel;
let file;
let roomId;
let isSender = false;

const fileInput = document.getElementById("fileInput");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomLink = document.getElementById("roomLink");
const progress = document.getElementById("progress");

const CHUNK_SIZE = 64 * 1024;

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "join" && isSender) {
    // Receiver joined → send offer
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

  if (data.type === "candidate") {
    if (pc) await pc.addIceCandidate(data.candidate);
  }
};

async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "candidate",
        candidate: e.candidate,
        roomId
      }));
    }
  };

  pc.ondatachannel = (e) => {
    dataChannel = e.channel;
    setupReceive();
  };
}

async function makeOffer() {
  dataChannel = pc.createDataChannel("file");
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    console.log("Data channel open. Sending file...");
    sendFile();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", offer, roomId }));
}

// 🔹 Sender creates room
createRoomBtn.onclick = async () => {
  file = fileInput.files[0];
  if (!file) return alert("Select a file first!");

  isSender = true;
  roomId = Math.random().toString(36).substring(2, 8);
  roomLink.textContent = `Room ID: ${roomId}`;

  await createPeer();
};

// 🔹 Receiver joins room
joinRoomBtn.onclick = () => {
  if (ws.readyState !== WebSocket.OPEN) {
    alert("WebSocket not connected yet. Wait a second and try again.");
    return;
  }

  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return alert("Enter Room ID");

  ws.send(JSON.stringify({ type: "join", roomId }));
};


// 📤 Send file in chunks
function sendFile() {
  let offset = 0;
  const reader = new FileReader();

  reader.onload = e => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    progress.value = (offset / file.size) * 100;

    if (offset < file.size) readSlice(offset);
  };

  const readSlice = o => {
    const slice = file.slice(o, o + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}

// 📥 Receive file
function setupReceive() {
  let received = [];
  let receivedSize = 0;

  dataChannel.onmessage = e => {
    received.push(e.data);
    receivedSize += e.data.byteLength;
    progress.value += 0.5;

    // naive complete detection (sender closes channel at end)
  };

  dataChannel.onclose = () => {
    const blob = new Blob(received);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "received_file";
    a.click();
  };
}
