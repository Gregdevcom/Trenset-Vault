const mainVideo = document.getElementById("main-video");
const pipVideo = document.getElementById("pip-video");
const errText = document.getElementById("err");
let localStream;
let remoteStream;
let peerConnection;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout;

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

let ws;
let isInitiator = false;
let wsReconnectTimer;
let isPageVisible = true;

// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("room");

if (!roomId) {
  window.location.href = "/";
}

// ============ VISIBILITY AND LIFECYCLE HANDLING ============
document.addEventListener("visibilitychange", async () => {
  isPageVisible = !document.hidden;
  if (isPageVisible) {
    await handlePageVisible();
  }
});

// Handle when device wakes up or page becomes visible
async function handlePageVisible() {
  // Check if local stream is still active
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    if (
      !videoTrack ||
      !videoTrack.enabled ||
      videoTrack.readyState === "ended"
    ) {
      await reinitializeMedia();
    }

    if (
      !audioTrack ||
      !audioTrack.enabled ||
      audioTrack.readyState === "ended"
    ) {
      await reinitializeMedia();
    }
  }

  // Check WebSocket connection
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log("WebSocket disconnected - reconnecting...");
    connectWebSocket();
  }

  // Check peer connection state
  if (peerConnection) {
    const state = peerConnection.connectionState;
    if (state === "failed" || state === "disconnected" || state === "closed") {
      await restartConnection();
    }
  } else if (isInitiator && ws && ws.readyState === WebSocket.OPEN) {
    // If we're the initiator but have no peer connection, check if there's someone waiting
    ws.send(JSON.stringify({ type: "check-peer" }));
  }
}

// Reinitialize media after device lock or track loss
async function reinitializeMedia() {
  try {
    // Stop old tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    errText.innerText = "Restarting camera...";

    // Get new stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    pipVideo.srcObject = localStream;
    pipVideo.muted = true;
    window.localStream = localStream;

    errText.innerText = "Camera restarted!";

    // If we have a peer connection, update tracks
    if (peerConnection && peerConnection.connectionState === "connected") {
      await updatePeerConnectionTracks();
    }
  } catch {
    errText.innerText = "Camera error - please refresh";
  }
}

// Update tracks in existing peer connection
async function updatePeerConnectionTracks() {
  if (!peerConnection) return;

  try {
    // Get all senders
    const senders = peerConnection.getSenders();

    // Replace video track
    const videoSender = senders.find(
      (s) => s.track && s.track.kind === "video"
    );
    if (videoSender) {
      const newVideoTrack = localStream.getVideoTracks()[0];
      await videoSender.replaceTrack(newVideoTrack);
    }

    // Replace audio track
    const audioSender = senders.find(
      (s) => s.track && s.track.kind === "audio"
    );
    if (audioSender) {
      const newAudioTrack = localStream.getAudioTracks()[0];
      await audioSender.replaceTrack(newAudioTrack);
    }

    errText.innerText = "Connected!";
  } catch {
    await restartConnection();
  }
}

// ============ INITIAL SETUP ============
let init = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Monitor track endings
    localStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (isPageVisible) {
          reinitializeMedia();
        }
      };
    });

    pipVideo.srcObject = localStream;
    pipVideo.muted = true;
    window.localStream = localStream;
    pipVideo.play().catch(() => {});

    errText.innerText = "Camera ready!";

    connectWebSocket();
  } catch {
    errText.innerText =
      "Camera/mic access denied. Please allow access and refresh.";
  }
};

// ============ WEBRTC CONNECTION ============
let createOffer = async () => {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(servers);
  setupPeerConnectionListeners();

  remoteStream = new MediaStream();
  mainVideo.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    const sender = peerConnection.addTrack(track, localStream);

    if (track.kind === "video") {
      const parameters = sender.getParameters();
      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }
      parameters.encodings[0].maxBitrate = 2500000;
      sender.setParameters(parameters).catch(() => {});
    }
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

  let offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  ws.send(
    JSON.stringify({
      type: "offer",
      offer: offer,
    })
  );
};

