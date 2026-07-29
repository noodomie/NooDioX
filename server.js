const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const MAP_SIZE = 3000;
const MAX_FOODS = 250;

let foods = [];
let players = {};
let nextId = 1;

function createFood(val = 1, x = null, y = null) {
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: x !== null ? x : Math.floor(Math.random() * (MAP_SIZE - 100)) + 50,
    y: y !== null ? y : Math.floor(Math.random() * (MAP_SIZE - 100)) + 50,
    color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 60%)`,
    val: val,
    r: val >= 50 ? 10 : 4
  };
}

function initFoods() {
  while (foods.length < MAX_FOODS) {
    foods.push(createFood(1));
  }
}
initFoods();

function getRandomColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 100%, 55%)`;
}

function spawnPlayer(id, name) {
  const x = Math.floor(Math.random() * (MAP_SIZE - 600)) + 300;
  const y = Math.floor(Math.random() * (MAP_SIZE - 600)) + 300;
  const angle = Math.random() * Math.PI * 2;
  const length = 6;
  const body = [];
  const color = getRandomColor();
  
  for (let i = 0; i < length; i++) {
    body.push({ x: x - i * 6 * Math.cos(angle), y: y - i * 6 * Math.sin(angle) });
  }

  return {
    id: id,
    name: name,
    x: x,
    y: y,
    angle: angle,
    speed: 3,
    score: 0,
    radius: 8,
    color: color,
    body: body,
    isDashing: false
  };
}

function handleDeath(player) {
  const dropCount = Math.min(Math.floor(player.body.length / 2), 40);
  for (let i = 0; i < dropCount; i++) {
    const segment = player.body[Math.floor(Math.random() * player.body.length)];
    if (segment) {
      const offsetX = (Math.random() - 0.5) * 30;
      const offsetY = (Math.random() - 0.5) * 30;
      foods.push(createFood(50, Math.max(10, Math.min(MAP_SIZE - 10, segment.x + offsetX)), Math.max(10, Math.min(MAP_SIZE - 10, segment.y + offsetY))));
    }
  }
}

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'join') {
        playerId = 'p_' + nextId++;
        let name = String(data.name || '').trim();
        if (name.length < 1 || name.length > 16) {
          ws.send(JSON.stringify({ type: 'error', message: 'Hatalı İsim' }));
          return;
        }
        const newPlayer = spawnPlayer(playerId, name);
        players[playerId] = newPlayer;

        ws.send(JSON.stringify({
          type: 'init',
          id: playerId,
          mapSize: MAP_SIZE,
          foods: foods,
          players: players
        }));
      } else if (data.type === 'input' && playerId && players[playerId]) {
        const p = players[playerId];
        if (typeof data.angle === 'number') p.angle = data.angle;
        p.isDashing = !!data.isDashing;
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (playerId && players[playerId]) {
      delete players[playerId];
    }
  });
});

setInterval(() => {
  for (let id in players) {
    const p = players[id];
    
    let currentSpeed = p.speed;
    if (p.isDashing && p.score >= 2) {
      currentSpeed = p.speed * 1.8;
      p.score = Math.max(0, p.score - 1);
      
      if (p.body.length > 5 && Math.random() < 0.4) {
        const tail = p.body[p.body.length - 1];
        if (tail) {
          foods.push(createFood(1, tail.x, tail.y));
        }
      }
    }

    p.x += Math.cos(p.angle) * currentSpeed;
    p.y += Math.sin(p.angle) * currentSpeed;

    p.radius = 8 + Math.floor(p.score / 15);

    if (p.x < p.radius || p.x > MAP_SIZE - p.radius || p.y < p.radius || p.y > MAP_SIZE - p.radius) {
      handleDeath(p);
      if (wss.clients) {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'died', id: p.id }));
          }
        });
      }
      delete players[id];
      continue;
    }

    p.body.unshift({ x: p.x, y: p.y });
    const targetLength = 6 + Math.floor(p.score / 1);
    while (p.body.length > targetLength) {
      p.body.pop();
    }

    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dist = Math.hypot(p.x - f.x, p.y - f.y);
      if (dist < p.radius + f.r) {
        p.score += f.val;
        foods.splice(i, 1);
        if (foods.length < MAX_FOODS) {
          foods.push(createFood(1));
        }
      }
    }

    for (let otherId in players) {
      if (otherId === id) continue;
      const other = players[otherId];
      
      for (let i = 2; i < other.body.length; i += 2) {
        const seg = other.body[i];
        const dist = Math.hypot(p.x - seg.x, p.y - seg.y);
        if (dist < p.radius + (other.radius * 0.8)) {
          handleDeath(p);
          if (wss.clients) {
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'died', id: p.id }));
              }
            });
          }
          delete players[id];
          break;
        }
      }
    }
  }

  const payload = JSON.stringify({
    type: 'state',
    players: players,
    foods: foods
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 1000 / 30);

const PORT = 3000;
server.listen(PORT, () => {
  console.log('NooDio Server çalışıyor: http://localhost:' + PORT);
});