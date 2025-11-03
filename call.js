// Wait for main.js to load, then use roomId
window.addEventListener("DOMContentLoaded", () => {
  // Use roomId from main.js (it's already declared there)
  if (typeof roomId !== "undefined" && roomId) {
    document.getElementById("roomCodeDisplay").textContent =
      roomId.toUpperCase();
  }
});

function copyRoomCode() {
  const roomCode = new URLSearchParams(window.location.search).get("room");
  navigator.clipboard.writeText(roomCode).then(() => {
    const btn = document.querySelector(".copy-btn");
    const originalText = btn.innerHTML;
    btn.innerHTML = "✓ Copied!";
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  });
}

// Swap main and PIP videos
function swapVideos() {
  const mainVideo = document.getElementById("main-video");
  const pipVideo = document.getElementById("pip-video");
  const pipLabel = document.getElementById("pip-label");

  // Swap the srcObject
  const tempStream = mainVideo.srcObject;
  mainVideo.srcObject = pipVideo.srcObject;
  pipVideo.srcObject = tempStream;

  // Swap the label and muted state
  pipLabel.textContent = pipLabel.textContent === "You" ? "Them" : "You";

  // Toggle muted - your video should always be muted
  mainVideo.muted = false;
  pipVideo.muted = pipLabel.textContent === "You";
}

// Toggle mute
let isMuted = false;
function toggleMute() {
  const btn = document.getElementById("muteBtn");
  isMuted = !isMuted;

  if (window.localStream) {
    window.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }

  btn.innerHTML = isMuted ? "🔇" : "🎤";
}

// Toggle video
let isVideoOff = false;
function toggleVideo() {
  const btn = document.getElementById("videoBtn");
  isVideoOff = !isVideoOff;

  if (window.localStream) {
    window.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
  }

  btn.innerHTML = isVideoOff ? "📷" : "📹";
}

// End call
function endCall() {
  if (confirm("End call?")) {
    window.location.href = "/";
  }
}
