// ==========================================
// CONFIGURAÇÃO DO SUPABASE
// ==========================================
const SUPABASE_URL = 'https://nkpqjecybrlzfhwdudyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MAYqX-_lOj-YS-xGH-Kf1w_ay0LrscN';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ELEMENTOS DO DOM E ESTADO GLOBAL
// ==========================================
const authSection = document.getElementById('auth-section');
const gameSection = document.getElementById('game-section');
const adminSection = document.getElementById('admin-section');
const mapContainer = document.getElementById('map-container');
const adminFeedback = document.getElementById('admin-feedback');
const gameStateDisplay = document.getElementById('game-state-display');
const sidebar = document.getElementById('sidebar');

let currentUser = null;
let currentRole = 'player';
let allRooms = [];
let allNpcs = [];
let allLocations = [];
let currentGameDay = 1;

// ==========================================
// LOGIN E LOGOUT
// ==========================================
document.getElementById('btn-login').addEventListener('click', async () => {
  const emailInput = document.getElementById('email').value.trim();
  const passwordInput = document.getElementById('password').value;
  const errorDiv = document.getElementById('auth-error');
  
  errorDiv.textContent = 'Entrando...';
  errorDiv.style.color = '#4ecca3';

  const { error } = await db.auth.signInWithPassword({ 
    email: emailInput, 
    password: passwordInput 
  });

  if (error) {
    errorDiv.textContent = 'Erro: ' + error.message;
    errorDiv.style.color = '#8b2d2d';
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await db.auth.signOut(); 
  location.reload();
});

// ==========================================
// MONITOR DE AUTENTICAÇÃO
// ==========================================
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
      document.getElementById('btn-advance-day').style.display = 'block';
      document.getElementById('btn-reset-game').style.display = 'block';
    }

    await loadGameData();
  } else {
    authSection.classList.remove('hidden');
    gameSection.style.display = 'none';
    adminSection.style.display = 'none';
  }
});

// ==========================================
// CARREGAR DADOS DO JOGO
// ==========================================
async function loadGameData() {
  const { data: state } = await db.from('game_state').select('*').eq('id', 1).single();
  if (state) {
    currentGameDay = state.day_number;
    gameStateDisplay.textContent = `Dia ${state.day_number} - Fase: ${state.phase.toUpperCase()}`;
  }

  const { data: rooms } = await db.from('rooms').select('*').order('room_order');
  allRooms = rooms || [];

  const { data: npcs } = await db.from('npcs').select('*');
  allNpcs = npcs || [];
  
  const { data: locations } = await db.from('npc_locations').select('*');
  allLocations = locations || [];

  renderMap();
}

// ==========================================
// RENDERIZAR MAPA
// ==========================================
function renderMap() {
  mapContainer.querySelectorAll('.room-hit').forEach(el => el.remove());

  allRooms.forEach(room => {
    if (room.name.toLowerCase().includes('porão')) return;
    if (currentRole !== 'admin' && room.is_hidden) return;

    const div = document.createElement('div');
    div.className = 'room-hit' + (room.is_hidden ? ' hidden-room' : '');
    div.style.left = room.x_percent + '%';
    div.style.top = room.y_percent + '%';
    div.style.width = room.w_percent + '%';
    div.style.height = room.h_percent + '%';
    div.innerHTML = `<span class="room-label">${room.name}</span>`;
    div.onclick = () => showRoomDetail(room);
    mapContainer.appendChild(div);
  });
}

// ==========================================
// BARRA LATERAL (SIDEBAR)
// ==========================================
document.getElementById('btn-close-sidebar').addEventListener('click', () => {
  sidebar.classList.remove('active');
});

