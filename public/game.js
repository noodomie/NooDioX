Const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

const playBtn = document.getElementById('play-btn');
const nicknameInput = document.getElementById('nickname');
const errorMsg = document.getElementById('error-msg');

const menu = document.getElementById('menu');
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingText = document.getElementById('loading-text');
const gameUI = document.getElementById('game-ui');
const deathScreen = document.getElementById('death-screen');
const respawnBtn = document.getElementById('respawn-btn');
const currentScoreElem = document.getElementById('current-score');
const finalScoreElem = document.getElementById('final-score');

let socket = null;
let myId = null;
let mapSize = 3000;
let players = {};
let foods = [];
let targetAngle = 0;
let isDashing = false;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function dismissKeyboard(e) {
  if (e.target !== nicknameInput) {
    nicknameInput.blur();
  }
}
document.addEventListener('touchstart', dismissKeyboard);
document.addEventListener('mousedown', dismissKeyboard);

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function enableFullscreen() {
  const doc = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
    if (doc.requestFullscreen) {
      doc.requestFullscreen().catch(() => {});
    } else if (doc.webkitRequestFullscreen) {
      doc.webkitRequestFullscreen();
    } else if (doc.mozRequestFullScreen) {
      doc.mozRequestFullScreen();
    } else if (doc.msRequestFullscreen) {
      doc.msRequestFullscreen();
    }
  }
}

document.addEventListener('touchstart', enableFullscreen, { once: true });
document.addEventListener('click', enableFullscreen, { once: true });

playBtn.addEventListener('click', () => {
  enableFullscreen();
  const name = nicknameInput.value.trim();
  if (name.length < 1 || name.length > 16) {
    errorMsg.innerText = 'Hatalı İsim';
    return;
  }
  errorMsg.innerText = '';
  playBtn.disabled = true;

  menu.classList.add('hidden');
  loadingScreen.classList.remove('hidden');

  let progress = 0;
  loadingBarFill.style.width = '0%';
  loadingText.innerText = '%0';

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${wsProtocol}//${window.location.host}`);

  progress = 30;
  loadingBarFill.style.width = progress + '%';
  loadingText.innerText = '%' + progress;

  socket.onopen = () => {
    progress = 70;
    loadingBarFill.style.width = progress + '%';
    loadingText.innerText = '%' + progress;

    socket.send(JSON.stringify({
      type: 'join',
      name: name
    }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'error') {
      errorMsg.innerText = data.message;
      loadingScreen.classList.add('hidden');
      menu.classList.remove('hidden');
      playBtn.disabled = false;
      socket.close();
    } else if (data.type === 'init') {
      myId = data.id;
      mapSize = data.mapSize;
      foods = data.foods;
      players = data.players;

      progress = 100;
      loadingBarFill.style.width = '100%';
      loadingText.innerText = '%100';

      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        gameUI.classList.remove('hidden');
      }, 100);
    } else if (data.type === 'state') {
      players = data.players;
      foods = data.foods;
    } else if (data.type === 'died' && data.id === myId) {
      gameUI.classList.add('hidden');
      deathScreen.classList.remove('hidden');
      if (finalScoreElem && currentScoreElem) {
        finalScoreElem.innerText = currentScoreElem.innerText;
      }
      if (socket) socket.close();
    }
  };

  socket.onerror = () => {
    errorMsg.innerText = 'Bağlantı Hatası';
    loadingScreen.classList.add('hidden');
    menu.classList.remove('hidden');
    playBtn.disabled = false;
  };
});

respawnBtn.addEventListener('click', () => {
  deathScreen.classList.add('hidden');
  menu.classList.remove('hidden');
  playBtn.disabled = false;
});

const joystickZone = document.getElementById('joystick-zone');
const joystickStick = document.getElementById('joystick-stick');
let joyActive = false;
let joyStartPos = { x: 0, y: 0 };

joystickZone.addEventListener('touchstart', (e) => {
  joyActive = true;
  const touch = e.touches[0];
  const rect = joystickZone.getBoundingClientRect();
  joyStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  updateJoystick(touch);
});

joystickZone.addEventListener('touchmove', (e) => {
  if (!joyActive) return;
  updateJoystick(e.touches[0]);
});

function handleTouchEnd(e) {
  if (e.touches.length === 0) {
    joyActive = false;
    joystickStick.style.transform = `translate(0px, 0px)`;
  }
}
joystickZone.addEventListener('touchend', handleTouchEnd);
joystickZone.addEventListener('touchcancel', handleTouchEnd);

