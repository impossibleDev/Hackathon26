const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const restartBtn = document.getElementById('restartBtn');

const TILE = 32;
const BOARD_COLS = 17;
const BOARD_ROWS = 17;
const MOVE_DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIR_TO_KEY = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

const palettes = {
  pink: '#ff7db8',
  cyan: '#4ae3ff',
  orange: '#ffa14b',
  red: '#ff5b5b',
};

function createMaze() {
  const maze = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(' '));

  for (let x = 0; x < BOARD_COLS; x += 1) {
    maze[0][x] = '#';
    maze[BOARD_ROWS - 1][x] = '#';
  }

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    maze[y][0] = '#';
    maze[y][BOARD_COLS - 1] = '#';
  }

  const blocks = [
    [3, 3, 3, 2],
    [10, 3, 3, 2],
    [6, 7, 5, 2],
    [3, 11, 3, 2],
    [10, 11, 3, 2],
    [7, 14, 3, 2],
  ];

  for (const [x, y, width, height] of blocks) {
    for (let row = y; row < y + height; row += 1) {
      for (let col = x; col < x + width; col += 1) {
        maze[row][col] = '#';
      }
    }
  }

  return maze;
}

function buildPellets(maze) {
  const pellets = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));

  for (let y = 1; y < BOARD_ROWS - 1; y += 1) {
    for (let x = 1; x < BOARD_COLS - 1; x += 1) {
      if (maze[y][x] === '#') {
        pellets[y][x] = null;
        continue;
      }

      pellets[y][x] = '.';
    }
  }

  const powerSpots = [
    [1, 1],
    [BOARD_COLS - 2, 1],
    [1, BOARD_ROWS - 2],
    [BOARD_COLS - 2, BOARD_ROWS - 2],
  ];

  for (const [x, y] of powerSpots) {
    pellets[y][x] = 'o';
  }

  return pellets;
}

function createPlayer() {
  return {
    x: 1,
    y: 1,
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    moveTimer: 0,
    speed: 0.14,
  };
}

function createGhost(x, y, color) {
  return {
    x,
    y,
    dir: { x: 0, y: 1 },
    homeX: x,
    homeY: y,
    color,
    moveTimer: 0,
    speed: 0.16,
    frightened: 0,
  };
}

function makeGame() {
  const maze = createMaze();
  const pellets = buildPellets(maze);

  return {
    maze,
    pellets,
    score: 0,
    lives: 3,
    player: createPlayer(),
    ghosts: [
      createGhost(8, 8, palettes.pink),
      createGhost(9, 8, palettes.cyan),
      createGhost(8, 9, palettes.orange),
      createGhost(9, 9, palettes.red),
    ],
    state: 'playing',
    started: false,
    powerTimer: 0,
    lastFrameTime: 0,
  };
}

let game = makeGame();

function resetRound() {
  game.player = createPlayer();
  game.ghosts = [
    createGhost(8, 8, palettes.pink),
    createGhost(9, 8, palettes.cyan),
    createGhost(8, 9, palettes.orange),
    createGhost(9, 9, palettes.red),
  ];
  game.powerTimer = 0;
  game.state = 'playing';
  game.started = false;
}

function isWall(x, y) {
  if (x < 0 || y < 0 || x >= BOARD_COLS || y >= BOARD_ROWS) {
    return true;
  }
  return game.maze[y][x] === '#';
}

function getCell(x, y) {
  if (x < 0 || y < 0 || x >= BOARD_COLS || y >= BOARD_ROWS) {
    return null;
  }
  return { x, y };
}

function updateScore() {
  scoreEl.textContent = String(game.score);
  livesEl.textContent = String(game.lives);
}