// Setup peer connection state listeners
function setupPeerConnectionListeners() {
  peerConnection.onconnectionstatechange = () => {
    switch (peerConnection.connectionState) {
      case "connected":
        errText.innerText = "Connected!";
        reconnectAttempts = 0;
        break;
      case "disconnected":
        errText.innerText = "Connection lost - reconnecting...";
        scheduleReconnect();
        break;
      case "failed":
        errText.innerText = "Connection failed - retrying...";
        scheduleReconnect();
        break;
      case "closed":
        errText.innerText = "Connection closed";
        break;
    }
  };
}

// Schedule reconnection attempt
function scheduleReconnect() {
  if (reconnectTimeout) return; // Already scheduled

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    errText.innerText = "Connection failed. Please refresh.";
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000); // Exponential backoff

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    restartConnection();
  }, delay);
}

// Restart the peer connection
async function restartConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // Notify other peer we're restarting
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "restart" }));

    // Wait a bit then create new offer if we're initiator
    setTimeout(() => {
      if (isInitiator && ws && ws.readyState === WebSocket.OPEN) {
        createOffer();
      }
    }, 1000);
  }
}

// ============ WEBSOCKET CONNECTION ============
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }

    ws.send(
      JSON.stringify({
        type: "join",
        roomId: roomId,
      })
    );
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "joined") {
      isInitiator = data.isInitiator;
      if (isInitiator) {
        errText.innerText = "Waiting for another user...";
      } else {
        errText.innerText = "Joined room, waiting for connection...";
      }
    } else if (data.type === "ready") {
      errText.innerText = "User found! Connecting...";
      if (isInitiator) {
        await createOffer();
      }
    } else if (data.type === "offer") {
      errText.innerText = "Connecting...";
      await handleOffer(data.offer);
    } else if (data.type === "answer") {
      await handleAnswer(data.answer);
    } else if (data.type === "ice-candidate") {
      await handleIceCandidate(data.candidate);
    } else if (data.type === "restart") {
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      errText.innerText = "Reconnecting...";
    } else if (data.type === "check-peer") {
      // Other peer is checking if we're still here - respond with ready if we are
      ws.send(JSON.stringify({ type: "peer-ready" }));
    } else if (data.type === "peer-ready") {
      // Peer confirmed they're ready - restart connection if needed
      if (!peerConnection || peerConnection.connectionState !== "connected") {
        if (isInitiator) {
          await createOffer();
        }
      }
    } else if (data.type === "peer-disconnected") {
      errText.innerText = "Other user disconnected.";
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
    } else if (data.type === "error") {
      errText.innerText = data.message || "An error occurred";
    }
  };

  ws.onerror = (error) => {
    errText.innerText = "Connection error...";
  };

  ws.onclose = () => {
    // Reconnect after 2 seconds
    if (!wsReconnectTimer) {
      wsReconnectTimer = setTimeout(() => {
        if (isPageVisible) {
          connectWebSocket();
        }
      }, 2000);
    }
  };
}

async function handleOffer(offer) {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(servers);
  setupPeerConnectionListeners();

  remoteStream = new MediaStream();
  mainVideo.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    const sender = peerConnection.addTrack(track, localStream);

    if (track.kind === "video") {
      const parameters = sender.getParameters();
      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }
      parameters.encodings[0].maxBitrate = 2500000;
      sender
        .setParameters(parameters)
        .catch((e) => console.error("Error setting parameters:", e));
    }
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

  await peerConnection.setRemoteDescription(offer);

  let answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(
    JSON.stringify({
      type: "answer",
      answer: answer,
    })
  );
}

async function handleAnswer(answer) {
  if (!peerConnection) {
    return;
  }
  await peerConnection.setRemoteDescription(answer);
  errText.innerText = "Connected!";
}

async function handleIceCandidate(candidate) {
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {}
  }
}

// Start the initialization
init();
