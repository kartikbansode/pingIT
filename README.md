# pingIT

pingIT is a lightweight peer-to-peer file sharing web application built using WebRTC.  
It allows users to transfer files directly between devices without uploading them to a server.

This is a personal project created for learning and demonstration purposes.

---

>**Version:** 1.0
>
>**Release Date:** December 24, 2025  

---

## Features

- Peer-to-peer file transfer using WebRTC
- No file storage on any server
- Share large files (limited only by browser and network)
- Room code based connection
- QR code for quick connection on mobile
- Drag and drop file selection
- Live per-file progress on sender and receiver
- Download individual files or all as ZIP
- Responsive UI for desktop and mobile

---

## How It Works

pingIT uses:
- **WebRTC DataChannels** for direct file transfer between peers
- **WebSocket signaling server** only to exchange connection data
- Files are never stored or passed through the server

Once connected, data flows directly from sender to receiver.

---

### ⚠️Usage
**In order to use pingIT..
Paste your Credentials in respected places given below**

| File                                   | Source                                                        | Line no. to paste   |
| ---------------------------------------| ------------------------------------------------------------- | ------------------- |
| `frontend/app.js`                      | Render url from (https://render.com/)                         | 3                   |
| `frontend/app.js`                      | Turn urls and credentials from (https://www.metered.ca/)      | 295 to 315          |

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
- 
---

## Screenshots
Home page
><img width="1364" height="637" alt="image" src="https://github.com/user-attachments/assets/0591e9b6-a566-47b3-b843-4a70fe982826" />
Sender page
><img width="1363" height="633" alt="image" src="https://github.com/user-attachments/assets/8ff23fa8-ad96-49c6-b210-b2b4c94d0cc4" />
Receiver page
><img width="1365" height="639" alt="image" src="https://github.com/user-attachments/assets/f4613157-747a-41a6-a8b8-57951f27ef56" />

---

## License

MIT License © 2025 [Kartik Bansode](https://github.com/kartikbansode)

---

## Contact
- Email: bansodekartik00@gmail.com
- Github: https://github.com/kartikbansode
