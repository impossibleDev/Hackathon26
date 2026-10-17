(() => {
  "use strict";

  const WIDTH = 460;
  const HEIGHT = 700;
  const LEFT = 40;
  const RIGHT = 420;
  const FLOOR = 660;
  const DANGER_LINE = 170;
  const SUBSTEPS = 6;
  const GRAVITY = 1.0;
  const WALL_BOUNCE = 0.25;
  const FRUIT_BOUNCE = 0.1;
  const AIR_DRAG = 0.999;
  const NAMES = [
    "Cherry", "Strawberry", "Grape", "Orange", "Persimmon",
    "Apple", "Pear", "Peach", "Pineapple", "Melon", "Watermelon",
  ];
  const RADII = [14, 20, 27, 34, 42, 51, 61, 72, 84, 97, 112];
  const COLORS = [
    "#dc283c", "#fa5a6e", "#8c50be", "#ffa028", "#f5781e",
    "#c83232", "#bed750", "#ffb9aa", "#f0d23c", "#96dc78", "#289646",
  ];
  const MAX_LEVEL = NAMES.length - 1;
  const FIXED_FRAME_MS = 1000 / 60;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const lobbyScreen = document.getElementById("lobbyScreen");
  const competitionScreen = document.getElementById("competition");
  const lobbyMessage = document.getElementById("lobbyMessage");
  const roomPanel = document.getElementById("roomPanel");
  const createRoomButton = document.getElementById("createRoom");
  const joinRoomButton = document.getElementById("joinRoom");
  const startGameButton = document.getElementById("startGame");
  const newRoundButton = document.getElementById("newRound");
  const fruits = [];
  const rng = Math.random;
  let score = 0;
  let best = 0;
  let currentLevel;
  let nextLevel;
  let dropperX = (LEFT + RIGHT) / 2;
  let cooldown = 0;
  let overTicks = 0;
  let gameOver = false;
  let wonWatermelon = false;
  let previousFrame = 0;
  let accumulator = 0;
  let session = loadSession();
  let matchRunning = false;
  let matchRound = 0;
  let lastPostedScore = -1;
  let lastPostedDone = false;
  let pollInProgress = false;

  function makeFruit(x, y, level) {
    return { x, y, vx: 0, vy: 0, level, age: 0, dead: false };
  }

  function randomStarterLevel() {
    return Math.floor(rng() * 5);
  }

  function restart() {
    fruits.length = 0;
    score = 0;
    gameOver = false;
    wonWatermelon = false;
    overTicks = 0;
    cooldown = 20;
    currentLevel = randomStarterLevel();
    nextLevel = randomStarterLevel();
    dropperX = (LEFT + RIGHT) / 2;
    matchRunning = true;
    lastPostedScore = -1;
    lastPostedDone = false;
    canvas.focus({ preventScroll: true });
  }

  function loadSession() {
    try {
      const saved = sessionStorage.getItem("watermelon-session");
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      return null;
    }
  }

  function saveSession() {
    try {
      if (session) sessionStorage.setItem("watermelon-session", JSON.stringify(session));
      else sessionStorage.removeItem("watermelon-session");
    } catch (error) {
      lobbyMessage.textContent = "Could not save this room on your device. Keep this tab open to stay connected.";
    }
  }

  async function requestApi(path, method = "GET") {
    const response = await fetch(path, {
      method,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  function roomPath(action = "") {
    return `/api/rooms/${encodeURIComponent(session.code)}${action}?token=${encodeURIComponent(session.token)}`;
  }

  function setLobbyMessage(message, isError = false) {
    lobbyMessage.textContent = message;
    lobbyMessage.classList.toggle("is-error", isError);
  }

  function setLobbyBusy(busy) {
    createRoomButton.disabled = busy;
    joinRoomButton.disabled = busy;
    startGameButton.disabled = busy;
  }

  async function createRoom() {
    setLobbyBusy(true);
    try {
      const name = document.getElementById("playerName").value.trim() || "Player";
      session = await requestApi(`/api/rooms?name=${encodeURIComponent(name)}`, "POST");
      session.name = name;
      saveSession();
      showLobby();
      await pollRoom();
    } catch (error) {
      setLobbyMessage(error.message, true);
    } finally {
      setLobbyBusy(false);
    }
  }

  async function joinRoom() {
    const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setLobbyMessage("Enter the 6-character room code.", true);
      return;
    }
    setLobbyBusy(true);
    try {
      const name = document.getElementById("playerName").value.trim() || "Player";
      session = await requestApi(`/api/rooms/${encodeURIComponent(code)}/join?name=${encodeURIComponent(name)}`, "POST");
      session.name = name;
      saveSession();
      showLobby();
      await pollRoom();
    } catch (error) {
      setLobbyMessage(error.message, true);
    } finally {
      setLobbyBusy(false);
    }
  }

  function showLobby() {
    lobbyScreen.hidden = false;
    competitionScreen.hidden = true;
    roomPanel.hidden = !session;
    document.getElementById("lobbyForm").hidden = Boolean(session);
    if (session) {
      document.getElementById("roomCode").textContent = session.code;
      setLobbyMessage("Waiting for players to join. Share the room code.");
      document.getElementById("playerName").value = session.name || "";
    }
  }

  function renderLobby(state) {
    document.getElementById("roomCode").textContent = state.code;
    const list = document.getElementById("playerList");
    list.replaceChildren();
    for (const player of state.players) {
      const entry = document.createElement("div");
      entry.className = "player-entry";
      const name = document.createElement("span");
      name.textContent = player.name + (player.host ? " (host)" : "");
      const label = document.createElement("small");
      label.textContent = player.done ? "Ready" : "Joined";
      entry.append(name, label);
      list.append(entry);
    }
    startGameButton.hidden = state.started || !session.host;
    startGameButton.disabled = state.players.length < 2;
    setLobbyMessage(
      state.started ? "Competition is starting…" :
        state.players.length < 2 ? "Waiting for at least one more player…" :
          session.host ? "Everyone's here. Start the competition when you're ready." : "Waiting for the host to start."
    );
  }

  function renderScoreboard(state) {
    const list = document.getElementById("scoreboardPlayers");
    list.replaceChildren();
    const ranked = [...state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    ranked.forEach((player, index) => {
      const entry = document.createElement("li");
      entry.className = `score-entry${player.id === session.playerId ? " is-me" : ""}`;
      const identity = document.createElement("span");
      identity.textContent = `${index + 1}. ${player.name}${player.id === session.playerId ? " (you)" : ""}`;
      const scoreLabel = document.createElement("span");
      scoreLabel.className = "score-value";
      scoreLabel.textContent = player.done ? `${player.score} · done` : String(player.score);
      entry.append(identity, scoreLabel);
      list.append(entry);
    });
    const allDone = state.players.length > 0 && state.players.every((player) => player.done);
    const everyoneFinished = state.players.length > 1 && allDone;
    document.getElementById("matchStatus").textContent = everyoneFinished ? "Round complete" : "Competition live";
    newRoundButton.hidden = !(session.host && everyoneFinished);
  }

  async function pollRoom() {
    if (!session || pollInProgress) return;
    pollInProgress = true;
    try {
      const state = await requestApi(roomPath());
      if (session.host !== state.isHost) {
        session.host = state.isHost;
        saveSession();
      }
      if (!state.started) {
        matchRunning = false;
        renderLobby(state);
      } else {
        renderScoreboard(state);
        lobbyScreen.hidden = true;
        competitionScreen.hidden = false;
        document.getElementById("activeRoomCode").textContent = state.code;
        if (matchRound !== state.round) {
          matchRound = state.round;
          restart();
        }
        const thisPlayer = state.players.find((player) => player.id === session.playerId);
        if (thisPlayer && thisPlayer.done) {
          score = thisPlayer.score;
          gameOver = true;
          matchRunning = false;
        } else if (state.players.every((player) => player.done)) {
          matchRunning = false;
        }
      }
    } catch (error) {
      setLobbyMessage(`${error.message} You can leave and rejoin with the room code.`, true);
      if (!roomPanel.hidden) lobbyScreen.hidden = false;
    } finally {
      pollInProgress = false;
    }
  }

  async function startCompetition() {
    if (!session || !session.host) return;
    startGameButton.disabled = true;
    try {
      await requestApi(roomPath("/start"), "POST");
      await pollRoom();
    } catch (error) {
      setLobbyMessage(error.message, true);
    } finally {
      startGameButton.disabled = false;
    }
  }

  async function startNewRound() {
    if (!session || !session.host) return;
    newRoundButton.disabled = true;
    try {
      await requestApi(roomPath("/reset"), "POST");
      await pollRoom();
    } catch (error) {
      document.getElementById("matchStatus").textContent = error.message;
    } finally {
      newRoundButton.disabled = false;
    }
  }

  async function leaveRoom() {
    if (session) {
      try {
        await requestApi(roomPath("/leave"), "POST");
      } catch (error) {
        setLobbyMessage(`Could not leave the server room cleanly: ${error.message}`, true);
      }
    }
    session = null;
    matchRunning = false;
    matchRound = 0;
    saveSession();
    showLobby();
    setLobbyMessage("Create a room or join a friend's room. Up to 4 players.");
  }

  async function syncScore() {
    if (!session || matchRound === 0 || score === lastPostedScore && gameOver === lastPostedDone) return;
    lastPostedScore = score;
    lastPostedDone = gameOver;
    const params = new URLSearchParams({
      score: String(score),
      done: String(gameOver),
    });
    try {
      await requestApi(`${roomPathForScore()}&${params.toString()}`, "POST");
    } catch (error) {
      lastPostedScore = -1;
      document.getElementById("matchStatus").textContent = "Reconnecting…";
    }
  }

  function roomPathForScore() {
    return `/api/rooms/${encodeURIComponent(session.code)}/score?token=${encodeURIComponent(session.token)}`;
  }

  function clampDropper() {
    const radius = RADII[currentLevel];
    dropperX = Math.max(LEFT + radius + 2, Math.min(RIGHT - radius - 2, dropperX));
  }

  function drop() {
    if (gameOver || cooldown > 0) return;
    clampDropper();
    fruits.push(makeFruit(dropperX, DANGER_LINE - 40, currentLevel));
    currentLevel = nextLevel;
    nextLevel = randomStarterLevel();
    cooldown = 35;
  }

  function step(dt) {
    for (const fruit of fruits) {
      fruit.vy += GRAVITY * dt;
      fruit.vx *= Math.pow(AIR_DRAG, dt);
      fruit.vy *= Math.pow(AIR_DRAG, dt);
      fruit.x += fruit.vx * dt;
      fruit.y += fruit.vy * dt;
      fruit.age += 1;
    }

    for (const fruit of fruits) {
      const radius = RADII[fruit.level];
      if (fruit.x - radius < LEFT) {
        fruit.x = LEFT + radius;
        fruit.vx = Math.abs(fruit.vx) * WALL_BOUNCE;
      }
      if (fruit.x + radius > RIGHT) {
        fruit.x = RIGHT - radius;
        fruit.vx = -Math.abs(fruit.vx) * WALL_BOUNCE;
      }
      if (fruit.y + radius > FLOOR) {
        fruit.y = FLOOR - radius;
        fruit.vy = -Math.abs(fruit.vy) * WALL_BOUNCE;
        fruit.vx *= 0.97;
      }
    }

    const spawned = [];
    const count = fruits.length;
    for (let i = 0; i < count; i += 1) {
      const a = fruits[i];
      if (a.dead) continue;
      for (let j = i + 1; j < count; j += 1) {
        const b = fruits[j];
        if (b.dead) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const minDistance = RADII[a.level] + RADII[b.level];
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= minDistance * minDistance) continue;

        let distance = Math.sqrt(distanceSquared);
        if (distance < 1e-6) {
          dx = 0;
          dy = -1;
          distance = 1e-6;
        }

        if (a.level === b.level) {
          a.dead = true;
          b.dead = true;
          if (a.level === MAX_LEVEL) {
            score += 200;
            wonWatermelon = true;
          } else {
            const newLevel = a.level + 1;
            score += ((newLevel + 1) * (newLevel + 2) / 2) * 2;
            const merged = makeFruit((a.x + b.x) / 2, (a.y + b.y) / 2, newLevel);
            merged.vx = (a.vx + b.vx) / 2;
            merged.vy = (a.vy + b.vy) / 2;
            merged.age = Math.min(a.age, b.age);
            spawned.push(merged);
          }
          break;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        const massA = RADII[a.level] ** 2;
        const massB = RADII[b.level] ** 2;
        const totalMass = massA + massB;
        a.x -= nx * overlap * (massB / totalMass);
        a.y -= ny * overlap * (massB / totalMass);
        b.x += nx * overlap * (massA / totalMass);
        b.y += ny * overlap * (massA / totalMass);

        const relativeVx = b.vx - a.vx;
        const relativeVy = b.vy - a.vy;
        const velocityAlongNormal = relativeVx * nx + relativeVy * ny;
        if (velocityAlongNormal < 0) {
          const impulse = -(1 + FRUIT_BOUNCE) * velocityAlongNormal / (1 / massA + 1 / massB);
          a.vx -= impulse / massA * nx;
          a.vy -= impulse / massA * ny;
          b.vx += impulse / massB * nx;
          b.vy += impulse / massB * ny;
        }
      }
    }

    if (spawned.length || fruits.some((fruit) => fruit.dead)) {
      for (let i = fruits.length - 1; i >= 0; i -= 1) {
        if (fruits[i].dead) fruits.splice(i, 1);
      }
      fruits.push(...spawned);
    }
    best = Math.max(best, score);
  }

  function checkGameOver() {
    const danger = fruits.some((fruit) =>
      fruit.age > 60 * SUBSTEPS && fruit.y - RADII[fruit.level] < DANGER_LINE
    );
    overTicks = danger ? overTicks + 1 : 0;
    if (overTicks > 60) gameOver = true;
  }

  function update() {
    if (!matchRunning || gameOver) return;
    if (cooldown > 0) cooldown -= 1;
    clampDropper();
    for (let i = 0; i < SUBSTEPS; i += 1) step(1 / SUBSTEPS);
    checkGameOver();
    if (gameOver) matchRunning = false;
  }

  function drawFruit(cx, cy, level) {
    const radius = RADII[level];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = "rgba(62, 37, 16, 0.22)";
    ctx.shadowBlur = radius * 0.18;
    ctx.shadowOffsetY = radius * 0.12;
    ctx.fillStyle = COLORS[level];
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";

    if (level === MAX_LEVEL) {
      ctx.fillStyle = "#eb3c46";
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#231b1b";
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4 + 0.4;
        const x = Math.cos(angle) * radius * 0.43;
        const y = Math.sin(angle) * radius * 0.43;
        ctx.beginPath();
        ctx.ellipse(x, y, 3, 5, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = level === MAX_LEVEL ? "#176b37" : shade(COLORS[level], -40);
    ctx.lineWidth = Math.max(2, radius * 0.055);
    ctx.beginPath();
    ctx.arc(0, 0, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.25, -radius * 0.36, radius * 0.25, radius * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();

    if (level !== MAX_LEVEL) {
      ctx.fillStyle = "rgba(40, 25, 10, 0.8)";
      ctx.font = `800 ${Math.max(11, radius * 0.62)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(level + 1), 0, 1);
    }

    if (level >= 3 || level === MAX_LEVEL) {
      ctx.fillStyle = "#357444";
      ctx.beginPath();
      ctx.ellipse(radius * 0.13, -radius * 0.88, radius * 0.2, radius * 0.09, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function shade(hex, amount) {
    const number = Number.parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (number >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (number & 255) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#fff1c8");
    background.addColorStop(1, "#f8d990");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "rgba(255, 250, 231, 0.65)";
    ctx.fillRect(LEFT, DANGER_LINE - 60, RIGHT - LEFT, FLOOR - DANGER_LINE + 60);
    ctx.strokeStyle = "#78502d";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(LEFT, DANGER_LINE - 60);
    ctx.lineTo(LEFT, FLOOR);
    ctx.lineTo(RIGHT, FLOOR);
    ctx.lineTo(RIGHT, DANGER_LINE - 60);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = overTicks > 0 && Math.floor(overTicks / 8) % 2 === 0
      ? "#e43c38"
      : "rgba(220, 80, 80, 0.62)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(LEFT, DANGER_LINE);
    ctx.lineTo(RIGHT, DANGER_LINE);
    ctx.stroke();
    ctx.restore();

    for (const fruit of fruits) {
      drawFruit(fruit.x, fruit.y, fruit.level);
    }

    if (!gameOver) {
      const radius = RADII[currentLevel];
      ctx.strokeStyle = "rgba(63, 48, 30, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dropperX, DANGER_LINE - 40 + radius);
      ctx.lineTo(dropperX, FLOOR);
      ctx.stroke();
      if (cooldown === 0) drawFruit(dropperX, DANGER_LINE - 40, currentLevel);
    }

    drawHud();
    if (gameOver) drawGameOver();
  }

  function drawHud() {
    ctx.fillStyle = "#59391e";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.fillText(`Score: ${score}`, 20, 32);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText(`Best: ${best}`, 20, 53);
    if (wonWatermelon) {
      ctx.fillStyle = "#288c4b";
      ctx.font = "800 14px system-ui, sans-serif";
      ctx.fillText("Watermelon made!", 20, 75);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#59391e";
    ctx.font = "800 14px system-ui, sans-serif";
    ctx.fillText("NEXT", WIDTH - 55, 27);
    drawFruit(WIDTH - 55, 63, nextLevel);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(NAMES[nextLevel], WIDTH - 55, 69 + RADII[nextLevel]);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(20, 15, 12, 0.67)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fffaf0";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2 - 20);
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillText(`Score: ${score}`, WIDTH / 2, HEIGHT / 2 + 20);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("Waiting for the other players to finish", WIDTH / 2, HEIGHT / 2 + 55);
  }

  function frame(timestamp) {
    if (!previousFrame) previousFrame = timestamp;
    accumulator += Math.min(timestamp - previousFrame, 100);
    previousFrame = timestamp;
    while (accumulator >= FIXED_FRAME_MS) {
      update();
      accumulator -= FIXED_FRAME_MS;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function pointerX(event) {
    const bounds = canvas.getBoundingClientRect();
    return (event.clientX - bounds.left) * (WIDTH / bounds.width);
  }

  canvas.addEventListener("pointermove", (event) => {
    if (!gameOver) {
      dropperX = pointerX(event);
      clampDropper();
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (gameOver) return;
    dropperX = pointerX(event);
    clampDropper();
    drop();
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") {
      return;
    }
    if (!matchRunning || gameOver) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      dropperX += event.key === "ArrowLeft" ? -12 : 12;
      clampDropper();
    } else if (event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      drop();
    }
  });

  document.getElementById("leftButton").addEventListener("click", () => {
    dropperX -= 24;
    clampDropper();
    canvas.focus({ preventScroll: true });
  });
  document.getElementById("rightButton").addEventListener("click", () => {
    dropperX += 24;
    clampDropper();
    canvas.focus({ preventScroll: true });
  });
  document.getElementById("dropButton").addEventListener("click", () => {
    drop();
    canvas.focus({ preventScroll: true });
  });

  createRoomButton.addEventListener("click", createRoom);
  joinRoomButton.addEventListener("click", joinRoom);
  startGameButton.addEventListener("click", startCompetition);
  newRoundButton.addEventListener("click", startNewRound);
  document.getElementById("backToLobby").addEventListener("click", leaveRoom);
  document.getElementById("roomCodeInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });

  restart();
  matchRunning = false;
  showLobby();
  if (session) {
    setLobbyBusy(true);
    pollRoom().finally(() => setLobbyBusy(false));
  }
  window.setInterval(pollRoom, 900);
  window.setInterval(syncScore, 500);
  requestAnimationFrame(frame);
})();
