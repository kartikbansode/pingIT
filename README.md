# pingIT

pingIT is a lightweight peer-to-peer file sharing web application built using WebRTC.  
It allows users to transfer files directly between devices without uploading them to a server.

This is a personal project created for learning and demonstration purposes.

---

## Version

**v1.0**

---

## Features

- Peer-to-peer file transfer using WebRTC
- No file storage on any server
- Share large files (limited only by browser and network)
- Room code based connection
- QR code for quick connection on mobile
- Drag and drop file selection
- Live per-file progress on sender and receiver
- OTP-style room code input for receivers
- Download individual files or all as ZIP
- Responsive UI for desktop and mobile
- Modern UI with Font Awesome icons

---

## How It Works

pingIT uses:
- **WebRTC DataChannels** for direct file transfer between peers
- **WebSocket signaling server** only to exchange connection data
- Files are never stored or passed through the server

Once connected, data flows directly from sender to receiver.

---

## Tech Stack

- HTML, CSS, JavaScript
- WebRTC
- WebSocket (for signaling)
- Font Awesome
- QRCode.js
- JSZip
- Hosted frontend on GitHub Pages
- Signaling server on Render

---

## Usage

1. Open pingIT in your browser.
2. Click **Send Files** to select files and create a room.
3. Share the room code or QR code with the receiver.
4. Receiver opens pingIT, clicks **Receive Files**, and enters the code.
5. Files transfer directly between devices.

---

## Project Structure

```text
frontend/
  index.html
  send.html
  receive.html
  terms.html
  style.css
  app.js
README.md
