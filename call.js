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
    btn.innerHTML = "Copied!";
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
async function toggleMute() {
  const btn = document.getElementById("muteBtn");
  if (sessionStorage.getItem("micOn") === "false") {
    sessionStorage.setItem("micOn", "true");
    isMuted = false;
    btn.innerHTML = '<i class="fa-solid fa-phone-volume"></i>';
  } else if (sessionStorage.getItem("micOn") === "true") {
    sessionStorage.setItem("micOn", "false");
    isMuted = true;
    btn.innerHTML = '<i class="fa-solid fa-phone-slash"></i>';
  }
  if (window.localStream) {
    const audioTracks = window.localStream.getAudioTracks();
    if (!isMuted && audioTracks.length === 0) {
      await reinitializeMedia();
      return;
    }
    window.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }
}

// Toggle video // change
async function toggleVideo() {
  const btn = document.getElementById("videoBtn");
  if (sessionStorage.getItem("videoOn") === "true") {
    sessionStorage.setItem("videoOn", "false");
    isVideo = false;
    btn.innerHTML =
      '<span class="material-symbols-outlined">hangout_video_off</span>';
  } else if (sessionStorage.getItem("videoOn") === "false") {
    sessionStorage.setItem("videoOn", "true");
    isVideo = true;
    btn.innerHTML =
      '<span class="material-symbols-outlined">hangout_video</span>';
  }
  if (window.localStream) {
    const videoTracks = window.localStream.getVideoTracks();
    if (isVideo && videoTracks.length === 0) {
      await reinitializeMedia();
      return;
    }
    window.localStream.getVideoTracks().forEach((track) => {
      track.enabled = isVideo;
    });
  }
}

// End call
function endCall() {
  if (confirm("End call?")) {
    window.location.href = "/";
  }
}
