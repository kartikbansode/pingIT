const ws = new WebSocket("wss://https://pingit-xyf7.onrender.com");

let pc;
let dataChannel;
let file;
let roomId;

const fileInput = document.getElementById("fileInput");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomLink = document.getElementById("roomLink");
const progress = document.getElementById("progress");

const CHUNK_SIZE = 64 * 1024;

ws.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);

  if (data.offer) {
    await createPeer();
    await pc.setRemoteDescription(data.offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ answer, roomId }));
  }

  if (data.answer) {
    await pc.setRemoteDescription(data.answer);
  }

  if (data.candidate) {
    await pc.addIceCandidate(data.candidate);
  }
};

async function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ candidate: e.candidate, roomId }));
    }
  };

  pc.ondatachannel = (e) => {
    dataChannel = e.channel;
    receiveFile();
  };
}

createRoomBtn.onclick = async () => {
  roomId = Math.random().toString(36).substring(2, 8);
  roomLink.textContent = `Room ID: ${roomId}`;
  file = fileInput.files[0];

  await createPeer();
  dataChannel = pc.createDataChannel("file");
  dataChannel.binaryType = "arraybuffer";

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ offer, roomId }));
};

joinRoomBtn.onclick = async () => {
  roomId = document.getElementById("roomInput").value;
  ws.send(JSON.stringify({ join: true, roomId }));
};

function sendFile() {
  let offset = 0;
  const reader = new FileReader();

  reader.onload = (e) => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    progress.value = (offset / file.size) * 100;

    if (offset < file.size) {
      readSlice(offset);
    }
  };

  const readSlice = o => {
    const slice = file.slice(o, o + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}

function receiveFile() {
  let received = [];
  let size = 0;

  dataChannel.onmessage = (e) => {
    received.push(e.data);
    size += e.data.byteLength;

    progress.value += 1;

    if (progress.value >= 100) {
      const blob = new Blob(received);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "received_file";
      a.click();
    }
  };
}

setInterval(() => {
  if (dataChannel && dataChannel.readyState === "open" && file) {
    sendFile();
  }
}, 2000);