function showRoomDetail(room) {
  let npcsHere = allNpcs.filter(npc => {
    const loc = allLocations.find(l => l.npc_id === npc.id);
    
    if (room.name === 'Porta/Entrada') {
      // Na Porta, mostra APENAS quem está explicitamente com o ID da Porta e is_inside = false
      return loc && loc.room_id === room.id && loc.is_inside === false;
    }
    
    // Nos outros cômodos, mostra quem já entrou (is_inside = true)
    return loc && loc.room_id === room.id && loc.is_inside === true;
  });

  const sidebarTitle = document.getElementById('sidebar-title');
  const sidebarContent = document.getElementById('sidebar-content');

  sidebarTitle.textContent = room.name;
  
  if (npcsHere.length === 0) {
    sidebarContent.innerHTML = `<p style="color:#666; font-style:italic;">Ninguém aqui... por enquanto.</p>`;
  } else {
    let html = '';
    npcsHere.forEach(npc => {
      if (!npc.is_alive && currentRole !== 'admin') return;

      const isDead = !npc.is_alive ? 'npc-dead' : '';
      const raceInfo = currentRole === 'admin' ? ` <span style="font-size:11px; background:#5c3a21; padding:2px 6px; border-radius:2px; float:right;">${npc.race}</span>` : ''; 
      
      let moveBtnHtml = '';
      if (currentRole === 'admin' && npc.is_alive && room.name === 'Porta/Entrada') {
        moveBtnHtml = `<button class="btn-mover-npc" onclick="autoMoveNPC('${npc.id}')">Mover</button>`;
      }

      html += `<div class="npc-card ${isDead}">
        <div style="font-size:16px; font-weight:bold; color:#d4c5b0;">
          ${npc.name}
          ${moveBtnHtml}
          ${raceInfo}
        </div>
        <div style="font-size:13px; color:#888; margin-top:8px; clear:both;">${npc.description || 'Sem descrição.'}</div>
      </div>`;
    });
    sidebarContent.innerHTML = html;
  }

  sidebar.classList.add('active');
}

// ==========================================
// LÓGICA DE AUTO-MOVER NPC
// ==========================================
window.autoMoveNPC = async function(npcId) {
  adminFeedback.textContent = `Movendo...`;
  adminFeedback.style.color = '#d4c5b0';

  const { data, error } = await db.rpc('move_npc_to_favorite', { p_npc_id: npcId });
  
  if (error) {
    alert('Erro ao mover: ' + error.message);
  } else {
    await db.from('npc_locations').update({ is_inside: true }).eq('npc_id', npcId);
    
    adminFeedback.textContent = `NPC movido para ${data}!`;
    adminFeedback.style.color = '#4ecca3';
    await loadGameData(); 
    document.getElementById('sidebar').classList.remove('active'); 
  }
};

// ==========================================
// FUNÇÃO AVANÇAR DIA (Com Pop-up)
// ==========================================
document.getElementById('btn-advance-day').addEventListener('click', async () => {
  document.getElementById('btn-advance-day').disabled = true;
  document.getElementById('btn-advance-day').textContent = 'Avançando...';

  const { data, error } = await db.rpc('advance_day');
  
  if (error) {
    alert('Erro: ' + error.message);
  } else {
    if (data.deaths && data.deaths.length > 0) {
      let msg = `🌙 Transição para Dia ${data.day} - Fase: ${data.phase.toUpperCase()}\n\n💀 MORTES DA NOITE:\n`;
      data.deaths.forEach(d => {
        msg += `- ${d.name} (${d.race})\n`;
      });
      alert(msg);
    } else {
      alert(`🌙 Transição para Dia ${data.day} - Fase: ${data.phase.toUpperCase()}\n\nNinguém morreu nesta noite.`);
    }

    await loadGameData();
    document.getElementById('sidebar').classList.remove('active');
  }
  
  document.getElementById('btn-advance-day').disabled = false;
  document.getElementById('btn-advance-day').textContent = '🌙 Avançar Dia/Noite';
});

// ==========================================
// FUNÇÃO RESETAR JOGO
// ==========================================
document.getElementById('btn-reset-game').addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja resetar o jogo? Todos os NPCs voltarão à vida e o dia voltará para 1.')) return;

  document.getElementById('btn-reset-game').disabled = true;
  document.getElementById('btn-reset-game').textContent = 'Resetando...';

  const { data, error } = await db.rpc('reset_game');
  
  if (error) {
    alert('Erro ao resetar: ' + error.message);
  } else {
    alert(`🔄 Jogo resetado com sucesso!\n\nO Dia 1 começou com ${data.inside} NPCs na casa (sendo ${data.visitors} visitante).`);
    await loadGameData();
    document.getElementById('sidebar').classList.remove('active');
  }

  document.getElementById('btn-reset-game').disabled = false;
  document.getElementById('btn-reset-game').textContent = '🔄 Resetar Jogo';
});

// ==========================================
// ADICIONAR NPC (Admin)
// ==========================================
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
      npc_id: newNpc.id, 
      room_id: doorRoom.id, 
      is_exclusive_door: false,
      is_inside: false
    });
    
    adminFeedback.textContent = `NPC ${name} criado na Porta/Entrada.`;
    adminFeedback.style.color = '#4ecca3';
    document.getElementById('new-npc-name').value = '';
    document.getElementById('new-npc-desc').value = '';
    await loadGameData();
  }
});
