/* OpenVoice Clone — Vanilla JS Application */

const API = window.API_BASE;

let voices = [];
let activeTab = 'voices';
let chatSessionId = null;
let currentAudio = null;
let currentPlayingCard = null;

// ── Waveform Visualizer ──
class WaveformVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.animationId = null;
    this.connectedAudio = null;
  }

  connect(audioElement) {
    if (!this.canvas) return;
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Disconnect previous
    if (this.source) {
      try { this.source.disconnect(); } catch(e) {}
    }
    if (this.connectedAudio === audioElement) {
      // Already connected, just resume
      this.audioCtx.resume();
      return;
    }
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.source = this.audioCtx.createMediaElementSource(audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    this.connectedAudio = audioElement;
  }

  start() {
    if (!this.analyser || !this.canvas) return;
    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      const w = this.canvas.width = this.canvas.offsetWidth * 2;
      const h = this.canvas.height = this.canvas.offsetHeight * 2;
      this.ctx.clearRect(0, 0, w, h);

      const barWidth = (w / bufferLength) * 1.5;
      const gap = 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 255;
        const barH = v * h * 0.85;

        // Gradient from accent red to volt yellow based on frequency
        const ratio = i / bufferLength;
        const r = Math.round(255 * (1 - ratio) + 226 * ratio);
        const g = Math.round(59 * (1 - ratio) + 255 * ratio);
        const b = Math.round(48 * (1 - ratio) + 74 * ratio);
        this.ctx.fillStyle = `rgba(${r},${g},${b},${0.6 + v * 0.4})`;

        this.ctx.fillRect(x, h - barH, barWidth - gap, barH);
        // Mirror on top (subtle)
        this.ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + v * 0.15})`;
        this.ctx.fillRect(x, 0, barWidth - gap, barH * 0.3);

        x += barWidth;
      }
    };
    draw();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // Draw static idle bars
    if (this.canvas) {
      this.drawIdle();
    }
  }

  drawIdle() {
    if (!this.canvas) return;
    const w = this.canvas.width = this.canvas.offsetWidth * 2;
    const h = this.canvas.height = this.canvas.offsetHeight * 2;
    this.ctx.clearRect(0, 0, w, h);
    const bars = 64;
    const barW = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = 0.05 + Math.sin(i * 0.3) * 0.04;
      this.ctx.fillStyle = 'rgba(51,51,51,0.8)';
      this.ctx.fillRect(i * barW, h - v * h, barW - 2, v * h);
    }
  }
}

// Waveform instances
const ttsWaveform = new WaveformVisualizer('tts-waveform');
const audiobookWaveform = new WaveformVisualizer('audiobook-waveform');
const historyWaveform = new WaveformVisualizer('history-waveform');

// ── Initialization ──
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  await loadVoices();
  renderVoices();
  populateVoiceSelects();
  setupTTSForm();
  setupAudiobookForm();
  setupChatForm();
  setupCompareForm();
  setupStreamForm();
  setupHistoryExport();
  setupWaveforms();
  checkHealth();
}

// ── Tab Navigation ──
function setupTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById(tab + '-tab').classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Load history when tab is selected
  if (tab === 'history') {
    loadHistory();
  }
}

// ── Health Check ──
async function checkHealth() {
  try {
    const res = await fetch(API + '/health');
    const data = await res.json();
    const el = document.getElementById('health-status');
    if (el) {
      el.textContent = data.status === 'healthy' ? 'SYSTEM ONLINE' : 'OFFLINE';
      el.previousElementSibling.style.background = data.status === 'healthy' ? '#22C55E' : '#FF3B30';
    }
  } catch (e) {
    const el = document.getElementById('health-status');
    if (el) {
      el.textContent = 'OFFLINE';
      el.previousElementSibling.style.background = '#FF3B30';
    }
  }
}

// ── Load Voices ──
async function loadVoices() {
  try {
    const res = await fetch(API + '/voices');
    const data = await res.json();
    voices = data.voices;
  } catch (e) {
    console.error('Failed to load voices:', e);
    voices = [];
  }
}

// ── Render Voice Explorer Grid ──
function renderVoices() {
  const grid = document.getElementById('voice-grid');
  if (!grid) return;
  grid.innerHTML = '';

  voices.forEach((voice, idx) => {
    const card = document.createElement('div');
    card.className = 'voice-card fade-in';
    card.style.animationDelay = (idx * 30) + 'ms';
    card.dataset.testid = 'voice-card-' + voice.id;

    const initials = voice.name.substring(0, 2).toUpperCase();

    card.innerHTML = `
      <div class="voice-card-header">
        <div class="voice-avatar">${initials}</div>
        <div class="voice-card-info">
          <div class="voice-name">${voice.name}</div>
          <div class="voice-id">${voice.id} / ${voice.accent}</div>
        </div>
      </div>
      <div class="voice-desc">${voice.description}</div>
      <div class="voice-tags">
        <span class="voice-tag">${voice.style}</span>
        <span class="voice-tag">${voice.gender}</span>
        <span class="voice-tag">${voice.accent}</span>
      </div>
      <div class="voice-card-actions">
        <button class="btn-play" data-testid="play-sample-${voice.id}" data-voice-id="${voice.id}">
          <i class="ph ph-play"></i> Play
        </button>
        <button class="btn-select" data-testid="select-voice-${voice.id}" data-voice-id="${voice.id}">
          <i class="ph ph-arrow-right"></i> Use
        </button>
      </div>
    `;

    // Play sample
    card.querySelector('.btn-play').addEventListener('click', (e) => {
      e.stopPropagation();
      playSample(voice.id, card.querySelector('.btn-play'));
    });

    // Select voice for TTS
    card.querySelector('.btn-select').addEventListener('click', (e) => {
      e.stopPropagation();
      selectVoiceForTTS(voice.id);
    });

    grid.appendChild(card);
  });
}

// ── Play Voice Sample ──
async function playSample(voiceId, btn) {
  // Stop current audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    if (currentPlayingCard) {
      currentPlayingCard.classList.remove('playing');
      currentPlayingCard.innerHTML = '<i class="ph ph-play"></i> Play';
    }
  }

  if (currentPlayingCard === btn) {
    currentPlayingCard = null;
    return;
  }

  btn.classList.add('playing');
  btn.innerHTML = '<i class="ph ph-spinner"></i> Loading';

  try {
    const audio = new Audio(API + '/voice-sample/' + voiceId);
    currentAudio = audio;
    currentPlayingCard = btn;

    audio.addEventListener('canplay', () => {
      btn.innerHTML = '<i class="ph ph-stop"></i> Stop';
      audio.play();
    });

    audio.addEventListener('ended', () => {
      btn.classList.remove('playing');
      btn.innerHTML = '<i class="ph ph-play"></i> Play';
      currentAudio = null;
      currentPlayingCard = null;
    });

    audio.addEventListener('error', () => {
      btn.classList.remove('playing');
      btn.innerHTML = '<i class="ph ph-play"></i> Play';
      currentAudio = null;
      currentPlayingCard = null;
    });
  } catch (e) {
    btn.classList.remove('playing');
    btn.innerHTML = '<i class="ph ph-play"></i> Play';
  }
}

// ── Select voice and jump to TTS ──
function selectVoiceForTTS(voiceId) {
  const select = document.getElementById('tts-voice-select');
  if (select) {
    select.value = voiceId;
    select.dispatchEvent(new Event('change'));
  }
  switchTab('tts');
  // Focus the text area
  const textarea = document.getElementById('tts-text');
  if (textarea) setTimeout(function() { textarea.focus(); }, 100);
}

// ── Populate Voice Selects ──
function populateVoiceSelects() {
  const selects = ['tts-voice-select', 'narrator-voice-select', 'stream-voice-select'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name + ' — ' + v.style + ' (' + v.accent + ')';
      sel.appendChild(opt);
    });
  });

  // Character voices multi-select (checkboxes)
  const charContainer = document.getElementById('char-voices-list');
  if (charContainer) {
    charContainer.innerHTML = '';
    voices.forEach(v => {
      const label = document.createElement('label');
      label.className = 'char-voice-option';
      label.innerHTML = `
        <input type="checkbox" value="${v.id}" data-testid="char-voice-${v.id}">
        <span>${v.name}</span>
      `;
      charContainer.appendChild(label);
    });
  }

  // Compare voices multi-select
  const compareContainer = document.getElementById('compare-voices-list');
  if (compareContainer) {
    compareContainer.innerHTML = '';
    voices.forEach(v => {
      const label = document.createElement('label');
      label.className = 'compare-voice-option';
      label.innerHTML = `
        <input type="checkbox" value="${v.id}" data-testid="compare-voice-${v.id}">
        <span>${v.name} <span style="color:#52525B;font-size:11px;">(${v.accent})</span></span>
      `;
      const cb = label.querySelector('input');
      cb.addEventListener('change', updateCompareCount);
      compareContainer.appendChild(label);
    });
  }
}

// ── TTS Form ──
function setupTTSForm() {
  const textarea = document.getElementById('tts-text');
  const charCount = document.getElementById('tts-char-count');
  const speedSlider = document.getElementById('tts-speed');
  const speedValue = document.getElementById('tts-speed-value');
  const generateBtn = document.getElementById('tts-generate-btn');

  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      charCount.textContent = textarea.value.length + ' / 4096';
    });
  }

  if (speedSlider && speedValue) {
    speedSlider.addEventListener('input', () => {
      speedValue.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x';
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', generateTTS);
  }
}

async function generateTTS() {
  const text = document.getElementById('tts-text').value.trim();
  const voiceId = document.getElementById('tts-voice-select').value;
  const speed = parseFloat(document.getElementById('tts-speed').value);
  const btn = document.getElementById('tts-generate-btn');
  const result = document.getElementById('tts-result');

  if (!text) return;

  btn.disabled = true;
  btn.textContent = 'GENERATING...';

  try {
    const res = await fetch(API + '/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId, speed })
    });

    const data2 = await res.json();
    if (!res.ok) {
      throw new Error(data2.detail || 'Generation failed');
    }

    // Show result
    result.classList.add('visible');
    // Redraw waveform idle state now that container is visible
    setTimeout(function() { ttsWaveform.drawIdle(); }, 50);
    const audioEl = result.querySelector('audio');
    const audioUrl = API + '/audio/' + data2.id;
    audioEl.src = audioUrl;

    const infoEl = result.querySelector('.audio-result-info span');
    if (infoEl) infoEl.textContent = 'Voice: ' + data2.voice_name + ' | ' + data2.text_length + ' chars';

    const dlBtn = result.querySelector('.btn-download');
    if (dlBtn) {
      dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = 'openvoice-tts-' + data2.id + '.mp3';
        a.click();
      };
    }
  } catch (e) {
    alert('TTS Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'GENERATE SPEECH';
  }
}

// ── Audiobook Form ──
function setupAudiobookForm() {
  const fileInput = document.getElementById('audiobook-file');
  const textarea = document.getElementById('audiobook-text');
  const previewBtn = document.getElementById('audiobook-preview-btn');
  const generateBtn = document.getElementById('audiobook-generate-btn');

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(API + '/upload', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Upload failed');
        }

        textarea.value = data.text;

        const info = document.getElementById('upload-info');
        if (info) {
          info.textContent = data.filename + ' — ' + data.word_count + ' words, ' + data.paragraph_count + ' paragraphs';
          info.style.display = 'block';
        }
      } catch (e) {
        alert('Upload Error: ' + e.message);
      }
    });
  }

  if (previewBtn) {
    previewBtn.addEventListener('click', previewSegments);
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', generateAudiobook);
  }
}

function previewSegments() {
  const text = document.getElementById('audiobook-text').value.trim();
  const container = document.getElementById('segments-preview');
  if (!text || !container) return;

  // Parse dialogue client-side for preview
  const pattern = /(\u201c[^\u201d]*\u201d|"[^"]*"|'[^']*')/g;
  const parts = text.split(pattern);
  container.innerHTML = '';

  parts.forEach(part => {
    part = part.trim();
    if (!part) return;

    const isDialogue = (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('\u201c') && part.endsWith('\u201d'))
    );

    const div = document.createElement('div');
    div.className = 'segment-item';
    div.innerHTML = `
      <span class="segment-badge ${isDialogue ? 'dialogue' : 'narration'}">${isDialogue ? 'DLG' : 'NAR'}</span>
      <span class="segment-text">${escapeHtml(part.substring(0, 120))}${part.length > 120 ? '...' : ''}</span>
    `;
    container.appendChild(div);
  });

  container.style.display = 'block';
}

async function generateAudiobook() {
  const text = document.getElementById('audiobook-text').value.trim();
  const narratorId = document.getElementById('narrator-voice-select').value;
  const btn = document.getElementById('audiobook-generate-btn');
  const result = document.getElementById('audiobook-result');

  if (!text) return;

  // Get selected character voices
  const checkboxes = document.querySelectorAll('#char-voices-list input[type="checkbox"]:checked');
  const charVoiceIds = Array.from(checkboxes).map(cb => cb.value);

  btn.disabled = true;
  btn.textContent = 'GENERATING AUDIOBOOK...';

  try {
    const body = {
      text,
      narrator_voice_id: narratorId
    };
    if (charVoiceIds.length > 0) {
      body.character_voice_ids = charVoiceIds;
    }

    const res = await fetch(API + '/audiobook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Generation failed');
    }

    result.classList.add('visible');
    // Redraw waveform idle state now that container is visible
    setTimeout(function() { audiobookWaveform.drawIdle(); }, 50);
    const audioEl = result.querySelector('audio');
    const audioUrl = API + '/audio/' + data.id;
    audioEl.src = audioUrl;

    const infoEl = result.querySelector('.audio-result-info span');
    if (infoEl) infoEl.textContent = data.segments_count + ' segments | Narrator: ' + data.narrator_voice + ' | Characters: ' + data.character_voices.join(', ');

    const dlBtn = result.querySelector('.btn-download');
    if (dlBtn) {
      dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = 'openvoice-audiobook-' + data.id + '.mp3';
        a.click();
      };
    }
  } catch (e) {
    alert('Audiobook Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'GENERATE AUDIOBOOK';
  }
}

// ── Chat ──
function setupChatForm() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  if (sendBtn) sendBtn.addEventListener('click', sendChat);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const messagesContainer = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');

  // Add user message
  appendChatMessage('user', message);
  input.value = '';
  sendBtn.disabled = true;

  // Add loading indicator
  const loadingId = 'loading-' + Date.now();
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-msg assistant';
  loadingDiv.id = loadingId;
  loadingDiv.innerHTML = `
    <div class="chat-msg-role">assistant</div>
    <div class="chat-msg-content">
      <div class="loading-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  messagesContainer.appendChild(loadingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const res = await fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: chatSessionId })
    });

    const data = await res.json();
    chatSessionId = data.session_id;

    // Remove loading, add response
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    appendChatMessage('assistant', data.response);
  } catch (e) {
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();
    appendChatMessage('assistant', 'Error: ' + e.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendChatMessage(role, content) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role + ' fade-in';

  let rendered;
  if (role === 'assistant') {
    try {
      rendered = parseMarkdown(content);
    } catch(e) {
      rendered = escapeHtml(content);
    }
  } else {
    rendered = escapeHtml(content);
  }

  div.innerHTML = `
    <div class="chat-msg-role">${role}</div>
    <div class="chat-msg-content">${rendered}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Remove empty state
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();
}

// ── Waveform Setup ──
function setupWaveforms() {
  // Draw idle state on all waveform canvases
  [ttsWaveform, audiobookWaveform, historyWaveform].forEach(wf => wf.drawIdle());

  // Connect TTS audio player to waveform
  const ttsAudio = document.querySelector('#tts-result audio');
  if (ttsAudio) {
    ttsAudio.addEventListener('play', () => {
      ttsWaveform.connect(ttsAudio);
      ttsWaveform.start();
    });
    ttsAudio.addEventListener('pause', () => ttsWaveform.stop());
    ttsAudio.addEventListener('ended', () => ttsWaveform.stop());
  }

  // Connect audiobook audio player to waveform
  const abAudio = document.querySelector('#audiobook-result audio');
  if (abAudio) {
    abAudio.addEventListener('play', () => {
      audiobookWaveform.connect(abAudio);
      audiobookWaveform.start();
    });
    abAudio.addEventListener('pause', () => audiobookWaveform.stop());
    abAudio.addEventListener('ended', () => audiobookWaveform.stop());
  }

  // Connect history audio player to waveform
  const histAudio = document.querySelector('#history-player audio');
  if (histAudio) {
    histAudio.addEventListener('play', () => {
      historyWaveform.connect(histAudio);
      historyWaveform.start();
    });
    histAudio.addEventListener('pause', () => historyWaveform.stop());
    histAudio.addEventListener('ended', () => historyWaveform.stop());
  }
}

// ── Generation History ──
async function loadHistory() {
  const container = document.getElementById('history-container');
  if (!container) return;

  try {
    const res = await fetch(API + '/history');
    const data = await res.json();
    const gens = data.generations || [];

    if (gens.length === 0) {
      container.innerHTML = `
        <div class="history-empty">
          <i class="ph ph-clock-counter-clockwise" style="font-size:40px;display:block;margin-bottom:12px;opacity:0.3;"></i>
          No generations yet. Use TTS Studio or Audiobook Studio to create audio.
        </div>
      `;
      return;
    }

    let html = `
      <div class="history-table">
        <div class="history-header">
          <span>#</span>
          <span>Type</span>
          <span>Voice</span>
          <span>Text</span>
          <span>Date</span>
          <span>Action</span>
        </div>
    `;

    gens.forEach((gen, idx) => {
      const date = gen.created_at ? new Date(gen.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '—';
      const textPreview = gen.text ? gen.text.substring(0, 80) + (gen.text.length > 80 ? '...' : '') : '—';
      const typeClass = gen.type === 'audiobook' ? 'audiobook' : 'tts';

      html += `
        <div class="history-row fade-in" style="animation-delay:${idx * 30}ms" data-testid="history-row-${gen.id}" data-audio-url="${gen.audio_url}" data-gen-id="${gen.id}" data-voice="${gen.voice_name}" data-type="${gen.type}">
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#52525B;">${String(idx + 1).padStart(2, '0')}</span>
          <span><span class="history-type-badge ${typeClass}">${gen.type}</span></span>
          <span class="history-voice">${gen.voice_name}</span>
          <span class="history-text">${escapeHtml(textPreview)}</span>
          <span class="history-date">${date}</span>
          <span><button class="history-play-btn" data-testid="history-play-${gen.id}"><i class="ph ph-play"></i> Play</button></span>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Attach click handlers to play buttons
    container.querySelectorAll('.history-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.history-row');
        playHistoryItem(row.dataset.audioUrl, row.dataset.voiceName || row.dataset.voice, row.dataset.type, row.dataset.genId);
      });
    });

    // Also allow clicking the row
    container.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', () => {
        playHistoryItem(row.dataset.audioUrl, row.dataset.voice, row.dataset.type, row.dataset.genId);
      });
    });

  } catch (e) {
    container.innerHTML = `<div class="history-empty">Failed to load history: ${e.message}</div>`;
  }
}