function updatePlayer(dt) {
  const { player } = game;
  player.moveTimer += dt;

  if (player.moveTimer < player.speed) {
    return;
  }

  player.moveTimer = 0;

  const nextDir = player.nextDir;
  const currentDir = player.dir;

  if (nextDir && isWalkable(player.x + nextDir.x, player.y + nextDir.y)) {
    player.dir = nextDir;
  }

  if (isWalkable(player.x + player.dir.x, player.y + player.dir.y)) {
    player.x += player.dir.x;
    player.y += player.dir.y;
  } else if (player.nextDir && isWalkable(player.x + player.nextDir.x, player.y + player.nextDir.y)) {
    player.dir = player.nextDir;
    player.x += player.dir.x;
    player.y += player.dir.y;
  }

  eatPellet();
}

function isWalkable(x, y) {
  return !isWall(Math.floor(x), Math.floor(y));
}

function eatPellet() {
  const { x, y } = game.player;
  const pellet = game.pellets[y][x];

  if (!pellet) {
    return;
  }

  game.pellets[y][x] = null;

  if (pellet === 'o') {
    game.score += 50;
    game.powerTimer = 8;
    game.ghosts.forEach((ghost) => {
      ghost.frightened = 8;
    });
  } else {
    game.score += 10;
  }

  updateScore();

  if (countPellets() === 0) {
    game.state = 'won';
  }
}

function countPellets() {
  let count = 0;
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if (game.pellets[y][x]) {
        count += 1;
      }
    }
  }
  return count;
}

function chooseGhostDir(ghost) {
  const target = game.powerTimer > 0 && ghost.frightened > 0
    ? { x: ghost.homeX, y: ghost.homeY }
    : { x: game.player.x, y: game.player.y };

  const options = Object.values(MOVE_DELTAS)
    .filter((dir) => !isWall(ghost.x + dir.x, ghost.y + dir.y))
    .map((dir) => {
      const nextX = ghost.x + dir.x;
      const nextY = ghost.y + dir.y;
      return {
        dir,
        distance: Math.abs(nextX - target.x) + Math.abs(nextY - target.y),
      };
    })
    .sort((a, b) => a.distance - b.distance);

  if (options.length === 0) {
    return { x: 0, y: 0 };
  }

  const preferred = options[0].dir;
  const reverse = {
    x: -ghost.dir.x,
    y: -ghost.dir.y,
  };

  const forward = options.find((entry) => entry.dir.x === preferred.x && entry.dir.y === preferred.y);
  const safeDir = options.find((entry) => !(entry.dir.x === reverse.x && entry.dir.y === reverse.y));

  return (forward || safeDir || options[0]).dir;
}

function updateGhosts(dt) {
  for (const ghost of game.ghosts) {
    ghost.moveTimer += dt;
    if (ghost.moveTimer < ghost.speed) {
      continue;
    }
    ghost.moveTimer = 0;

    const next = chooseGhostDir(ghost);
    if (next.x === 0 && next.y === 0) {
      continue;
    }

    const nextX = ghost.x + next.x;
    const nextY = ghost.y + next.y;

    if (!isWall(nextX, nextY)) {
      ghost.x = nextX;
      ghost.y = nextY;
      ghost.dir = next;
    }

    if (ghost.frightened > 0) {
      ghost.frightened -= dt;
      if (ghost.frightened < 0) {
        ghost.frightened = 0;
      }
    }
  }

  if (game.powerTimer > 0) {
    game.powerTimer = Math.max(0, game.powerTimer - dt);
  }
}

function detectCollisions() {
  for (const ghost of game.ghosts) {
    if (ghost.x === game.player.x && ghost.y === game.player.y) {
      if (ghost.frightened > 0) {
        game.score += 200;
        ghost.x = ghost.homeX;
        ghost.y = ghost.homeY;
        ghost.frightened = 0;
        updateScore();
      } else {
        game.lives -= 1;
        updateScore();

        if (game.lives <= 0) {
          game.state = 'gameover';
          return;
        }

        resetRound();
      }
    }
  }
}