function updateJoystick(touch) {
  const dx = touch.clientX - joyStartPos.x;
  const dy = touch.clientY - joyStartPos.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  targetAngle = angle;
  const maxRadius = 32; // Büyütülen joystick kapağına özel ideal yarıçap
  const moveDist = Math.min(dist, maxRadius);

  const stickX = Math.cos(angle) * moveDist;
  const stickY = Math.sin(angle) * moveDist;

  joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

  sendInput();
}

const dashBtn = document.getElementById('dash-btn');
dashBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isDashing = true;
  sendInput();
});
dashBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  isDashing = false;
  sendInput();
});

function sendInput() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'input',
      angle: targetAngle,
      isDashing: isDashing
    }));
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const me = players[myId];
  let camX = mapSize / 2;
  let camY = mapSize / 2;
  let scale = 1;

  if (me) {
    camX = me.x;
    camY = me.y;
    scale = Math.max(0.4, 1 - (me.score / 5000));
    if (currentScoreElem) {
      currentScoreElem.innerText = me.score;
    }
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  ctx.strokeStyle = 'red';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, mapSize, mapSize);

  ctx.beginPath();
  ctx.strokeStyle = '#282828';
  ctx.lineWidth = 2;
  const gridSize = 100;
  const startX = Math.max(0, Math.floor((camX - window.innerWidth / scale) / gridSize) * gridSize);
  const endX = Math.min(mapSize, Math.ceil((camX + window.innerWidth / scale) / gridSize) * gridSize);
  const startY = Math.max(0, Math.floor((camY - window.innerHeight / scale) / gridSize) * gridSize);
  const endY = Math.min(mapSize, Math.ceil((camY + window.innerHeight / scale) / gridSize) * gridSize);

  for (let x = startX; x <= endX; x += gridSize) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = startY; y <= endY; y += gridSize) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  for (let f of foods) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.fill();
  }

  for (let id in players) {
    const p = players[id];

    ctx.fillStyle = p.color;
    for (let i = p.body.length - 1; i >= 0; i--) {
      const seg = p.body[i];
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, p.radius * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.body.length > 0) {
      const head = p.body[0];
      const eyeOffsetAngle = 0.5;
      const eyeDist = p.radius * 0.6;
      const eyeRadius = Math.max(2, p.radius * 0.25);
      const pupilRadius = Math.max(1, eyeRadius * 0.5);

      const leftEyeX = head.x + Math.cos(p.angle - eyeOffsetAngle) * eyeDist;
      const leftEyeY = head.y + Math.sin(p.angle - eyeOffsetAngle) * eyeDist;
      const rightEyeX = head.x + Math.cos(p.angle + eyeOffsetAngle) * eyeDist;
      const rightEyeY = head.y + Math.sin(p.angle + eyeOffsetAngle) * eyeDist;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(leftEyeX + Math.cos(p.angle) * pupilRadius * 0.5, leftEyeY + Math.sin(p.angle) * pupilRadius * 0.5, pupilRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX + Math.cos(p.angle) * pupilRadius * 0.5, rightEyeY + Math.sin(p.angle) * pupilRadius * 0.5, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - p.radius - 8);
  }

  ctx.restore();

  renderMinimap();
  renderLeaderboard();

  requestAnimationFrame(render);
}

function renderMinimap() {
  minimapCtx.clearRect(0, 0, 100, 100);

  minimapCtx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  minimapCtx.fillRect(0, 0, 100, 100);

  minimapCtx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
  minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(0, 0, 100, 100);

  const scale = 100 / mapSize;

  for (let id in players) {
    const p = players[id];
    const isMe = (id === myId);
    const x = p.x * scale;
    const y = p.y * scale;

    minimapCtx.beginPath();
    minimapCtx.arc(x, y, isMe ? 3.5 : 2, 0, Math.PI * 2);
    minimapCtx.fillStyle = isMe ? '#00ffcc' : '#ff3366';
    minimapCtx.fill();

    if (isMe) {
      minimapCtx.strokeStyle = '#ffffff';
      minimapCtx.lineWidth = 1;
      minimapCtx.stroke();
    }
  }
}

function renderLeaderboard() {
  const sorted = Object.values(players).sort((a, b) => b.score - a.score).slice(0, 5);
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';

  sorted.forEach((p, index) => {
    const rank = index + 1;
    const li = document.createElement('li');
    li.className = 'lb-item' + (p.id === myId ? ' me' : '');

    const rankClass = `lb-rank lb-rank-${rank}`;
    
    li.innerHTML = `
      <span class="${rankClass}">#${rank}</span>
      <span class="lb-name">${escapeHTML(p.name)}</span>
      <span class="lb-score">${p.score}</span>
    `;
    list.appendChild(li);
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

requestAnimationFrame(render);
