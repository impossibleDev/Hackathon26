const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Make canvas fill the full window width and height
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Resize listener
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// 1. Create and Load the Player Image
const playerImage = new Image();
playerImage.src = 'assets/images/test.jpg'; // Make sure player.png is in the same folder

let imageLoaded = false;
playerImage.onload = () => {
  imageLoaded = true; // Image is ready to draw
};

// Player properties
const player = {
  x: canvas.width / 2 - 25,
  y: canvas.height / 2 - 25,
  width: 50,  // Adjust size as needed
  height: 50, // Adjust size as needed
  speed: 6
};

// Key tracking
const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

// Timer variables
let startTime = Date.now();

// Keyboard Listeners
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) {
    keys[key] = true;
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) {
    keys[key] = false;
  }
});

// Movement Logic
function updatePlayer() {
  if (keys.w && player.y > 0) player.y -= player.speed;
  if (keys.s && player.y + player.height < canvas.height) player.y += player.speed;
  if (keys.a && player.x > 0) player.x -= player.speed;
  if (keys.d && player.x + player.width < canvas.width) player.x += player.speed;
}

// Drawing Logic
function draw() {
  // Clear screen
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. Draw Player Image (or fall back to green square if image isn't loaded yet)
  if (imageLoaded) {
    ctx.drawImage(playerImage, player.x, player.y, player.width, player.height);
  } else {
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  // 3. Draw Timer
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px monospace';
  ctx.fillText(`Time: ${elapsedTime}s`, 30, 50);
}

// Main Game Loop
function gameLoop() {
  updatePlayer();
  draw();
  requestAnimationFrame(gameLoop);
}

// Start game loop
gameLoop();