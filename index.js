// Allow Enter key to join room
document.getElementById("roomCode").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

function createRoom() {
  // Generate random room code
  const roomCode = Math.random().toString(36).substring(2, 9);
  window.location.href = `/call.html?room=${roomCode}`;
}

function joinRoom() {
  const roomCode = document.getElementById("roomCode").value.trim();
  const errorEl = document.getElementById("error");

  if (!roomCode) {
    errorEl.textContent = "Please enter a room code";
    errorEl.classList.add("show");
    return;
  }

  // Validate room code (alphanumeric only)
  if (!/^[a-zA-Z0-9]+$/.test(roomCode)) {
    errorEl.textContent = "Room code can only contain letters and numbers";
    errorEl.classList.add("show");
    return;
  }

  errorEl.classList.remove("show");
  window.location.href = `/call.html?room=${roomCode}`;
}