function update(dt) {
  if (game.state !== 'playing' || !game.started) {
    return;
  }

  updatePlayer(dt);
  updateGhosts(dt);
  detectCollisions();
}

function drawMaze() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if (game.maze[y][x] === '#') {
        ctx.fillStyle = '#2f63ff';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const pellet = game.pellets[y][x];
      if (!pellet) {
        continue;
      }

      const px = x * TILE + TILE / 2;
      const py = y * TILE + TILE / 2;
      ctx.fillStyle = pellet === 'o' ? '#ffcf4f' : '#f8f8f8';
      ctx.beginPath();
      ctx.arc(px, py, pellet === 'o' ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlayer() {
  const player = game.player;
  const cx = (player.x + 0.5) * TILE;
  const cy = (player.y + 0.5) * TILE;
  const mouth = Math.PI / 5;
  const angle = (
    player.dir.x === 1 ? 0 :
    player.dir.x === -1 ? Math.PI :
    player.dir.y === -1 ? Math.PI * 1.5 :
    Math.PI / 2
  );

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.fillStyle = '#ffd000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, TILE * 0.42, mouth, Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(TILE * 0.11, -TILE * 0.11, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGhost(ghost) {
  const cx = (ghost.x + 0.5) * TILE;
  const cy = (ghost.y + 0.5) * TILE;
  const bodyRadius = TILE * 0.4;

  ctx.fillStyle = ghost.frightened > 0 ? '#6e7dff' : ghost.color;
  ctx.beginPath();
  ctx.moveTo(cx - bodyRadius, cy + bodyRadius);
  ctx.lineTo(cx - bodyRadius, cy - bodyRadius * 0.55);
  ctx.quadraticCurveTo(cx - bodyRadius * 0.8, cy - bodyRadius * 1.1, cx, cy - bodyRadius * 1.2);
  ctx.quadraticCurveTo(cx + bodyRadius * 0.8, cy - bodyRadius * 1.1, cx + bodyRadius, cy - bodyRadius * 0.55);
  ctx.lineTo(cx + bodyRadius, cy + bodyRadius);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - bodyRadius * 0.35, cy - bodyRadius * 0.2, 4, 0, Math.PI * 2);
  ctx.arc(cx + bodyRadius * 0.35, cy - bodyRadius * 0.2, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx - bodyRadius * 0.35, cy - bodyRadius * 0.2, 2, 0, Math.PI * 2);
  ctx.arc(cx + bodyRadius * 0.35, cy - bodyRadius * 0.2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawStatusMessage() {
  if (game.state === 'won') {
    drawBanner('YOU WON!');
  } else if (game.state === 'gameover') {
    drawBanner('GAME OVER');
  } else if (!game.started) {
    drawBanner('PRESS A DIRECTION');
  }
}

function drawBanner(text) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, canvas.height * 0.45, canvas.width, 70);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 12);
}

function render() {
  drawMaze();
  drawPlayer();
  for (const ghost of game.ghosts) {
    drawGhost(ghost);
  }
  drawStatusMessage();
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - game.lastFrameTime) / 1000 || 0.016, 0.033);
  game.lastFrameTime = timestamp;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function setDirectionFromKey(key) {
  const direction = DIR_TO_KEY[key];
  if (!direction) {
    return;
  }

  if (game.state === 'won' || game.state === 'gameover') {
    restartBtn.click();
    return;
  }

  game.started = true;
  const delta = MOVE_DELTAS[direction];
  const nextDir = { x: delta.x, y: delta.y };
  game.player.nextDir = nextDir;
}

window.addEventListener('keydown', (event) => {
  if (event.key in DIR_TO_KEY || DIR_TO_KEY[event.key]) {
    setDirectionFromKey(event.key);
    event.preventDefault();
  }
});

restartBtn.addEventListener('click', () => {
  game = makeGame();
  updateScore();
});

updateScore();
requestAnimationFrame(gameLoop);
