// Allow Enter key to join room
document.getElementById("roomCode").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

function createRoom() {
  // Generate random room code
  const roomCode = Math.random().toString(36).substring(2, 9);
  sessionStorage.setItem("isCreator", roomCode);
  window.location.href = `/call.html?room=${roomCode}`;
}
async function joinRoom() {
  const roomCode = document
    .getElementById("roomCode")
    .value.trim()
    .toLowerCase();
  const errorEl = document.getElementById("error");
  const joinBtn = document.querySelector('button[onclick="joinRoom()"]');

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

  // ✨ NEW: Check if room exists BEFORE navigating

  // Show loading state
  joinBtn.textContent = "Checking...";
  joinBtn.disabled = true;
  errorEl.classList.remove("show");

  try {
    // Ask the server: "Does this room exist?"
    // fetch() is like making a phone call to the server
    const response = await fetch(`/api/check-room?roomId=${roomCode}`);

    // Get the answer (convert response to JSON)
    const data = await response.json();

    // Check the answer
    if (data.exists) {
      // Room exists! Safe to navigate
      window.location.href = `/call.html?room=${roomCode}`;
    } else {
      // Room doesn't exist - show error
      errorEl.textContent = "Room does not exist. Please check the code.";
      errorEl.classList.add("show");

      // Reset button
      joinBtn.textContent = "Join";
      joinBtn.disabled = false;
    }
  } catch (error) {
    // If something goes wrong with the request
    errorEl.textContent = "Connection error. Please try again.";
    errorEl.classList.add("show");

    // Reset button
    joinBtn.textContent = "Join";
    joinBtn.disabled = false;
  }
}