function playHistoryItem(audioUrl, voiceName, type, genId) {
  const player = document.getElementById('history-player');
  const audio = player.querySelector('audio');
  const info = document.getElementById('history-player-info');
  const dlBtn = player.querySelector('.btn-download');

  const fullUrl = API.replace('/api', '') + audioUrl;
  audio.src = fullUrl;
  audio.play();
  player.classList.add('visible');
  setTimeout(function() { historyWaveform.drawIdle(); }, 50);

  info.textContent = type.toUpperCase() + ' | Voice: ' + voiceName + ' | ID: ' + genId.substring(0, 8);

  dlBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = 'openvoice-' + type + '-' + genId + '.mp3';
    a.click();
  };
}

// ── Voice Compare ──
function updateCompareCount() {
  const checked = document.querySelectorAll('#compare-voices-list input:checked');
  const countEl = document.getElementById('compare-selected-count');
  if (countEl) countEl.textContent = checked.length + ' voices selected';
}

function setupCompareForm() {
  const btn = document.getElementById('compare-generate-btn');
  if (btn) btn.addEventListener('click', generateComparison);
}

async function generateComparison() {
  const text = document.getElementById('compare-text').value.trim();
  const checkboxes = document.querySelectorAll('#compare-voices-list input:checked');
  const voiceIds = Array.from(checkboxes).map(cb => cb.value);
  const btn = document.getElementById('compare-generate-btn');
  const resultsDiv = document.getElementById('compare-results');
  const grid = document.getElementById('compare-grid');

  if (!text) { alert('Enter comparison text'); return; }
  if (voiceIds.length < 2) { alert('Select at least 2 voices'); return; }
  if (voiceIds.length > 6) { alert('Maximum 6 voices'); return; }

  btn.disabled = true;
  btn.textContent = 'GENERATING ' + voiceIds.length + ' VOICES...';
  resultsDiv.style.display = 'none';

  try {
    const res = await fetch(API + '/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_ids: voiceIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Comparison failed');

    grid.innerHTML = '';
    data.results.forEach(function(r) {
      const card = document.createElement('div');
      card.className = 'compare-result-card fade-in';
      if (r.audio_url) {
        const audioUrl = API.replace('/api', '') + r.audio_url;
        card.innerHTML = `
          <div class="card-header">
            <div class="voice-avatar" style="width:32px;height:32px;font-size:12px;">${r.voice_name.substring(0,2).toUpperCase()}</div>
            <div>
              <div class="card-name">${r.voice_name}</div>
              <div class="card-meta">${r.accent} / ${r.style}</div>
            </div>
          </div>
          <audio controls src="${audioUrl}" data-testid="compare-audio-${r.voice_id}"></audio>
          <button class="btn-download" onclick="(function(){var a=document.createElement('a');a.href='${audioUrl}';a.download='compare-${r.voice_name}.mp3';a.click();})()">
            <i class="ph ph-download-simple"></i> Download
          </button>
        `;
      } else {
        card.innerHTML = `
          <div class="card-header">
            <div class="voice-avatar" style="width:32px;height:32px;font-size:12px;">${r.voice_name.substring(0,2).toUpperCase()}</div>
            <div>
              <div class="card-name">${r.voice_name}</div>
              <div class="card-meta" style="color:#FF3B30;">Generation failed</div>
            </div>
          </div>
        `;
      }
      grid.appendChild(card);
    });

    resultsDiv.style.display = 'block';
  } catch (e) {
    alert('Compare Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'COMPARE VOICES';
  }
}

// ── Streaming TTS ──
let streamAudioQueue = [];
let streamIsPlaying = false;
let streamCurrentAudio = null;

function setupStreamForm() {
  const textarea = document.getElementById('stream-text');
  const countEl = document.getElementById('stream-char-count');
  const btn = document.getElementById('stream-generate-btn');

  if (textarea && countEl) {
    textarea.addEventListener('input', function() {
      countEl.textContent = textarea.value.length + ' chars';
    });
  }
  if (btn) btn.addEventListener('click', startStreaming);
}

async function startStreaming() {
  const text = document.getElementById('stream-text').value.trim();
  const voiceId = document.getElementById('stream-voice-select').value;
  const btn = document.getElementById('stream-generate-btn');
  const progress = document.getElementById('stream-progress');
  const progressBar = document.getElementById('stream-progress-bar');
  const progressText = document.getElementById('stream-progress-text');
  const chunksDiv = document.getElementById('stream-chunks');
  const chunkList = document.getElementById('stream-chunk-list');
  const combined = document.getElementById('stream-combined');

  if (!text) { alert('Enter text for streaming generation'); return; }

  // Reset state
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-broadcast"></i> STREAMING...';
  progress.style.display = 'block';
  progressBar.style.width = '5%';
  progressText.textContent = 'Connecting...';
  chunksDiv.style.display = 'block';
  chunkList.innerHTML = '';
  combined.classList.remove('visible');
  streamAudioQueue = [];
  streamIsPlaying = false;
  streamCurrentAudio = null;
  chunkPlayIndex = 0;

  let totalChunks = 0;
  let generatedCount = 0;

  try {
    const res = await fetch(API + '/stream-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(line.slice(6)); } catch { continue; }

        if (data.type === 'start') {
          totalChunks = data.total_chunks;
          progressText.textContent = '0 / ' + totalChunks + ' chunks';
        }

        if (data.type === 'chunk') {
          generatedCount++;
          const pct = (generatedCount / totalChunks) * 100;
          progressBar.style.width = pct + '%';
          progressText.textContent = generatedCount + ' / ' + totalChunks + ' chunks';

          const audioUrl = API.replace('/api', '') + data.audio_url;
          streamAudioQueue.push(audioUrl);

          // Add chunk to playlist UI
          const chunkEl = document.createElement('div');
          chunkEl.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141414;';
          chunkEl.dataset.testid = 'stream-chunk-' + data.chunk_index;
          chunkEl.innerHTML = '<span style="font-family:JetBrains Mono,monospace;font-size:10px;color:#52525B;width:30px;">' + String(data.chunk_index + 1).padStart(2, '0') + '</span>' +
            '<div style="flex:1;height:2px;background:#333;position:relative;"><div class="chunk-bar" style="height:100%;background:#22C55E;width:0%;transition:width 1s;"></div></div>' +
            '<span class="chunk-status" style="font-family:JetBrains Mono,monospace;font-size:9px;color:#22C55E;letter-spacing:0.08em;">READY</span>';
          chunkList.appendChild(chunkEl);
          chunkList.scrollTop = chunkList.scrollHeight;

          // Start playing if not already
          if (!streamIsPlaying) {
            playNextChunk();
          }
        }

        if (data.type === 'error') {
          generatedCount++;
          const chunkEl = document.createElement('div');
          chunkEl.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141414;';
          chunkEl.innerHTML = '<span style="font-family:JetBrains Mono,monospace;font-size:10px;color:#52525B;width:30px;">' + String(data.chunk_index + 1).padStart(2, '0') + '</span>' +
            '<div style="flex:1;"></div><span style="font-family:JetBrains Mono,monospace;font-size:9px;color:#FF3B30;">FAILED</span>';
          chunkList.appendChild(chunkEl);
        }

        if (data.type === 'done') {
          progressBar.style.width = '100%';
          progressText.textContent = 'Complete — ' + data.total_generated + ' chunks';

          if (data.combined_url) {
            const combinedUrl = API.replace('/api', '') + data.combined_url;
            combined.classList.add('visible');
            combined.querySelector('audio').src = combinedUrl;
            document.getElementById('stream-combined-info').textContent = data.total_generated + ' chunks combined';

            const dlBtn = combined.querySelector('.btn-download');
            dlBtn.onclick = function() {
              var a = document.createElement('a');
              a.href = combinedUrl;
              a.download = 'openvoice-stream-' + data.combined_id + '.mp3';
              a.click();
            };
          }
        }
      }
    }
  } catch (e) {
    alert('Streaming Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-broadcast"></i> STREAM GENERATE';
  }
}

let chunkPlayIndex = 0;

function playNextChunk() {
  if (chunkPlayIndex >= streamAudioQueue.length) {
    streamIsPlaying = false;
    return;
  }

  streamIsPlaying = true;
  const url = streamAudioQueue[chunkPlayIndex];
  const audio = new Audio(url);
  streamCurrentAudio = audio;

  // Update chunk UI
  const chunkItems = document.querySelectorAll('#stream-chunk-list > div');
  if (chunkItems[chunkPlayIndex]) {
    const bar = chunkItems[chunkPlayIndex].querySelector('.chunk-bar');
    const status = chunkItems[chunkPlayIndex].querySelector('.chunk-status');
    if (status) { status.textContent = 'PLAYING'; status.style.color = '#FF3B30'; }

    audio.addEventListener('timeupdate', function() {
      if (audio.duration && bar) {
        bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
      }
    });
  }

  audio.addEventListener('ended', function() {
    if (chunkItems[chunkPlayIndex]) {
      const status = chunkItems[chunkPlayIndex].querySelector('.chunk-status');
      const bar = chunkItems[chunkPlayIndex].querySelector('.chunk-bar');
      if (status) { status.textContent = 'DONE'; status.style.color = '#52525B'; }
      if (bar) bar.style.width = '100%';
    }
    chunkPlayIndex++;
    playNextChunk();
  });

  audio.addEventListener('error', function() {
    chunkPlayIndex++;
    playNextChunk();
  });

  audio.play().catch(function() {
    // Auto-play blocked, user needs to interact
    if (chunkItems[chunkPlayIndex]) {
      const status = chunkItems[chunkPlayIndex].querySelector('.chunk-status');
      if (status) { status.textContent = 'CLICK TO PLAY'; status.style.color = '#E2FF4A'; status.style.cursor = 'pointer';
        status.onclick = function() { audio.play(); };
      }
    }
  });
}

// ── History Export ──
function setupHistoryExport() {
  const jsonBtn = document.getElementById('export-json-btn');
  const csvBtn = document.getElementById('export-csv-btn');

  if (jsonBtn) jsonBtn.addEventListener('click', function() { exportHistory('json'); });
  if (csvBtn) csvBtn.addEventListener('click', function() { exportHistory('csv'); });
}

function exportHistory(format) {
  const url = API + '/history/export?format=' + format;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openvoice_history.' + format;
  a.click();
}

// ── Utilities ──
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Lightweight markdown parser
function parseMarkdown(text) {
  if (!text) return '';
  let html = text;
  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  // Unordered lists
  html = html.replace(/^[\s]*[-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, function(match) { return '<ul>' + match + '</ul>'; });
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Tables
  html = html.replace(/^\|(.+)\|$/gm, function(match, content) {
    const cells = content.split('|').map(function(c) { return c.trim(); });
    if (cells.every(function(c) { return /^[-:]+$/.test(c); })) return '';
    return '<tr>' + cells.map(function(c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\n|$))+/g, function(match) { return '<table>' + match + '</table>'; });
  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  if (!html.startsWith('<')) html = '<p>' + html + '</p>';
  return html;
}
