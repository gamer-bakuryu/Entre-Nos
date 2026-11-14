// TROQUE PELOS SEUS DADOS DO SUPABASE
const SUPABASE_URL = 'https://nkpqjecybrlzfhwdudyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MAYqX-_lOj-YS-xGH-Kf1w_ay0LrscN';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authSection = document.getElementById('auth-section');
const gameSection = document.getElementById('game-section');
const adminSection = document.getElementById('admin-section');
const mapContainer = document.getElementById('map-container');
const roomDetail = document.getElementById('room-detail');
const adminFeedback = document.getElementById('admin-feedback');
const gameStateDisplay = document.getElementById('game-state-display');

let currentUser = null;
let currentRole = 'player';
let allRooms = [];
let allNpcs = [];
let allLocations = [];

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) document.getElementById('auth-error').textContent = error.message;
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await db.auth.signOut(); location.reload();
});

db.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById('user-email-display').textContent = currentUser.email;
    
    const { data: profile } = await db.from('profiles').select('role').eq('id', currentUser.id).single();
    currentRole = profile?.role || 'player';

    authSection.classList.add('hidden');
    gameSection.style.display = 'flex';
    gameSection.style.flexDirection = 'column';
    gameSection.style.alignItems = 'center';
    
    if (currentRole === 'admin') {
      adminSection.style.display = 'block';
    }

    await loadGameData();
  } else {
    authSection.classList.remove('hidden');
    gameSection.style.display = 'none';
    adminSection.style.display = 'none';
  }
});

async function loadGameData() {
  const { data: state } = await db.from('game_state').select('*').eq('id', 1).single();
  if (state) gameStateDisplay.textContent = `Dia ${state.day_number} - Fase: ${state.phase.toUpperCase()}`;

  const { data: rooms } = await db.from('rooms').select('*').order('room_order');
  allRooms = rooms || [];

  const { data: npcs } = await db.from('npcs').select('*');
  allNpcs = npcs || [];
  
  const { data: locations } = await db.from('npc_locations').select('*');
  allLocations = locations || [];

  renderMap();
  renderAdminSelects();
}

function renderMap() {
  mapContainer.querySelectorAll('.room-hit').forEach(el => el.remove());

  allRooms.forEach(room => {
    if (currentRole !== 'admin' && room.is_hidden) return;

    const div = document.createElement('div');
    div.className = 'room-hit' + (room.is_hidden ? ' hidden-room' : '');
    div.style.left = room.x_percent + '%';
    div.style.top = room.y_percent + '%';
    div.style.width = room.w_percent + '%';
    div.style.height = room.h_percent + '%';
    // Agora o innerHTML tem apenas a label, que será centralizada pelo CSS
    div.innerHTML = `<span class="room-label">${room.name}</span>`;
    div.onclick = () => showRoomDetail(room);
    mapContainer.appendChild(div);
  });
}

function showRoomDetail(room) {
  const npcsHere = allNpcs.filter(npc => {
    const loc = allLocations.find(l => l.npc_id === npc.id);
    return loc && loc.room_id === room.id;
  });

  let html = `<h3 style="color:#8b2d2d; margin-bottom:15px; font-variant:small-caps;">${room.name}</h3>`;
  
  if (npcsHere.length === 0) {
    html += `<p style="color:#666; font-style:italic;">Ninguém aqui... por enquanto.</p>`;
  } else {
    npcsHere.forEach(npc => {
      if (!npc.is_alive && currentRole !== 'admin') return;

      const isDead = !npc.is_alive ? 'npc-dead' : '';
      const raceInfo = currentRole === 'admin' ? ` <span style="font-size:11px; background:#5c3a21; padding:2px 6px; border-radius:2px; margin-left:10px;">${npc.race}</span>` : ''; 
      
      html += `<div class="npc-card ${isDead}">
        <div style="font-size:16px; font-weight:bold; color:#d4c5b0;">${npc.name}${raceInfo}</div>
        <div style="font-size:13px; color:#888; margin-top:5px;">${npc.description || 'Sem descrição.'}</div>
      </div>`;
    });
  }
  roomDetail.innerHTML = html;
}

function renderAdminSelects() {
  if (currentRole !== 'admin') return;
  
  const npcSelect = document.getElementById('npc-select');
  npcSelect.innerHTML = allNpcs.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
  
  const roomSelect = document.getElementById('room-select');
  roomSelect.innerHTML = allRooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

document.getElementById('btn-move-npc').addEventListener('click', async () => {
  const npcId = document.getElementById('npc-select').value;
  const roomId = document.getElementById('room-select').value;
  
  const { error } = await db.rpc('move_npc', { p_npc_id: npcId, p_room_id: roomId });
  
  if (error) {
    adminFeedback.textContent = 'Erro: ' + error.message;
    adminFeedback.style.color = '#8b2d2d';
  } else {
    adminFeedback.textContent = 'NPC movido com sucesso!';
    adminFeedback.style.color = '#4ecca3';
    await loadGameData();
  }
});

document.getElementById('btn-advance-day').addEventListener('click', async () => {
  const { data, error } = await db.rpc('advance_day');
  
  if (error) {
    adminFeedback.textContent = 'Erro: ' + error.message;
    adminFeedback.style.color = '#8b2d2d';
  } else {
    adminFeedback.textContent = `Avançou para Dia ${data.day} (${data.phase}). Mortes: ${data.killed}`;
    adminFeedback.style.color = '#4ecca3';
    await loadGameData();
  }
});

document.getElementById('btn-add-npc').addEventListener('click', async () => {
  const name = document.getElementById('new-npc-name').value;
  const desc = document.getElementById('new-npc-desc').value;
  const race = document.getElementById('new-npc-race').value;
  const nightsStr = document.getElementById('new-npc-nights').value;
  
  if (!name) return;

  const nights = nightsStr ? nightsStr.split(',').map(n => parseInt(n.trim())) : [1];
  const doorRoom = allRooms.find(r => r.name === 'Porta/Entrada');

  const { data: newNpc, error } = await db.from('npcs').insert({
    name, description: desc, race, nights_active: nights
  }).select().single();

  if (error) {
    adminFeedback.textContent = 'Erro: ' + error.message;
    adminFeedback.style.color = '#8b2d2d';
  } else {
    await db.from('npc_locations').insert({
      npc_id: newNpc.id, room_id: doorRoom.id, is_exclusive_door: false
    });
    
    adminFeedback.textContent = `NPC ${name} criado na Porta/Entrada.`;
    adminFeedback.style.color = '#4ecca3';
    document.getElementById('new-npc-name').value = '';
    document.getElementById('new-npc-desc').value = '';
    await loadGameData();
  }
});
