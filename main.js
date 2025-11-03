const user1Vid = document.getElementById("user-1");
const user2Vid = document.getElementById("user-2");
const errText = document.getElementById("err");
let localStream;
let remoteStream;
let peerConnection;

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

// ========== NEW: WebSocket variables ==========
let ws;
// ==============================================

// Generate or get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("room") || Math.random().toString(36).substring(7);

// Update URL with room ID if not present
if (!urlParams.get("room")) {
  window.history.replaceState({}, "", `?room=${roomId}`);
}

// Display room link
document.addEventListener("DOMContentLoaded", () => {
  const shareLink = `${window.location.origin}?room=${roomId}`;
  document.getElementById(
    "roomC"
  ).innerHTML = `Share this link: <a href="${shareLink}">${shareLink}</a>`;
});

let init = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    user1Vid.srcObject = localStream;
  } catch {
    errText.innerText = "Access denied.";
  }
  // ========== NEW: Connect to WebSocket server instead of calling createOffer immediately ==========
  connectWebSocket();
  // ===============================================================================================
};

let createOffer = async () => {
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  user2Vid.srcObject = remoteStream;
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log("New ICE cand: ", event.candidate);
      // ========== NEW: Send ICE candidate to other peer via WebSocket ==========
      ws.send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        })
      );
      // =========================================================================
    }
  };

  let offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // ========== NEW: Send offer to other peer via WebSocket ==========
  ws.send(
    JSON.stringify({
      type: "offer",
      offer: offer,
    })
  );
  // ================================================================
};

// ========== NEW: WebSocket connection function ==========
function connectWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("Connected to signaling server");

    // Join a room when connected
    ws.send(
      JSON.stringify({
        type: "join",
        roomId: roomId,
      })
    );
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    // Handle different message types from server
    if (data.type === "joined") {
      // Successfully joined room
      errText.innerText = "Waiting for another user...";
    } else if (data.type === "ready") {
      // Another user joined, create offer
      errText.innerText = "User found! Connecting...";
      createOffer();
    } else if (data.type === "offer") {
      // Received offer from peer - create answer
      await handleOffer(data.offer);
    } else if (data.type === "answer") {
      // Received answer from peer
      await handleAnswer(data.answer);
    } else if (data.type === "ice-candidate") {
      // Received ICE candidate from peer
      await handleIceCandidate(data.candidate);
    } else if (data.type === "peer-disconnected") {
      errText.innerText = "Other user disconnected.";
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    errText.innerText = "Connection error. Is server running?";
  };
}
// =========================================================

// ========== NEW: Handle incoming offer ==========
async function handleOffer(offer) {
  // Create peer connection (similar to createOffer but for receiving peer)
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  user2Vid.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        })
      );
    }
  };

  // Set remote description (the offer we received)
  await peerConnection.setRemoteDescription(offer);

  // Create answer
  let answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  // Send answer back to peer
  ws.send(
    JSON.stringify({
      type: "answer",
      answer: answer,
    })
  );
}
// ================================================

// ========== NEW: Handle incoming answer ==========
async function handleAnswer(answer) {
  // Set remote description (the answer we received)
  await peerConnection.setRemoteDescription(answer);
  errText.innerText = "Connected!";
}
// =================================================

// ========== NEW: Handle incoming ICE candidate ==========
async function handleIceCandidate(candidate) {
  // Add ICE candidate to peer connection
  await peerConnection.addIceCandidate(candidate);
}
// ========================================================

init();
