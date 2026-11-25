/* ============================================================================
   ESCAPE: MAKMAL AGRO
   Program Sains Pertanian (Semester 1) · Makmal Agro
   Bahagian 1: Asas Permainan, Pendaftaran, Cutscene 4-Panel, Pemasa 3-Fasa,
               Navigasi 5 Bilik, Inventori, Buku Nota Kuliah & Papan Pemuka Admin
   ============================================================================ */

'use strict';

// ============================================================================
// 1. KONSTANTA & KONFIGURASI SISTEM
// ============================================================================

const STORAGE_KEY = 'agro_escape_records';
const ADMIN_PIN = String.fromCharCode(85, 80, 83, 73) + '2026';
const GOOGLE_SHEET_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbz95knDvzW4eCagCEP3nOucc2Zs2Y9GK20UrpF7CNLmYeLvMJyPY47tCZ3NSxN_Bbof/exec';
const TOTAL_GAME_SECONDS = 600; // 10:00 minit
const MAX_INVENTORY_SLOTS = 6;

const TOPIC_LABELS = {
  npk_nutrien: 'Simptom NPK (Rumah Hijau)',
  ph_tanah: 'pH Tanah & Pengapuran',
  tekstur_tanah: 'Segi Tiga Tekstur Tanah USDA',
  anatomi_tumbuhan: 'Anatomi Tumbuhan (Mikroskop)',
  nama_saintifik: 'Taksonomi Buah (Bio-Vault)',
  panel_ec: 'Kotak Fius & Panel EC',
  npk: 'Simptom NPK',
  soil_ph: 'pH Tanah & Kapur',
  texture: 'Tekstur Tanah USDA',
  botany: 'Botani & Mikroskop',
  fruit_vault: 'Taksonomi Buah (Bio-Vault)',
  general: 'Panel Kawalan / Umum',
};

const ROOMS = [
  {
    id: 'view1',
    code: 'BILIK 1',
    name: 'Pintu Keluar & Panel Kawalan',
    requiresSecretUnlock: false,
    enterThought:
      'Pintu keluli Makmal Agro ini terkunci rapat dengan kunci elektronik. Aku perlu sahkan semua protokol eksperimen untuk membukanya.',
  },
  {
    id: 'view2',
    code: 'BILIK 2',
    name: 'Meja Kerja & Dinding Carta Tanah',
    requiresSecretUnlock: false,
    enterThought:
      'Di sini ada carta Segitiga Tekstur Tanah USDA, kabinet sampel tanah, dan buku catatan Profesor Razak.',
  },
  {
    id: 'view3',
    code: 'BILIK 3',
    name: 'Sudut Mikroskop & Botani',
    requiresSecretUnlock: false,
    enterThought:
      'Meja mikroskop penuh dengan slaid keratan rentas batang monokotiledon dan dikotiledon.',
  },
  {
    id: 'view4',
    code: 'BILIK 4',
    name: 'Rumah Hijau Mini (Rak Semaian)',
    requiresSecretUnlock: false,
    enterThought:
      'Lampu tumbuhan menyala malap... Beberapa anak benih di rak semaian kelihatan menunjukkan simptom kekurangan nutrien.',
  },
  {
    id: 'view5',
    code: 'BILIK 5',
    name: 'Bilik Rahsia Makmal Agro',
    requiresSecretUnlock: true,
    enterThought:
      'Ini dia Bilik Rahsia Makmal Agro (Bio-Vault Profesor Razak)! Kod pelepasan pintu keluar pasti tersimpan di dalam peti keselamatan botani ini.',
  },
];

// ============================================================================
// 2. KEADAAN PERMAINAN PUSAT (GAME STATE)
// ============================================================================

function createInitialGameState() {
  return {
    playerName: '',
    matricNo: '',
    avatar: 'male',
    playerGender: 'Lelaki',
    startTime: null,
    playStartTime: null,
    startTimeISO: null,
    endTimeISO: null,
    currentView: 'view1',
    secretRoomUnlocked: false,
    remainingSeconds: TOTAL_GAME_SECONDS,
    totalElapsedSeconds: 0,
    mistakes: 0,
    mistakeBreakdown: {
      npk_nutrien: 0,
      ph_tanah: 0,
      tekstur_tanah: 0,
      anatomi_tumbuhan: 0,
      nama_saintifik: 0,
      panel_ec: 0,
      general: 0,
    },
    hintsUsed: 0,
    inventory: [], // Item: { id, name, icon, svg, description }
    selectedItem: null,
    selectedItemId: null,
    puzzles: {
      controlPanel: false,
      soilCabinet: false,
      phSolved: false,
      soilTriangle: false,
      microscope: false,
      greenhouseRack: false,
      npkCured: { A: false, B: false, C: false },
      bioVault: false,
    },
    flags: {
      phase2Warned: false,
      phase3Warned: false,
      pickedCopperKey: false,
      npkDrawerUnlocked: false,
      pickedBajaN: false,
      pickedBajaP: false,
      pickedBajaK: false,
      pickedSoilNote: false,
      testedSoilSamples: { s1: false, s2: false, s3: false },
      treatedSoilSamples: { s1: false, s2: false, s3: false },
      activePhSample: null,
      pickedMagnifier: false,
      pickedGlassSlide: false,
      slideBoxUnlocked: false,
      pickedScrewdriver: false,
      soilTriState: { clay: 35, silt: 30, sand: 35 },
      pickedMainFuse: false,
      pickedEcNote: false,
      fusePanelOpened: false,
      mainFuseInstalled: false,
      ecValue: 0.5,
    },
    isGameActive: false,
    isTimerPaused: false,
    pauseStartedAt: null,
    totalPausedMs: 0,
    recordSaved: false,
  };
}

let gameState = createInitialGameState();
let timerIntervalId = null;
let soundEnabled = true;
let lastCompletedRecord = null;

// Keadaan Cutscene
let activeCutscene = {
  panels: [],
  index: 0,
  charIndex: 0,
  typingTimer: null,
  isTyping: false,
  onComplete: null,
};

// ============================================================================
// 3. ENJIN BUNYI SINTESIS (soundManager — WEB AUDIO API TANPA FAIL LUAR)
// ============================================================================

const soundManager = (() => {
  let ctx = null;
  let muted = false;
  let bgmSessionId = 0;
  let bgmTimerId = null;
  let currentBgmTrack = null;
  let desiredBgmTrack = null;
  let currentBgmBus = null;
  let bgmMasterCompressor = null;
  let activeBgmVoices = [];

  function getContext() {
    if (muted) return null;
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        ctx = new AudioContextClass();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function unlock() {
    if (muted) return null;
    return getContext();
  }

  function isMuted() {
    return muted;
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    soundEnabled = !muted;
    if (muted) {
      stopBGM(0.08, false);
    } else {
      unlock();
      if (desiredBgmTrack) {
        playBGM(desiredBgmTrack);
      }
    }
    return muted;
  }

  function toggleMute() {
    setMuted(!muted);
    if (!muted) {
      playClick();
    }
    return muted;
  }

  function playClick() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
      gain.gain.setValueAtTime(0.085, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // Abaikan jika audio disekat
    }
  }

  function playTypewriter() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680 + Math.random() * 140, now);
      gain.gain.setValueAtTime(0.018, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.025);
    } catch {
      // Abaikan jika audio disekat
    }
  }

  function playSuccess() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.085);
        gain.gain.setValueAtTime(0.11, now + idx * 0.085);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.085 + 0.18);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + idx * 0.085);
        osc.stop(now + idx * 0.085 + 0.2);
      });
    } catch {
      // Abaikan
    }
  }

  function playTimeBonus() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.075);
        gain.gain.setValueAtTime(0.11, now + idx * 0.075);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.22);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + idx * 0.075);
        osc.stop(now + idx * 0.075 + 0.24);
      });
    } catch {
      // Abaikan
    }
  }

  function playError() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const osc1 = audio.createOscillator();
      const osc2 = audio.createOscillator();
      const gain = audio.createGain();
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(185, now);
      osc1.frequency.linearRampToValueAtTime(110, now + 0.28);
      osc2.frequency.setValueAtTime(138, now);
      osc2.frequency.linearRampToValueAtTime(84, now + 0.28);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.31);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audio.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.33);
      osc2.stop(now + 0.33);
    } catch {
      // Abaikan
    }
  }

  function playHeavyDoor() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      // Gemuruh rendah pintu besi / rak buku bergerak
      const rumble = audio.createOscillator();
      const rumbleGain = audio.createGain();
      rumble.type = 'sawtooth';
      rumble.frequency.setValueAtTime(95, now);
      rumble.frequency.exponentialRampToValueAtTime(36, now + 0.55);
      rumbleGain.gain.setValueAtTime(0.16, now);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      rumble.connect(rumbleGain).connect(audio.destination);
      rumble.start(now);
      rumble.stop(now + 0.6);

      // Dentuman logam kunci
      const clank = audio.createOscillator();
      const clankGain = audio.createGain();
      clank.type = 'square';
      clank.frequency.setValueAtTime(240, now + 0.08);
      clank.frequency.exponentialRampToValueAtTime(68, now + 0.34);
      clankGain.gain.setValueAtTime(0.11, now + 0.08);
      clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      clank.connect(clankGain).connect(audio.destination);
      clank.start(now + 0.08);
      clank.stop(now + 0.38);
    } catch {
      // Abaikan
    }
  }

  function playAlarm() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      [0, 0.22].forEach((offset) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(680, now + offset);
        osc.frequency.linearRampToValueAtTime(480, now + offset + 0.16);
        gain.gain.setValueAtTime(0.09, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.19);
      });
    } catch {
      // Abaikan
    }
  }

  function playPage() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Abaikan
    }
  }

  function triggerSingleTick(freq, vol) {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.025);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch {
      // Abaikan
    }
  }

  function playDoorSlamLock() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      // 1. Dentuman besi pintu berat tertutup
      const thud = audio.createOscillator();
      const thudGain = audio.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(125, now);
      thud.frequency.exponentialRampToValueAtTime(32, now + 0.28);
      thudGain.gain.setValueAtTime(0.28, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      thud.connect(thudGain).connect(audio.destination);
      thud.start(now);
      thud.stop(now + 0.34);

      // Ledakan hentaman mekanikal ringkas (white noise bertapis)
      const bufSize = Math.floor(audio.sampleRate * 0.14);
      const noiseBuf = audio.createBuffer(1, bufSize, audio.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.28));
      }
      const noise = audio.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, now);
      const nGain = audio.createGain();
      nGain.gain.setValueAtTime(0.18, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      noise.connect(filter).connect(nGain).connect(audio.destination);
      noise.start(now);

      // 2. Kunci magnetik elektronik mengunci rapat (+0.14s)
      const clank = audio.createOscillator();
      const clankGain = audio.createGain();
      clank.type = 'square';
      clank.frequency.setValueAtTime(1180, now + 0.14);
      clank.frequency.exponentialRampToValueAtTime(340, now + 0.26);
      clankGain.gain.setValueAtTime(0.12, now + 0.14);
      clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      clank.connect(clankGain).connect(audio.destination);
      clank.start(now + 0.14);
      clank.stop(now + 0.3);

      const lockTone = audio.createOscillator();
      const lockGain = audio.createGain();
      lockTone.type = 'sine';
      lockTone.frequency.setValueAtTime(1480, now + 0.22);
      lockTone.frequency.setValueAtTime(980, now + 0.28);
      lockGain.gain.setValueAtTime(0.075, now + 0.22);
      lockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      lockTone.connect(lockGain).connect(audio.destination);
      lockTone.start(now + 0.22);
      lockTone.stop(now + 0.4);
    } catch {
      // Abaikan
    }
  }

  function playGasHiss() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      const duration = 1.65;
      const bufSize = Math.floor(audio.sampleRate * duration);
      const noiseBuf = audio.createBuffer(1, bufSize, audio.sampleRate);
      const output = noiseBuf.getChannelData(0);

      // Penapisan merah jambu (pink noise) untuk desiran gas pensterilan
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < bufSize; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        output[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }

      const source = audio.createBufferSource();
      source.buffer = noiseBuf;

      const bandpass = audio.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(2700, now);
      bandpass.frequency.exponentialRampToValueAtTime(1150, now + duration);
      bandpass.Q.setValueAtTime(1.3, now);

      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.002, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.18);
      gain.gain.setValueAtTime(0.19, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      source.connect(bandpass).connect(gain).connect(audio.destination);
      source.start(now);
      source.stop(now + duration + 0.02);
    } catch {
      // Abaikan
    }
  }

  function playLoseSound() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      // Jujukan nada minor menurun yang sayu (A4 -> F4 -> D4 -> A3)
      const notes = [
        { freq: 440.0, start: 0.0, dur: 0.34, vol: 0.1 },
        { freq: 349.23, start: 0.28, dur: 0.34, vol: 0.095 },
        { freq: 293.66, start: 0.56, dur: 0.38, vol: 0.09 },
        { freq: 220.0, start: 0.86, dur: 0.95, vol: 0.11 },
      ];

      notes.forEach((n) => {
        const osc = audio.createOscillator();
        const sub = audio.createOscillator();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();

        osc.type = 'triangle';
        sub.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        sub.frequency.setValueAtTime(n.freq * 0.5, now + n.start);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(980, now + n.start);
        filter.frequency.exponentialRampToValueAtTime(260, now + n.start + n.dur);

        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain).connect(audio.destination);

        osc.start(now + n.start);
        sub.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.04);
        sub.stop(now + n.start + n.dur + 0.04);
      });
    } catch {
      // Abaikan
    }
  }

  function playDoorOpen() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      // 1. Selak mekanikal terlepas (klik logam dalam + bip nyahkunci)
      const latch = audio.createOscillator();
      const latchGain = audio.createGain();
      latch.type = 'triangle';
      latch.frequency.setValueAtTime(240, now);
      latch.frequency.exponentialRampToValueAtTime(520, now + 0.09);
      latchGain.gain.setValueAtTime(0.14, now);
      latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      latch.connect(latchGain).connect(audio.destination);
      latch.start(now);
      latch.stop(now + 0.14);

      const chime = audio.createOscillator();
      const chimeGain = audio.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(880, now + 0.09);
      chimeGain.gain.setValueAtTime(0.07, now + 0.09);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      chime.connect(chimeGain).connect(audio.destination);
      chime.start(now + 0.09);
      chime.stop(now + 0.26);

      // 2. Desiran pintu gelangsar pneumatik terbuka (+0.15s)
      const dur = 0.8;
      const bufSize = Math.floor(audio.sampleRate * dur);
      const noiseBuf = audio.createBuffer(1, bufSize, audio.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = audio.createBufferSource();
      source.buffer = noiseBuf;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(340, now + 0.15);
      filter.frequency.exponentialRampToValueAtTime(980, now + 0.42);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.15 + dur);
      filter.Q.setValueAtTime(1.8, now + 0.15);

      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.001, now + 0.15);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + dur);

      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(now + 0.15);
      source.stop(now + 0.15 + dur + 0.02);
    } catch {
      // Abaikan
    }
  }

  function playWinFanfare() {
    const audio = getContext();
    if (!audio) return;
    const now = audio.currentTime;
    try {
      // Arpeggio major ceria (C5 -> E5 -> G5 -> C6) + kord kemenangan
      const arp = [
        { freq: 523.25, start: 0.0, dur: 0.24 },
        { freq: 659.25, start: 0.1, dur: 0.24 },
        { freq: 783.99, start: 0.2, dur: 0.26 },
        { freq: 1046.5, start: 0.32, dur: 0.72 },
      ];
      arp.forEach((note) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0.001, now + note.start);
        gain.gain.linearRampToValueAtTime(0.12, now + note.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.03);
      });

      // Kord sokongan hangat (C5 + E5 + G5)
      [523.25, 659.25, 783.99].forEach((freq) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.32);
        gain.gain.setValueAtTime(0.001, now + 0.32);
        gain.gain.linearRampToValueAtTime(0.055, now + 0.38);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + 0.32);
        osc.stop(now + 1.18);
      });
    } catch {
      // Abaikan
    }
  }

  function playTick(urgent = false) {
    if (muted) return;
    triggerSingleTick(urgent ? 1040 : 840, urgent ? 0.045 : 0.028);
    if (urgent) {
      setTimeout(() => {
        if (
          !muted &&
          gameState.isGameActive &&
          !gameState.isTimerPaused &&
          gameState.remainingSeconds > 0
        ) {
          triggerSingleTick(920, 0.036);
        }
      }, 480);
    }
  }

  function registerBgmVoice(node) {
    if (activeBgmVoices.length > 64) {
      activeBgmVoices = activeBgmVoices.slice(-48);
    }
    activeBgmVoices.push(node);
  }

  function stopBGM(fadeSeconds = 0.25, clearDesired = true) {
    bgmSessionId += 1;
    if (bgmTimerId !== null) {
      clearInterval(bgmTimerId);
      bgmTimerId = null;
    }
    currentBgmTrack = null;
    if (clearDesired) {
      desiredBgmTrack = null;
    }

    const oldBus = currentBgmBus;
    const oldVoices = activeBgmVoices;
    currentBgmBus = null;
    activeBgmVoices = [];

    if (oldBus && ctx) {
      const now = ctx.currentTime;
      const safeFade = Math.max(0.04, fadeSeconds);
      try {
        oldBus.gain.cancelScheduledValues(now);
        oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value || 0.0001), now);
        oldBus.gain.exponentialRampToValueAtTime(0.0001, now + safeFade);
      } catch {
        // Abaikan jika nod telah ditutup
      }
      setTimeout(() => {
        oldVoices.forEach((v) => {
          try {
            if (typeof v.stop === 'function') v.stop();
          } catch {
            // Abaikan
          }
          try {
            v.disconnect();
          } catch {
            // Abaikan
          }
        });
        try {
          oldBus.disconnect();
        } catch {
          // Abaikan
        }
      }, Math.round((safeFade + 0.05) * 1000));
    }
  }

  function scheduleBgmTone(audio, bus, opts) {
    if (!audio || !bus) return;
    const {
      freq,
      type = 'triangle',
      peak = 0.08,
      attack = 0.015,
      dur = 0.32,
      delay = 0,
      lowpassFreq = 0,
      detune = 0,
    } = opts;
    const t0 = audio.currentTime + delay;
    try {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);

      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(Math.max(0.0005, peak), t0 + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.03, dur));

      if (lowpassFreq > 0) {
        const lp = audio.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lowpassFreq, t0);
        osc.connect(lp).connect(env).connect(bus);
      } else {
        osc.connect(env).connect(bus);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
      registerBgmVoice(osc);
    } catch {
      // Abaikan ralat penjadualan AudioContext
    }
  }

  function getBgmDestination(audio) {
    if (!audio) return null;
    if (!bgmMasterCompressor || bgmMasterCompressor.context !== audio) {
      if (typeof audio.createDynamicsCompressor === 'function') {
        const comp = audio.createDynamicsCompressor();
        const t = audio.currentTime;
        comp.threshold.setValueAtTime(-8, t);
        comp.knee.setValueAtTime(12, t);
        comp.ratio.setValueAtTime(6, t);
        comp.attack.setValueAtTime(0.003, t);
        comp.release.setValueAtTime(0.16, t);
        comp.connect(audio.destination);
        bgmMasterCompressor = comp;
      } else {
        return audio.destination;
      }
    }
    return bgmMasterCompressor;
  }

  function scheduleBgmClockTick(audio, bus, accented = false) {
    if (!audio || !bus) return;
    const t0 = audio.currentTime;
    try {
      const osc = audio.createOscillator();
      const hp = audio.createBiquadFilter();
      const env = audio.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(accented ? 1680 : 1280, t0);
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(950, t0);
      env.gain.setValueAtTime(accented ? 0.055 : 0.032, t0);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.024);
      osc.connect(hp).connect(env).connect(bus);
      osc.start(t0);
      osc.stop(t0 + 0.03);
      registerBgmVoice(osc);
    } catch {
      // Abaikan
    }
  }

  function playBGM(trackName) {
    const validTracks = ['calm', 'tense', 'victory', 'fail'];
    if (!validTracks.includes(trackName)) return;
    desiredBgmTrack = trackName;

    if (muted) {
      stopBGM(0.08, false);
      return;
    }

    if (currentBgmTrack === trackName && bgmTimerId !== null) {
      return;
    }

    const audio = getContext();
    if (!audio) return;

    stopBGM(0.24, false);
    const sessionId = bgmSessionId;
    currentBgmTrack = trackName;

    const bus = audio.createGain();
    const targetVolume =
      trackName === 'victory'
        ? 0.62
        : trackName === 'calm'
          ? 0.58
          : trackName === 'fail'
            ? 0.64
            : 0.66;
    const now = audio.currentTime;
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(targetVolume, now + 0.3);
    bus.connect(getBgmDestination(audio));
    currentBgmBus = bus;

    let step = 0;

    if (trackName === 'calm') {
      // Trek 1: Arpeggio Marimba / Piano Elektrik Kampus Ceria (~112 BPM)
      const melody = [
        261.63, 329.63, 392.0, 493.88, 392.0, 329.63, 523.25, 493.88,
        349.23, 440.0, 523.25, 659.25, 523.25, 440.0, 349.23, 440.0,
        220.0, 261.63, 329.63, 392.0, 329.63, 261.63, 440.0, 392.0,
        196.0, 246.94, 293.66, 329.63, 293.66, 246.94, 392.0, 293.66,
      ];
      const bassRoots = [130.81, 174.61, 110.0, 98.0];
      const runCalmStep = () => {
        if (muted || sessionId !== bgmSessionId) return;
        const idx = step % melody.length;
        const freq = melody[idx];
        scheduleBgmTone(audio, bus, {
          freq,
          type: 'triangle',
          peak: 0.42,
          attack: 0.012,
          dur: 0.36,
          lowpassFreq: 2200,
        });
        scheduleBgmTone(audio, bus, {
          freq: freq * 2,
          type: 'sine',
          peak: 0.08,
          attack: 0.008,
          dur: 0.18,
        });
        if (idx % 8 === 0) {
          const bassFreq = bassRoots[Math.floor(idx / 8) % bassRoots.length];
          scheduleBgmTone(audio, bus, {
            freq: bassFreq,
            type: 'sine',
            peak: 0.36,
            attack: 0.025,
            dur: 1.45,
          });
        }
        step += 1;
      };
      runCalmStep();
      bgmTimerId = setInterval(runCalmStep, 268);
    } else if (trackName === 'tense') {
      // Trek 2: Denyut Misteri "Ghost Case" — Bass Degupan Jantung + Jam + Pad Minor (~108 BPM)
      const bassPattern = [
        65.41, 0, 65.41, 0, 0, 0, 0, 0,
        73.42, 0, 73.42, 0, 82.41, 0, 98.0, 0,
      ];
      const padChords = [
        [261.63, 311.13, 392.0], // Cm
        [207.65, 261.63, 311.13], // Ab
        [196.0, 246.94, 293.66], // G
        [261.63, 311.13, 392.0], // Cm
      ];
      const eerieBells = [783.99, 622.25, 587.33, 783.99];
      const runTenseStep = () => {
        if (muted || sessionId !== bgmSessionId) return;
        const idx = step % 16;
        const bassFreq = bassPattern[idx];
        if (bassFreq > 0) {
          scheduleBgmTone(audio, bus, {
            freq: bassFreq,
            type: 'sine',
            peak: 0.56,
            attack: 0.015,
            dur: 0.3,
          });
          scheduleBgmTone(audio, bus, {
            freq: bassFreq * 2,
            type: 'triangle',
            peak: 0.14,
            attack: 0.015,
            dur: 0.22,
            lowpassFreq: 320,
          });
        }
        if (idx % 2 === 0) {
          scheduleBgmClockTick(audio, bus, idx % 4 === 0);
        }
        if (idx % 8 === 0) {
          const chord = padChords[Math.floor(step / 8) % padChords.length];
          chord.forEach((noteFreq) => {
            scheduleBgmTone(audio, bus, {
              freq: noteFreq,
              type: 'sawtooth',
              peak: 0.085,
              attack: 0.35,
              dur: 2.05,
              lowpassFreq: 720,
            });
          });
        }
        if (idx === 6 || idx === 14) {
          const bell = eerieBells[Math.floor(step / 8) % eerieBells.length];
          scheduleBgmTone(audio, bus, {
            freq: bell,
            type: 'sine',
            peak: 0.12,
            attack: 0.015,
            dur: 0.65,
          });
        }
        step += 1;
      };
      runTenseStep();
      bgmTimerId = setInterval(runTenseStep, 278);
    } else if (trackName === 'victory') {
      // Trek 3: Progresi Kemenangan & Kelegaan (Brass / Loceng Major ~102 BPM)
      const melody = [
        523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 880.0, 0,
        880.0, 698.46, 880.0, 1046.5, 1174.66, 1046.5, 783.99, 1046.5,
      ];
      const chords = [
        [261.63, 329.63, 392.0], // C
        [196.0, 246.94, 293.66], // G
        [174.61, 220.0, 261.63], // F
        [261.63, 329.63, 392.0], // C
      ];
      const runVictoryStep = () => {
        if (muted || sessionId !== bgmSessionId) return;
        const idx = step % 16;
        const mFreq = melody[idx];
        if (mFreq > 0) {
          scheduleBgmTone(audio, bus, {
            freq: mFreq,
            type: 'triangle',
            peak: 0.34,
            attack: 0.018,
            dur: 0.44,
          });
          scheduleBgmTone(audio, bus, {
            freq: mFreq,
            type: 'sine',
            peak: 0.16,
            attack: 0.015,
            dur: 0.48,
          });
        }
        if (idx % 4 === 0) {
          const chord = chords[Math.floor(idx / 4) % chords.length];
          chord.forEach((cFreq) => {
            scheduleBgmTone(audio, bus, {
              freq: cFreq,
              type: 'sawtooth',
              peak: 0.095,
              attack: 0.08,
              dur: 1.1,
              lowpassFreq: 1150,
            });
          });
          scheduleBgmTone(audio, bus, {
            freq: chord[0] / 2,
            type: 'sine',
            peak: 0.32,
            attack: 0.03,
            dur: 1.05,
          });
        }
        step += 1;
      };
      runVictoryStep();
      bgmTimerId = setInterval(runVictoryStep, 294);
    } else if (trackName === 'fail') {
      // Trek 4: Penurunan Piano / Strings Minor Dramatik & Sayu (~68 BPM)
      const descent = [
        311.13, 293.66, 261.63, 233.08, 207.65, 196.0, 174.61, 196.0,
        311.13, 293.66, 261.63, 0, 207.65, 196.0, 130.81, 0,
      ];
      const drones = [
        [65.41, 130.81, 155.56],
        [51.91, 103.83, 155.56],
        [49.0, 98.0, 146.83],
        [65.41, 130.81, 155.56],
      ];
      const runFailStep = () => {
        if (muted || sessionId !== bgmSessionId) return;
        const idx = step % 16;
        const note = descent[idx];
        if (note > 0) {
          scheduleBgmTone(audio, bus, {
            freq: note,
            type: 'triangle',
            peak: 0.34,
            attack: 0.03,
            dur: 0.85,
            lowpassFreq: 920,
          });
        }
        if (idx % 4 === 0) {
          const pad = drones[Math.floor(idx / 4) % drones.length];
          pad.forEach((pFreq) => {
            scheduleBgmTone(audio, bus, {
              freq: pFreq,
              type: 'sine',
              peak: 0.18,
              attack: 0.25,
              dur: 1.72,
            });
          });
        }
        step += 1;
      };
      runFailStep();
      bgmTimerId = setInterval(runFailStep, 440);
    }
  }

  return {
    unlock,
    isMuted,
    setMuted,
    toggleMute,
    playBGM,
    stopBGM,
    getCurrentBGM: () => currentBgmTrack,
    playClick,
    playTypewriter,
    playSuccess,
    playTimeBonus,
    playError,
    playHeavyDoor,
    playAlarm,
    playPage,
    playTick,
    playDoorSlamLock,
    playGasHiss,
    playLoseSound,
    playDoorOpen,
    playWinFanfare,
  };
})();

function ensureAudioContext() {
  return soundManager.unlock();
}

function playSFX(type) {
  switch (type) {
    case 'click':
      soundManager.playClick();
      break;
    case 'type':
      soundManager.playTypewriter();
      break;
    case 'clang':
      soundManager.playHeavyDoor();
      break;
    case 'doorSlam':
      soundManager.playDoorSlamLock();
      break;
    case 'doorOpen':
      soundManager.playDoorOpen();
      break;
    case 'gas':
      soundManager.playGasHiss();
      break;
    case 'lose':
      soundManager.playLoseSound();
      break;
    case 'win':
      soundManager.playWinFanfare();
      break;
    case 'alarm':
      soundManager.playAlarm();
      break;
    case 'penalty':
      soundManager.playError();
      break;
    case 'pickup':
      soundManager.playSuccess();
      break;
    case 'bonus':
      soundManager.playTimeBonus();
      break;
    case 'page':
      soundManager.playPage();
      break;
    default:
      soundManager.playClick();
      break;
  }
}

// ============================================================================
// 4. RUJUKAN ELEMEN DOM
// ============================================================================

const dom = {
  body: document.body,
  penaltyFlash: document.getElementById('penalty-flash'),

  // Skrin Utama
  registrationScreen: document.getElementById('registration-screen'),
  cutsceneScreen: document.getElementById('cutscene-screen'),
  gameScreen: document.getElementById('game-screen'),

  // Borang Pendaftaran
  regForm: document.getElementById('registration-form'),
  playerNameInput: document.getElementById('player-name'),
  playerMatricInput: document.getElementById('player-matric'),
  playerAvatarInput: document.getElementById('player-avatar'),
  matricCardPortrait: document.getElementById('matric-card-portrait'),
  btnQrEasterEgg: document.getElementById('btn-qr-easter-egg'),
  avatarOptions: document.querySelectorAll('.avatar-option'),
  nameError: document.getElementById('name-error'),

  // Cutscene
  cutsceneFrame: document.querySelector('.cutscene-frame'),
  cutsceneProgress: document.getElementById('cutscene-progress'),
  cutsceneVisual: document.getElementById('cutscene-visual'),
  cutscenePortrait: document.getElementById('cutscene-portrait'),
  cutsceneSpeaker: document.getElementById('cutscene-speaker'),
  cutsceneText: document.getElementById('cutscene-text'),
  cutsceneDialogueBox: document.getElementById('cutscene-dialogue-box'),
  btnNextCutscene: document.getElementById('btn-next-cutscene'),
  btnSkipCutscene: document.getElementById('btn-skip-cutscene'),

  // HUD & Viewport
  hudRoomCode: document.getElementById('hud-room-code'),
  hudRoomName: document.getElementById('hud-room-name'),
  hudTimerBox: document.getElementById('hud-timer-box'),
  hudTimer: document.getElementById('hud-timer'),
  hudBonusBadge: document.getElementById('hud-bonus-badge'),
  hudPausedBadge: document.getElementById('hud-paused-badge'),
  hudMistakesCount: document.getElementById('hud-mistakes-count'),
  btnSoundToggle: document.getElementById('btn-sound-toggle'),
  soundToggleButtons: document.querySelectorAll('.js-sound-toggle'),
  btnOpenNotebook: document.getElementById('btn-open-notebook'),

  hudBar: document.querySelector('.hud-bar'),
  bottomDock: document.querySelector('.bottom-dock'),
  roomStage: document.getElementById('room-stage'),
  roomSceneContainer: document.getElementById('room-scene-container'),
  btnNavLeft: document.getElementById('btn-nav-left'),
  btnNavRight: document.getElementById('btn-nav-right'),
  roomCompass: document.getElementById('room-compass'),

  // Dialog & Inventori
  dialoguePortrait: document.getElementById('dialogue-portrait'),
  dialogueSpeaker: document.getElementById('dialogue-speaker'),
  dialogueText: document.getElementById('dialogue-text'),
  inventoryPanel: document.querySelector('.inventory-panel'),
  inventorySlots: document.getElementById('inventory-slots'),
  inventorySelectedLabel: document.getElementById('inventory-selected-label'),

  // Tutorial Interaktif 4-Langkah
  tutorialBackdrop: document.getElementById('tutorial-backdrop'),
  tutorialOverlay: document.getElementById('tutorial-overlay'),
  tutorialStepBadge: document.getElementById('tutorial-step-badge'),
  tutorialStepTitle: document.getElementById('tutorial-step-title'),
  tutorialStepText: document.getElementById('tutorial-step-text'),
  tutorialDots: document.getElementById('tutorial-dots'),
  btnSkipTutorial: document.getElementById('btn-skip-tutorial'),
  btnNextTutorial: document.getElementById('btn-next-tutorial'),

  // Buku Nota Kuliah
  notebookModal: document.getElementById('notebook-modal'),
  btnCloseNotebook: document.getElementById('btn-close-notebook'),
  btnCloseNotebookFooter: document.getElementById('btn-close-notebook-footer'),
  notebookTabs: document.querySelectorAll('.notebook-tab'),
  notebookContent: document.getElementById('notebook-content'),

  // Modal Inspect
  inspectModal: document.getElementById('inspect-modal'),
  inspectTitle: document.getElementById('inspect-title'),
  inspectBody: document.getElementById('inspect-body'),
  btnCloseInspect: document.getElementById('btn-close-inspect'),

  // Admin PIN & Dashboard
  btnOpenAdmin: document.getElementById('btn-open-admin'),
  adminPinModal: document.getElementById('admin-pin-modal'),
  adminPinForm: document.getElementById('admin-pin-form'),
  adminPinInput: document.getElementById('admin-pin-input'),
  adminPinError: document.getElementById('admin-pin-error'),
  btnClosePin: document.getElementById('btn-close-pin'),
  btnCancelPin: document.getElementById('btn-cancel-pin'),

  devArchiveModal: document.getElementById('dev-archive-modal'),
  btnCloseDevArchive: document.getElementById('btn-close-dev-archive'),
  btnCloseDevArchiveFooter: document.getElementById('btn-close-dev-archive-footer'),

  adminDashboard: document.getElementById('admin-dashboard'),
  adminSyncStatus: document.getElementById('admin-sync-status'),
  btnPlayTrailer: document.getElementById('btn-play-trailer'),
  btnRefreshAdmin: document.getElementById('btn-refresh-admin'),
  btnCloseAdmin: document.getElementById('btn-close-admin'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnClearRecords: document.getElementById('btn-clear-records'),
  confirmClearModal: document.getElementById('confirm-clear-modal'),
  btnCancelClear: document.getElementById('btn-cancel-clear'),
  btnConfirmClear: document.getElementById('btn-confirm-clear'),

  kpiTotalPlayers: document.getElementById('kpi-total-players'),
  kpiSuccessRate: document.getElementById('kpi-success-rate'),
  kpiAvgTime: document.getElementById('kpi-avg-time'),
  kpiHardestTopic: document.getElementById('kpi-hardest-topic'),
  adminLeaderboardBody: document.getElementById('admin-leaderboard-body'),
  adminLogBody: document.getElementById('admin-log-body'),

  // End Screen & Sijil Pencapaian
  endScreen: document.getElementById('end-screen'),
  endEmblem: document.getElementById('end-emblem'),
  endTitle: document.getElementById('end-title'),
  endSubtitle: document.getElementById('end-subtitle'),
  victoryCertificateWrap: document.getElementById('victory-certificate-wrap'),
  victoryCertificatePreview: document.getElementById('victory-certificate-preview'),
  victoryMetaStrip: document.getElementById('victory-meta-strip'),
  endStatsGrid: document.getElementById('end-stats-grid'),
  endStatName: document.getElementById('end-stat-name'),
  endStatMatric: document.getElementById('end-stat-matric'),
  endStatTime: document.getElementById('end-stat-time'),
  endStatRemaining: document.getElementById('end-stat-remaining'),
  endStatSolved: document.getElementById('end-stat-solved'),
  endStatMistakes: document.getElementById('end-stat-mistakes'),
  endStatHints: document.getElementById('end-stat-hints'),
  endStatStatus: document.getElementById('end-stat-status'),
  endStatGrade: document.getElementById('end-stat-grade'),
  btnDownloadCert: document.getElementById('btn-download-cert'),
  btnRetryGame: document.getElementById('btn-retry-game'),
  btnBackToStart: document.getElementById('btn-back-to-start'),

  // Mod Treler Sinematik (Admin / ?trailer=1)
  trailerOverlay: document.getElementById('trailer-overlay'),
  trailerStage: document.getElementById('trailer-stage'),
  trailerVisualLayer: document.getElementById('trailer-visual-layer'),
  trailerStrobeLayer: document.getElementById('trailer-strobe-layer'),
  trailerOverlayText: document.getElementById('trailer-overlay-text'),
  btnCloseTrailer: document.getElementById('btn-close-trailer'),
};

// ============================================================================
// 5. POTRET WATAK SVG (GHOST CASE INK STYLE)
// ============================================================================

function normalizePortraitGender(gender) {
  const g = String(gender || gameState.avatar || 'male').trim().toLowerCase();
  return g === 'female' || g === 'perempuan' ? 'female' : 'male';
}

function getPlayerPortraitSVG(gender, emotion = 'neutral') {
  const normalizedGender = normalizePortraitGender(gender);
  const allowedMoods = ['neutral', 'happy', 'crying', 'shocked', 'coughing', 'dizzy'];
  const mood = allowedMoods.includes(emotion) ? emotion : 'neutral';

  const bgFill =
    mood === 'happy'
      ? '#133834'
      : mood === 'crying' || mood === 'shocked' || mood === 'dizzy'
        ? '#24141b'
        : mood === 'coughing'
          ? '#12262b'
          : '#122933';
  const haloMarkup =
    mood === 'happy'
      ? '<circle cx="32" cy="27" r="22" fill="#f2b749" fill-opacity="0.22"/><circle cx="32" cy="27" r="18" fill="#6ee7b7" fill-opacity="0.16"/>'
      : mood === 'crying' || mood === 'shocked' || mood === 'dizzy'
        ? '<circle cx="32" cy="28" r="22" fill="#dc3545" fill-opacity="0.18"/>'
        : mood === 'coughing'
          ? '<circle cx="32" cy="28" r="22" fill="#5eead4" fill-opacity="0.16"/>'
          : '';

  const isFemale = normalizedGender === 'female';
  const eyeLeftX = isFemale ? 27.5 : 27;
  const eyeRightX = isFemale ? 36.5 : 37;
  const eyeY = 28;

  let browsAndEyes = `
    <circle cx="${eyeLeftX}" cy="${eyeY}" r="1.7" fill="#05080a"/>
    <circle cx="${eyeRightX}" cy="${eyeY}" r="1.7" fill="#05080a"/>
  `;
  let mouthMarkup = `
    <path d="M28 34 Q32 36 36 34" fill="none" stroke="#05080a" stroke-width="2" stroke-linecap="round"/>
  `;
  let extrasMarkup = '';

  if (mood === 'happy') {
    browsAndEyes = `
      <path d="M${eyeLeftX - 2.6} ${eyeY - 3.6} Q${eyeLeftX} ${eyeY - 5.2} ${eyeLeftX + 2.4} ${eyeY - 3.6}" fill="none" stroke="#05080a" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.4} ${eyeY - 3.6} Q${eyeRightX} ${eyeY - 5.2} ${eyeRightX + 2.6} ${eyeY - 3.6}" fill="none" stroke="#05080a" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M${eyeLeftX - 2.6} ${eyeY + 0.8} Q${eyeLeftX} ${eyeY - 2.6} ${eyeLeftX + 2.6} ${eyeY + 0.8}" fill="none" stroke="#05080a" stroke-width="2" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.6} ${eyeY + 0.8} Q${eyeRightX} ${eyeY - 2.6} ${eyeRightX + 2.6} ${eyeY + 0.8}" fill="none" stroke="#05080a" stroke-width="2" stroke-linecap="round"/>
    `;
    mouthMarkup = `
      <path d="M26.5 33 Q32 39 37.5 33 Z" fill="#8f2d39" stroke="#05080a" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M28.5 33.4 Q32 35.2 35.5 33.4" fill="none" stroke="#fff7ed" stroke-width="1.2" stroke-linecap="round"/>
    `;
    extrasMarkup = `
      <ellipse cx="24" cy="31.5" rx="2.4" ry="1.3" fill="#e87a7a" fill-opacity="0.45"/>
      <ellipse cx="40" cy="31.5" rx="2.4" ry="1.3" fill="#e87a7a" fill-opacity="0.45"/>
    `;
  } else if (mood === 'shocked') {
    browsAndEyes = `
      <path d="M${eyeLeftX - 3} ${eyeY - 4.8} Q${eyeLeftX} ${eyeY - 6.6} ${eyeLeftX + 2.6} ${eyeY - 4.6}" fill="none" stroke="#05080a" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.6} ${eyeY - 4.6} Q${eyeRightX} ${eyeY - 6.6} ${eyeRightX + 3} ${eyeY - 4.8}" fill="none" stroke="#05080a" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="${eyeLeftX}" cy="${eyeY}" r="3.1" fill="#ffffff" stroke="#05080a" stroke-width="1.5"/>
      <circle cx="${eyeRightX}" cy="${eyeY}" r="3.1" fill="#ffffff" stroke="#05080a" stroke-width="1.5"/>
      <circle cx="${eyeLeftX}" cy="${eyeY + 0.2}" r="1.25" fill="#05080a"/>
      <circle cx="${eyeRightX}" cy="${eyeY + 0.2}" r="1.25" fill="#05080a"/>
    `;
    mouthMarkup = `
      <ellipse cx="32" cy="35.3" rx="3.1" ry="3.4" fill="#6b1d28" stroke="#05080a" stroke-width="1.8"/>
    `;
    extrasMarkup = `
      <path d="M41.2 21.5 C39.5 24.4 39.8 26.8 41.2 26.8 C42.6 26.8 42.9 24.4 41.2 21.5 Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="0.9"/>
    `;
  } else if (mood === 'coughing') {
    browsAndEyes = `
      <path d="M${eyeLeftX - 3} ${eyeY - 3.6} L${eyeLeftX + 2} ${eyeY - 2.3}" fill="none" stroke="#05080a" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2} ${eyeY - 2.3} L${eyeRightX + 3} ${eyeY - 3.6}" fill="none" stroke="#05080a" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M${eyeLeftX - 2.6} ${eyeY - 1.2} L${eyeLeftX + 2} ${eyeY + 0.4} L${eyeLeftX - 2.6} ${eyeY + 2}" fill="none" stroke="#05080a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${eyeRightX + 2.6} ${eyeY - 1.2} L${eyeRightX - 2} ${eyeY + 0.4} L${eyeRightX + 2.6} ${eyeY + 2}" fill="none" stroke="#05080a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    `;
    mouthMarkup = `
      <path d="M27.8 34.4 Q30 32.8 32 34.2 Q34 35.6 36.2 34.1" fill="none" stroke="#05080a" stroke-width="1.9" stroke-linecap="round"/>
      <ellipse cx="32" cy="35.6" rx="2.1" ry="1.3" fill="#7f1d1d" stroke="#05080a" stroke-width="1.3"/>
    `;
    extrasMarkup = `
      <ellipse cx="24.2" cy="31.5" rx="2.2" ry="1.2" fill="#e87a7a" fill-opacity="0.35"/>
      <ellipse cx="39.8" cy="31.5" rx="2.2" ry="1.2" fill="#e87a7a" fill-opacity="0.35"/>
      <path d="M40.5 22 C39 24.4 39.3 26.4 40.5 26.4 C41.7 26.4 42 24.4 40.5 22 Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="0.8"/>
      <circle cx="36.5" cy="36.5" r="2.2" fill="#99f6e4" fill-opacity="0.5"/>
      <circle cx="39.8" cy="37.6" r="1.6" fill="#ccfbf1" fill-opacity="0.45"/>
    `;
  } else if (mood === 'crying' || mood === 'dizzy') {
    browsAndEyes =
      mood === 'dizzy'
        ? `
      <path d="M${eyeLeftX - 3} ${eyeY - 2.2} L${eyeLeftX + 2.2} ${eyeY - 4.2}" fill="none" stroke="#05080a" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.2} ${eyeY - 4.2} L${eyeRightX + 3} ${eyeY - 2.2}" fill="none" stroke="#05080a" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M${eyeLeftX - 2.5} ${eyeY - 0.5} Q${eyeLeftX} ${eyeY + 2.1} ${eyeLeftX + 2.5} ${eyeY - 0.5}" fill="none" stroke="#05080a" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.5} ${eyeY - 0.5} Q${eyeRightX} ${eyeY + 2.1} ${eyeRightX + 2.5} ${eyeY - 0.5}" fill="none" stroke="#05080a" stroke-width="1.9" stroke-linecap="round"/>
      <circle cx="${eyeLeftX - 0.5}" cy="${eyeY + 0.5}" r="0.85" fill="#e0f2fe"/>
      <circle cx="${eyeRightX - 0.5}" cy="${eyeY + 0.5}" r="0.85" fill="#e0f2fe"/>
    `
        : `
      <path d="M${eyeLeftX - 3} ${eyeY - 2.5} L${eyeLeftX + 2.2} ${eyeY - 4.4}" fill="none" stroke="#05080a" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M${eyeRightX - 2.2} ${eyeY - 4.4} L${eyeRightX + 3} ${eyeY - 2.5}" fill="none" stroke="#05080a" stroke-width="1.7" stroke-linecap="round"/>
      <ellipse cx="${eyeLeftX}" cy="${eyeY + 0.3}" rx="2.1" ry="2.3" fill="#05080a"/>
      <ellipse cx="${eyeRightX}" cy="${eyeY + 0.3}" rx="2.1" ry="2.3" fill="#05080a"/>
      <circle cx="${eyeLeftX - 0.7}" cy="${eyeY - 0.6}" r="0.85" fill="#e0f2fe"/>
      <circle cx="${eyeRightX - 0.7}" cy="${eyeY - 0.6}" r="0.85" fill="#e0f2fe"/>
    `;
    mouthMarkup = `
      <path d="M27.5 36.2 Q29.8 33.4 32 34.4 Q34.2 33.4 36.5 36.2" fill="none" stroke="#05080a" stroke-width="2" stroke-linecap="round"/>
    `;
    extrasMarkup = `
      <g class="portrait-tear">
        <path d="M${eyeLeftX - 0.8} ${eyeY + 2.8} C${eyeLeftX - 2.6} ${eyeY + 6.4} ${eyeLeftX - 2.2} ${eyeY + 9.2} ${eyeLeftX - 0.4} ${eyeY + 9.2} C${eyeLeftX + 1.4} ${eyeY + 9.2} ${eyeLeftX + 1.5} ${eyeY + 6.4} ${eyeLeftX - 0.8} ${eyeY + 2.8} Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="0.9"/>
      </g>
      <g class="portrait-tear portrait-tear-delayed">
        <path d="M${eyeRightX + 0.8} ${eyeY + 2.8} C${eyeRightX - 1.5} ${eyeY + 6.4} ${eyeRightX - 1.4} ${eyeY + 9.2} ${eyeRightX + 0.4} ${eyeY + 9.2} C${eyeRightX + 2.2} ${eyeY + 9.2} ${eyeRightX + 2.6} ${eyeY + 6.4} ${eyeRightX + 0.8} ${eyeY + 2.8} Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="0.9"/>
      </g>
      ${
        mood === 'dizzy'
          ? '<path d="M39.5 18.8 C41.2 17.5 43.2 19 42 20.6 C40.9 22 39 20.8 40 19.6" fill="none" stroke="#fde68a" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>'
          : ''
      }
    `;
  }

  if (isFemale) {
    return `
      <svg viewBox="0 0 64 64" width="100%" height="100%">
        <rect width="64" height="64" fill="${bgFill}"/>
        ${haloMarkup}
        <path d="M12 64 C14 48 22 44 32 44 C42 44 50 48 52 64 Z" fill="#e6eff2" stroke="#05080a" stroke-width="2.5"/>
        <path d="M16 32 C16 14 24 10 32 10 C40 10 48 14 48 32 L46 49 C40 53 24 53 18 49 Z" fill="#1f5868" stroke="#05080a" stroke-width="2.4"/>
        <ellipse cx="32" cy="28" rx="11.5" ry="12.5" fill="#e2be9e" stroke="#05080a" stroke-width="2.2"/>
        <path d="M20.5 24 C23 17 41 17 43.5 24" fill="none" stroke="#05080a" stroke-width="2"/>
        ${extrasMarkup}
        ${browsAndEyes}
        ${mouthMarkup}
      </svg>
    `;
  }

  // Pelajar Lelaki (Kot Makmal Agro)
  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <rect width="64" height="64" fill="${bgFill}"/>
      ${haloMarkup}
      <path d="M12 64 C14 48 22 44 32 44 C42 44 50 48 52 64 Z" fill="#e6eff2" stroke="#05080a" stroke-width="2.5"/>
      <path d="M26 44 L32 54 L38 44" fill="#1d4d5c" stroke="#05080a" stroke-width="2"/>
      <circle cx="32" cy="27" r="13" fill="#d9b493" stroke="#05080a" stroke-width="2.5"/>
      <path d="M19 25 C19 14 27 11 33 11 C41 11 45 17 45 25 C41 20 35 19 28 20 C23 20 21 23 19 25 Z" fill="#141b1f" stroke="#05080a" stroke-width="2"/>
      ${extrasMarkup}
      ${browsAndEyes}
      ${mouthMarkup}
    </svg>
  `;
}

function getPortraitSVG(type, avatarOverride, emotion = 'neutral') {
  if (type === 'system') {
    return `
      <svg viewBox="0 0 64 64" width="100%" height="100%">
        <rect width="64" height="64" fill="#1b0d11"/>
        <rect x="6" y="10" width="52" height="44" rx="4" fill="#2c1118" stroke="#05080a" stroke-width="2.5"/>
        <polygon points="32,16 50,46 14,46" fill="#dc3545" stroke="#05080a" stroke-width="2.5"/>
        <rect x="30" y="25" width="4" height="11" rx="1" fill="#05080a"/>
        <circle cx="32" cy="41" r="2.2" fill="#05080a"/>
      </svg>
    `;
  }
  return getPlayerPortraitSVG(avatarOverride || gameState.avatar || 'male', emotion);
}

// ============================================================================
// 6. CUTSCENE 4-PANEL INTRO & ENJIN CUTSCENE BOLEH GUNA SEMULA
// ============================================================================

function escapeSvgText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateMatricCardPortrait(avatar) {
  if (!dom.matricCardPortrait) return;
  dom.matricCardPortrait.innerHTML = getPlayerPortraitSVG(avatar || 'male', 'neutral');
}

function getCutscenePanelSVG(visualId) {
  switch (visualId) {
    case 'card_swipe': {
      const cardName = escapeSvgText((gameState.playerName || 'PELAJAR MAKMAL').toUpperCase().slice(0, 26));
      const cardMatric = escapeSvgText((gameState.matricNo || 'PELAWAT MAKMAL').toUpperCase().slice(0, 20));
      const cardGender = escapeSvgText((gameState.playerGender || (gameState.avatar === 'female' ? 'Perempuan' : 'Lelaki')).toUpperCase());
      const portraitInner = getPlayerPortraitSVG(gameState.avatar || 'male', 'neutral');
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="corridorWall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0b171f"/>
              <stop offset="100%" stop-color="#060c10"/>
            </linearGradient>
            <linearGradient id="blueMatricCard" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#0b2447"/>
              <stop offset="50%" stop-color="#0f3460"/>
              <stop offset="100%" stop-color="#1a5296"/>
            </linearGradient>
            <linearGradient id="goldChipCut" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f7d788"/>
              <stop offset="100%" stop-color="#d4a23d"/>
            </linearGradient>
            <radialGradient id="readerGlow" cx="76%" cy="46%" r="36%">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.35"/>
              <stop offset="60%" stop-color="#0ea5e9" stop-opacity="0.1"/>
              <stop offset="100%" stop-color="#060c10" stop-opacity="0"/>
            </radialGradient>
            <clipPath id="swipePortraitClip">
              <rect x="24" y="80" width="96" height="96" rx="8"/>
            </clipPath>
          </defs>

          <!-- Latar Koridor Pintu Makmal -->
          <rect width="960" height="510" fill="url(#corridorWall)"/>
          <rect width="960" height="510" fill="url(#readerGlow)"/>

          <!-- Garis Pintu Keluli Kiri/Tengah -->
          <rect x="70" y="36" width="470" height="474" fill="#101f27" stroke="#040709" stroke-width="5"/>
          <rect x="98" y="64" width="414" height="446" fill="#142833" stroke="#040709" stroke-width="3.5"/>
          <rect x="172" y="102" width="266" height="122" rx="6" fill="#0d1c24" stroke="#040709" stroke-width="3.5"/>
          <text x="305" y="156" text-anchor="middle" fill="#7dd3fc" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700">MAKMAL AGRO</text>
          <text x="305" y="186" text-anchor="middle" fill="#cbd5e1" font-family="JetBrains Mono, monospace" font-size="14">BLOK SAINS · AGRO LAB</text>

          <!-- Pengimbas Kad Elektronik di Dinding Kanan -->
          <g transform="translate(650, 118)">
            <rect x="0" y="0" width="180" height="275" rx="14" fill="#182a34" stroke="#040709" stroke-width="5"/>
            <rect x="16" y="18" width="148" height="72" rx="8" fill="#07131a" stroke="#040709" stroke-width="3"/>
            <text x="90" y="48" text-anchor="middle" fill="#86efac" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">AKSES DISAHKAN</text>
            <text x="90" y="72" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono, monospace" font-size="12">SISTEM RFID MAKMAL</text>
            <!-- Lampu LED Pengimbas -->
            <circle cx="90" cy="122" r="16" fill="#0a161c" stroke="#040709" stroke-width="3"/>
            <circle cx="90" cy="122" r="10" class="anim-reader-led"/>
            <!-- Pad Pengimbas & Pancaran Imbasan -->
            <rect x="24" y="154" width="132" height="96" rx="10" fill="#0f1f27" stroke="#2a4858" stroke-width="2.5"/>
            <rect x="34" y="166" width="112" height="72" rx="6" fill="#22c55e" class="anim-scanner-beam"/>
            <path d="M72 198 C82 188 98 188 108 198 M78 208 C85 201 95 201 102 208 M85 218 L95 218" fill="none" stroke="#dcfce7" stroke-width="3" stroke-linecap="round"/>
          </g>

          <!-- Kad Akses Makmal Biru Yang Diimbas -->
          <g class="anim-card-swipe" transform-origin="450 280">
            <g transform="translate(270, 152)">
              <rect x="0" y="0" width="380" height="232" rx="16" fill="url(#blueMatricCard)" stroke="#f2b749" stroke-width="3.5"/>
              <path d="M0 176 C95 138 205 214 380 158 L380 232 L0 232 Z" fill="#f2b749" fill-opacity="0.16"/>
              <line x1="20" y1="54" x2="360" y2="54" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>

              <!-- Tajuk Kad & Cip EM -->
              <text x="24" y="34" fill="#ffffff" font-family="Fraunces, serif" font-size="18" font-weight="700">KAD AKSES MAKMAL</text>
              <text x="24" y="47" fill="#fde68a" font-family="Plus Jakarta Sans, sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.2">PROGRAM SAINS PERTANIAN · AGRO LAB</text>
              <rect x="316" y="14" width="42" height="30" rx="5" fill="url(#goldChipCut)" stroke="#7a5a18" stroke-width="1.5"/>
              <rect x="328" y="21" width="18" height="16" rx="2" fill="none" stroke="#6b4e13" stroke-width="1.2"/>

              <!-- Kotak Foto Avatar Sebenar Pemain -->
              <rect x="20" y="76" width="104" height="104" rx="10" fill="#071326" stroke="#ffffff" stroke-width="2.5"/>
              <g clip-path="url(#swipePortraitClip)">
                <svg x="24" y="80" width="96" height="96" viewBox="0 0 64 64">
                  ${portraitInner}
                </svg>
              </g>
              <text x="72" y="198" text-anchor="middle" fill="#bfdbfe" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">${cardGender}</text>

              <!-- Maklumat Pemain Pada Kad -->
              <rect x="142" y="76" width="132" height="22" rx="4" fill="rgba(7,20,42,0.72)" stroke="rgba(242,183,73,0.65)" stroke-width="1"/>
              <text x="150" y="91" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">ID: AGRO-LAB</text>

              <text x="142" y="118" fill="#bfdbfe" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700">NAMA PELAJAR</text>
              <text x="142" y="139" fill="#ffffff" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="700">${cardName}</text>

              <text x="142" y="164" fill="#bfdbfe" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700">NO. MATRIK</text>
              <text x="142" y="184" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">${cardMatric}</text>

              <!-- Jalur Kod Bar Mini -->
              <rect x="142" y="198" width="214" height="20" rx="3" fill="#ffffff"/>
              <g fill="#0b2447">
                <rect x="152" y="201" width="4" height="14"/>
                <rect x="160" y="201" width="2" height="14"/>
                <rect x="166" y="201" width="5" height="14"/>
                <rect x="176" y="201" width="2" height="14"/>
                <rect x="182" y="201" width="4" height="14"/>
                <rect x="190" y="201" width="3" height="14"/>
                <rect x="198" y="201" width="5" height="14"/>
                <rect x="208" y="201" width="2" height="14"/>
                <rect x="215" y="201" width="4" height="14"/>
                <rect x="224" y="201" width="3" height="14"/>
                <rect x="232" y="201" width="5" height="14"/>
                <rect x="242" y="201" width="2" height="14"/>
                <rect x="249" y="201" width="4" height="14"/>
                <rect x="258" y="201" width="3" height="14"/>
                <rect x="266" y="201" width="5" height="14"/>
                <rect x="276" y="201" width="2" height="14"/>
                <rect x="284" y="201" width="4" height="14"/>
                <rect x="293" y="201" width="3" height="14"/>
                <rect x="301" y="201" width="5" height="14"/>
                <rect x="312" y="201" width="3" height="14"/>
                <rect x="320" y="201" width="4" height="14"/>
                <rect x="330" y="201" width="2" height="14"/>
                <rect x="338" y="201" width="4" height="14"/>
              </g>
            </g>
          </g>

          <!-- Kesan Bunyi Komik -->
          <text x="645" y="94" fill="#86efac" font-family="Fraunces, serif" font-size="34" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-7 645 94)">BIP! SAH</text>
        </svg>
      `;
    }

    case 'dusk_window':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="skyDusk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#142934"/>
              <stop offset="65%" stop-color="#1e424e"/>
              <stop offset="100%" stop-color="#0b151a"/>
            </linearGradient>
          </defs>
          <rect width="960" height="510" fill="#091116"/>
          <!-- Tingkap Makmal Pada Waktu Senja -->
          <rect x="260" y="36" width="440" height="310" fill="url(#skyDusk)" stroke="#040709" stroke-width="5"/>
          <circle cx="600" cy="115" r="34" fill="#d99b38" opacity="0.35"/>
          <path d="M270 342 Q350 250 430 220 Q490 270 530 342 Z" fill="#0c1b21" stroke="#040709" stroke-width="3"/>
          <line x1="480" y1="36" x2="480" y2="346" stroke="#040709" stroke-width="6"/>
          <line x1="260" y1="190" x2="700" y2="190" stroke="#040709" stroke-width="6"/>
          <!-- Meja dengan Sampel Tugasan & Lampu Meja -->
          <rect x="0" y="360" width="960" height="150" fill="#101d24" stroke="#040709" stroke-width="4"/>
          <rect x="330" y="395" width="160" height="22" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="3"/>
          <rect x="345" y="384" width="145" height="16" rx="2" fill="#d6c8a8" stroke="#040709" stroke-width="2.5"/>
          <!-- Kelalang Erlenmeyer -->
          <path d="M565 385 L595 385 L615 445 L545 445 Z" fill="#235b6a" stroke="#040709" stroke-width="3"/>
          <rect x="572" y="362" width="16" height="25" fill="#1b4652" stroke="#040709" stroke-width="3"/>
          <!-- Bayang Pelajar -->
          <path d="M130 510 C140 390 190 350 245 355 C300 360 320 430 330 510 Z" fill="#070d11" stroke="#040709" stroke-width="3"/>
          <circle cx="225" cy="310" r="38" fill="#070d11" stroke="#040709" stroke-width="3"/>
        </svg>
      `;

    case 'locked_door':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="redAlarmGlow" cx="50%" cy="16%" r="55%">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.72"/>
              <stop offset="55%" stop-color="#991b1b" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#070c0f" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#0d151a"/>
          <rect width="960" height="510" fill="url(#redAlarmGlow)"/>
          <!-- Pintu Keluli Berat -->
          <rect x="320" y="105" width="320" height="395" fill="#18272f" stroke="#040709" stroke-width="6"/>
          <rect x="346" y="130" width="268" height="345" fill="#132027" stroke="#040709" stroke-width="4"/>
          <line x1="480" y1="130" x2="480" y2="475" stroke="#040709" stroke-width="5"/>
          <!-- Palang Kunci Keluli -->
          <rect x="298" y="255" width="364" height="38" rx="4" fill="#3a4c56" stroke="#040709" stroke-width="4"/>
          <rect x="445" y="242" width="70" height="64" rx="6" fill="#23323b" stroke="#040709" stroke-width="4"/>
          <circle cx="480" cy="274" r="10" fill="#ef4444" stroke="#040709" stroke-width="2.5"/>
          <!-- Lampu Kecemasan Merah -->
          <rect x="452" y="40" width="56" height="40" rx="8" fill="#dc2626" stroke="#040709" stroke-width="4"/>
          <path d="M415 62 L360 44 M545 62 L600 44 M425 84 L385 110 M535 84 L575 110" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
          <!-- Kesan Teks Bunyi Komik -->
          <text x="150" y="190" fill="#f2b749" font-family="Fraunces, serif" font-size="44" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-12 150 190)">KLANG!!</text>
        </svg>
      `;

    case 'warning_monitor':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <rect width="960" height="510" fill="#081014"/>
          <!-- Bingkai Monitor Makmal -->
          <rect x="190" y="45" width="580" height="370" rx="14" fill="#172730" stroke="#040709" stroke-width="6"/>
          <rect x="218" y="72" width="524" height="300" rx="6" fill="#1a090d" stroke="#040709" stroke-width="4"/>
          <!-- Kaki Monitor -->
          <rect x="440" y="415" width="80" height="45" fill="#111e25" stroke="#040709" stroke-width="4"/>
          <rect x="360" y="455" width="240" height="24" rx="4" fill="#182a33" stroke="#040709" stroke-width="4"/>
          <!-- Amaran di Skrin -->
          <polygon points="480,104 548,220 412,220" fill="#dc2626" stroke="#040709" stroke-width="4"/>
          <rect x="474" y="140" width="12" height="44" rx="2" fill="#05080a"/>
          <circle cx="480" cy="200" r="7" fill="#05080a"/>
          <text x="480" y="264" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700">BAHAYA: GAS BERACUN</text>
          <text x="480" y="318" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="44" font-weight="700">10:00</text>
          <text x="480" y="348" text-anchor="middle" fill="#9bb3bd" font-family="Plus Jakarta Sans, sans-serif" font-size="14">PINTU MAKMAL AGRO DIKUNCI</text>
        </svg>
      `;

    case 'bookshelf_open':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="secretEmeraldGlow" cx="52%" cy="52%" r="48%">
              <stop offset="0%" stop-color="#2ea877" stop-opacity="0.72"/>
              <stop offset="55%" stop-color="#1d615c" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#060c0f" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#0b151a"/>
          <rect width="960" height="510" fill="url(#secretEmeraldGlow)"/>
          <!-- Bingkai Dinding & Lantai -->
          <rect x="0" y="425" width="960" height="85" fill="#091115" stroke="#040709" stroke-width="4"/>
          <!-- Pintu Laluan Rahsia Terdedah -->
          <rect x="290" y="70" width="270" height="355" fill="#051312" stroke="#040709" stroke-width="6"/>
          <rect x="315" y="95" width="220" height="330" fill="#082420" stroke="#2ea877" stroke-width="2.5" opacity="0.88"/>
          <!-- Cahaya & Tangga Ke Dalam Bilik Rahsia -->
          <polygon points="335,425 515,425 480,290 370,290" fill="#134e44" opacity="0.65"/>
          <circle cx="425" cy="185" r="54" fill="#34d399" opacity="0.2"/>
          <!-- Rak Buku Keluli Berat Bergeser ke Kanan -->
          <g transform="translate(230, 0)">
            <rect x="330" y="65" width="265" height="360" fill="#1b303a" stroke="#040709" stroke-width="5"/>
            <rect x="350" y="90" width="225" height="86" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="350" y="196" width="225" height="86" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="350" y="302" width="225" height="96" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="366" y="114" width="24" height="58" fill="#8b4d2b" stroke="#040709" stroke-width="2"/>
            <rect x="394" y="106" width="28" height="66" fill="#2a7f8e" stroke="#040709" stroke-width="2"/>
            <rect x="426" y="120" width="22" height="52" fill="#d99b38" stroke="#040709" stroke-width="2"/>
            <rect x="372" y="214" width="32" height="64" fill="#1f5363" stroke="#040709" stroke-width="2"/>
            <rect x="410" y="222" width="26" height="56" fill="#7f1d1d" stroke="#040709" stroke-width="2"/>
          </g>
          <!-- Kesan Debu & Bunyi Mekanikal -->
          <circle cx="292" cy="408" r="18" fill="#9bb3bd" opacity="0.22"/>
          <circle cx="322" cy="416" r="24" fill="#9bb3bd" opacity="0.16"/>
          <text x="118" y="146" fill="#f2b749" font-family="Fraunces, serif" font-size="38" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-9 118 146)">GRRKKK...</text>
        </svg>
      `;

    case 'biovault_glimpse':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="bioVaultChamber" cx="50%" cy="46%" r="58%">
              <stop offset="0%" stop-color="#2ea877" stop-opacity="0.34"/>
              <stop offset="48%" stop-color="#dc3545" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#081014"/>
          <rect width="960" height="510" fill="url(#bioVaultChamber)"/>
          <!-- Dinding & Lantai Bilik Kebal -->
          <rect x="0" y="395" width="960" height="115" fill="#0b151a" stroke="#040709" stroke-width="4"/>
          <!-- Tiub Spesimen Kuarantin Kiri & Kanan -->
          <rect x="130" y="105" width="76" height="260" rx="34" fill="#0e2a2e" stroke="#040709" stroke-width="4"/>
          <rect x="148" y="135" width="40" height="200" rx="20" fill="#2ea877" opacity="0.38"/>
          <rect x="754" y="105" width="76" height="260" rx="34" fill="#0e2a2e" stroke="#040709" stroke-width="4"/>
          <rect x="772" y="135" width="40" height="200" rx="20" fill="#2ea877" opacity="0.38"/>
          <!-- Peti Kebal Bio-Vault Utama -->
          <rect x="305" y="76" width="350" height="319" rx="14" fill="#182730" stroke="#040709" stroke-width="6"/>
          <circle cx="480" cy="242" r="88" fill="#101c22" stroke="#040709" stroke-width="5"/>
          <circle cx="480" cy="242" r="34" fill="#d99b38" stroke="#040709" stroke-width="4"/>
          <line x1="480" y1="160" x2="480" y2="324" stroke="#040709" stroke-width="6"/>
          <line x1="398" y1="242" x2="562" y2="242" stroke="#040709" stroke-width="6"/>
          <rect x="378" y="102" width="204" height="30" rx="4" fill="#091217" stroke="#040709" stroke-width="3"/>
          <text x="480" y="122" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">BILIK KEBAL BIO-VAULT</text>
        </svg>
      `;

    case 'victory_door_open':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="greenEscapeGlow" cx="50%" cy="46%" r="58%">
              <stop offset="0%" stop-color="#34d399" stop-opacity="0.7"/>
              <stop offset="52%" stop-color="#1d615c" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#081317"/>
          <rect width="960" height="510" fill="url(#greenEscapeGlow)"/>
          <rect x="0" y="425" width="960" height="85" fill="#091115" stroke="#040709" stroke-width="4"/>
          <!-- Lampu Pintu Bertukar Hijau -->
          <rect x="405" y="36" width="150" height="38" rx="6" fill="#0f5132" stroke="#040709" stroke-width="4"/>
          <text x="480" y="61" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">DINYAHAKTIFKAN</text>
          <!-- Bingkai Pintu Keluli & Daun Pintu Terbuka -->
          <rect x="315" y="96" width="330" height="329" fill="#0d2927" stroke="#040709" stroke-width="6"/>
          <polygon points="330,108 440,126 440,410 330,425" fill="#182c36" stroke="#040709" stroke-width="4"/>
          <polygon points="630,108 520,126 520,410 630,425" fill="#182c36" stroke="#040709" stroke-width="4"/>
          <!-- Cahaya Koridor Luar Makmal -->
          <rect x="440" y="126" width="80" height="284" fill="#a7f3d0" opacity="0.4"/>
          <text x="148" y="176" fill="#6ee7b7" font-family="Fraunces, serif" font-size="38" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-10 148 176)">KLIK... ZZZT!</text>
        </svg>
      `;

    case 'victory_monitor_clear':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <rect width="960" height="510" fill="#071115"/>
          <rect x="190" y="45" width="580" height="370" rx="14" fill="#172730" stroke="#040709" stroke-width="6"/>
          <rect x="218" y="72" width="524" height="300" rx="6" fill="#07221c" stroke="#040709" stroke-width="4"/>
          <rect x="440" y="415" width="80" height="45" fill="#111e25" stroke="#040709" stroke-width="4"/>
          <rect x="360" y="455" width="240" height="24" rx="4" fill="#182a33" stroke="#040709" stroke-width="4"/>
          <circle cx="480" cy="162" r="54" fill="#10b981" stroke="#040709" stroke-width="4"/>
          <path d="M454 162 L472 180 L508 142" fill="none" stroke="#040709" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="480" y="256" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="24" font-weight="700">EC: 1.8 mS/cm · STABIL</text>
          <text x="480" y="298" text-anchor="middle" fill="#fef08a" font-family="JetBrains Mono, monospace" font-size="21" font-weight="700">GAS BERACUN DIBATALKAN</text>
          <text x="480" y="336" text-anchor="middle" fill="#9bb3bd" font-family="Plus Jakarta Sans, sans-serif" font-size="14">PROTOKOL SAINS PERTANIAN SEMESTER 1 DISAHKAN</text>
        </svg>
      `;

    case 'victory_escape':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="dawnSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#173d4a"/>
              <stop offset="60%" stop-color="#2ea877" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#0b151a"/>
            </linearGradient>
          </defs>
          <rect width="960" height="510" fill="url(#dawnSky)"/>
          <!-- Bangunan Makmal Agro & Pokok di Luar -->
          <rect x="0" y="370" width="960" height="140" fill="#0d1c22" stroke="#040709" stroke-width="4"/>
          <circle cx="715" cy="140" r="46" fill="#f2b749" opacity="0.55"/>
          <path d="M80 370 Q150 265 215 370 Z" fill="#13382e" stroke="#040709" stroke-width="3"/>
          <path d="M745 370 Q820 250 895 370 Z" fill="#13382e" stroke="#040709" stroke-width="3"/>
          <!-- Siluet Pelajar Melangkah Keluar Dengan Nota -->
          <path d="M410 510 C420 350 450 295 485 295 C520 295 545 350 555 510 Z" fill="#e6eff2" stroke="#040709" stroke-width="4"/>
          <circle cx="482" cy="245" r="36" fill="#d9b493" stroke="#040709" stroke-width="4"/>
          <path d="M447 239 C448 206 472 198 492 200 C512 202 518 220 517 240 Z" fill="#141b1f" stroke="#040709" stroke-width="3"/>
          <text x="480" y="106" text-anchor="middle" fill="#fef08a" font-family="Fraunces, serif" font-size="32" font-weight="700" stroke="#040709" stroke-width="1.5">MISI ESCAPE: MAKMAL AGRO SELESAI!</text>
        </svg>
      `;

    case 'gameover_alarm':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="goAlarmGlow" cx="50%" cy="22%" r="60%">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.82"/>
              <stop offset="52%" stop-color="#991b1b" stop-opacity="0.32"/>
              <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="ventJetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ccfbf1" stop-opacity="0.72"/>
              <stop offset="65%" stop-color="#5eead4" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#5eead4" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <rect width="960" height="510" fill="#090b0e"/>
          <rect class="anim-alarm-pulse" width="960" height="510" fill="url(#goAlarmGlow)"/>
          <!-- Corong Injap Pengudaraan Siling Terbuka + Pancutan Gas Beranimasi -->
          <rect x="260" y="18" width="440" height="56" rx="4" fill="#18242b" stroke="#040709" stroke-width="5"/>
          <line x1="290" y1="36" x2="670" y2="36" stroke="#05080a" stroke-width="4"/>
          <line x1="290" y1="54" x2="670" y2="54" stroke="#05080a" stroke-width="4"/>
          <g class="anim-vapor-jet">
            <path d="M295 74 L225 225 L365 225 L345 74 Z" fill="url(#ventJetGrad)"/>
            <path d="M615 74 L595 225 L735 225 L665 74 Z" fill="url(#ventJetGrad)"/>
          </g>
          <g class="anim-vapor-jet anim-vapor-jet-delayed">
            <path d="M350 74 L315 190 L415 190 L405 74 Z" fill="url(#ventJetGrad)"/>
            <path d="M555 74 L545 190 L645 190 L610 74 Z" fill="url(#ventJetGrad)"/>
          </g>
          <!-- Lampu Penggera Merah Berkelip -->
          <g class="anim-alarm-pulse">
            <rect x="444" y="88" width="72" height="44" rx="10" fill="#dc2626" stroke="#040709" stroke-width="4"/>
            <path d="M398 108 L330 88 M562 108 L630 88 M410 132 L352 162 M550 132 L608 162" stroke="#fca5a5" stroke-width="4" stroke-linecap="round"/>
          </g>
          <!-- Paparan Pemasa 00:00 -->
          <rect x="265" y="185" width="430" height="190" rx="12" fill="#141e24" stroke="#040709" stroke-width="6"/>
          <rect x="292" y="210" width="376" height="140" rx="6" fill="#23080d" stroke="#040709" stroke-width="4"/>
          <text x="480" y="252" text-anchor="middle" fill="#fca5a5" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">BAHAYA: GAS BERACUN DILEPASKAN</text>
          <text class="anim-alarm-timer" x="480" y="318" text-anchor="middle" fill="#ff4d5a" font-family="JetBrains Mono, monospace" font-size="64" font-weight="700">00:00</text>
          <g class="anim-hiss-burst">
            <text x="128" y="198" fill="#99f6e4" font-family="Fraunces, serif" font-size="36" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-12 128 198)">HSSSSS!!</text>
          </g>
          <g class="anim-hiss-burst" style="animation-delay: 0.35s;">
            <text x="692" y="182" fill="#ff7b89" font-family="Fraunces, serif" font-size="30" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(10 692 182)">HSSSSS!!</text>
          </g>
        </svg>
      `;

    case 'gameover_gas':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="gasMistGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#99f6e4" stop-opacity="0.72"/>
              <stop offset="55%" stop-color="#2dd4bf" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#071014" stop-opacity="0.92"/>
            </linearGradient>
          </defs>
          <rect width="960" height="510" fill="#071014"/>
          <!-- Pintu Keluar & Meja Makmal Tenggelam Dalam Kabus -->
          <rect x="340" y="108" width="280" height="322" fill="#122128" stroke="#040709" stroke-width="5"/>
          <rect x="370" y="216" width="220" height="44" rx="4" fill="#7f1d1d" stroke="#040709" stroke-width="4"/>
          <text x="480" y="244" text-anchor="middle" fill="#fecaca" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">DIKUNCI SEPENUHNYA</text>
          <!-- Siluet Pelajar Terperangkap Sambil Batuk di Hadapan Pintu -->
          <g opacity="0.86">
            <path d="M398 510 C408 362 436 312 480 312 C524 312 552 362 562 510 Z" fill="#081217" stroke="#020507" stroke-width="4"/>
            <circle cx="480" cy="264" r="35" fill="#081217" stroke="#020507" stroke-width="4"/>
            <path d="M442 356 Q468 326 488 302" fill="none" stroke="#081217" stroke-width="18" stroke-linecap="round"/>
          </g>
          <!-- Corong Siling & Kepulan Gas Pensterilan Putih-Teal -->
          <rect x="190" y="22" width="140" height="36" rx="4" fill="#1e313a" stroke="#040709" stroke-width="4"/>
          <rect x="630" y="22" width="140" height="36" rx="4" fill="#1e313a" stroke="#040709" stroke-width="4"/>
          <path d="M230 58 C185 170 95 250 85 385 L430 385 C390 250 320 155 290 58 Z" fill="url(#gasMistGrad)"/>
          <path d="M670 58 C640 165 565 250 530 385 L885 385 C865 245 785 160 730 58 Z" fill="url(#gasMistGrad)"/>
          <!-- Kabus Pensterilan Lut Sinar Meningkat Merentasi Siluet -->
          <g class="anim-mist-rise">
            <ellipse cx="245" cy="405" rx="230" ry="78" fill="#ccfbf1" opacity="0.32"/>
            <ellipse cx="500" cy="368" rx="280" ry="86" fill="#99f6e4" opacity="0.30"/>
            <ellipse cx="755" cy="408" rx="220" ry="74" fill="#ccfbf1" opacity="0.31"/>
          </g>
          <g class="anim-mist-rise-slow">
            <ellipse cx="480" cy="430" rx="340" ry="92" fill="#5eead4" opacity="0.24"/>
            <ellipse cx="360" cy="328" rx="210" ry="64" fill="#ccfbf1" opacity="0.20"/>
          </g>
          <g class="anim-mist-swirl">
            <ellipse cx="600" cy="316" rx="220" ry="68" fill="#99f6e4" opacity="0.22"/>
            <ellipse cx="475" cy="260" rx="240" ry="54" fill="#ccfbf1" opacity="0.16"/>
          </g>
        </svg>
      `;

    case 'gameover_silhouette':
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="fadeDarkFog" cx="50%" cy="46%" r="54%">
              <stop offset="0%" stop-color="#2a6f7d" stop-opacity="0.34"/>
              <stop offset="65%" stop-color="#0b151a" stop-opacity="0.82"/>
              <stop offset="100%" stop-color="#040709" stop-opacity="1"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#040709"/>
          <rect width="960" height="510" fill="url(#fadeDarkFog)"/>
          <!-- Siluet Pelajar Pudar Dalam Kabus -->
          <g opacity="0.58">
            <path d="M395 510 C405 345 438 292 480 292 C522 292 555 345 565 510 Z" fill="#091318" stroke="#020405" stroke-width="4"/>
            <circle cx="480" cy="238" r="38" fill="#091318" stroke="#020405" stroke-width="4"/>
          </g>
          <!-- Kepulan Kabus Tebal Melitupi Latar Depan -->
          <ellipse cx="320" cy="390" rx="260" ry="92" fill="#5eead4" opacity="0.12"/>
          <ellipse cx="640" cy="410" rx="270" ry="96" fill="#99f6e4" opacity="0.1"/>
          <ellipse cx="480" cy="465" rx="420" ry="85" fill="#050a0d" opacity="0.85"/>
          <text x="480" y="96" text-anchor="middle" fill="#ff7b89" font-family="Fraunces, serif" font-size="28" font-weight="700">GAS BERACUN MAKMAL AGRO DILEPASKAN</text>
        </svg>
      `;

    case 'lab_instruments':
    default:
      return `
        <svg viewBox="0 0 960 510" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="lampCone" cx="50%" cy="18%" r="65%">
              <stop offset="0%" stop-color="#f2b749" stop-opacity="0.32"/>
              <stop offset="60%" stop-color="#2a7f8e" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#060b0e" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="960" height="510" fill="#091318"/>
          <rect width="960" height="510" fill="url(#lampCone)"/>
          <!-- Permukaan Meja -->
          <rect x="0" y="335" width="960" height="175" fill="#13242c" stroke="#040709" stroke-width="5"/>
          <!-- Mikroskop di kiri -->
          <g stroke="#040709" stroke-width="3.5">
            <rect x="190" y="325" width="110" height="22" rx="3" fill="#2b4552"/>
            <path d="M235 325 C205 280 210 205 255 180 L275 192 C240 218 240 278 262 325 Z" fill="#3a5c6b"/>
            <rect x="258" y="145" width="22" height="72" rx="2" transform="rotate(24 268 180)" fill="#d99b38"/>
            <rect x="225" y="268" width="70" height="10" fill="#182b33"/>
          </g>
          <!-- Buku Nota Kuliah di tengah -->
          <g transform="translate(380, 295)" stroke="#040709" stroke-width="3.5">
            <rect x="0" y="18" width="200" height="115" rx="4" fill="#1e4350"/>
            <rect x="10" y="10" width="180" height="110" rx="3" fill="#e7dcc3"/>
            <line x1="100" y1="10" x2="100" y2="120" stroke="#040709" stroke-width="2.5"/>
            <line x1="25" y1="36" x2="86" y2="36" stroke="#1b4652" stroke-width="2.5"/>
            <line x1="25" y1="54" x2="82" y2="54" stroke="#1b4652" stroke-width="2.5"/>
            <line x1="25" y1="72" x2="78" y2="72" stroke="#1b4652" stroke-width="2.5"/>
            <path d="M145 45 C132 58 130 74 145 86 C160 74 158 58 145 45 Z" fill="#2ea877" stroke="#040709" stroke-width="2"/>
          </g>
          <!-- Bikar & Tabung Uji di kanan -->
          <g stroke="#040709" stroke-width="3.5">
            <rect x="655" y="235" width="66" height="110" rx="4" fill="rgba(42,127,142,0.35)"/>
            <rect x="659" y="285" width="58" height="56" fill="#2a7f8e"/>
            <rect x="752" y="210" width="16" height="135" rx="8" fill="#1b4652"/>
            <rect x="782" y="224" width="16" height="121" rx="8" fill="#d99b38"/>
          </g>
        </svg>
      `;
  }
}

function buildIntroCutscene(playerName) {
  return [
    {
      visualId: 'card_swipe',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'neutral',
      onEnterSound: () => {
        playSFX('pickup');
        soundManager.playBGM('calm');
      },
      text: 'BIP! Kad akses makmal berjaya diimbas. Baiklah, aku nak semak sampel tugasan Semester 1 dulu sebelum balik...',
    },
    {
      visualId: 'dusk_window',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'neutral',
      sfx: 'page',
      text: 'Fuh, akhirnya siap juga semak sampel tugasan Semester 1 ni... Eh, sunyi semacam je makmal? Rasanya semua orang dah balik.',
    },
    {
      visualId: 'locked_door',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'neutral',
      onEnterSound: () => {
        soundManager.playDoorSlamLock();
        soundManager.playBGM('tense');
      },
      text: 'KLANG!! Bunyi apa tu?! Pintu utama Makmal Agro... terkunci rapat?! Kenapa penggera kecemasan tiba-tiba menyala?',
    },
    {
      visualId: 'warning_monitor',
      speaker: 'SISTEM PROF. RAZAK',
      speakerType: 'system',
      sfx: 'alarm',
      text: 'AMARAN KECEMASAN! Pintu Makmal Agro telah dikunci secara automatik. Gas beracun untuk pensterilan akan dilepaskan sebaik sahaja pemasa tamat (00:00) kecuali semua protokol eksperimen disahkan!',
    },
    {
      visualId: 'lab_instruments',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'neutral',
      sfx: 'click',
      nextLabel: 'Masuk Makmal ▸',
      text: 'Alamak! Satu-satunya jalan keluar dari Makmal Agro ni ialah selesaikan semua uji kaji. Nasib baik aku ingat nota kuliah Sains Pertanian... Masa berjalan, jom siasat!',
    },
  ];
}

function buildVictoryCutscene(playerName) {
  return [
    {
      visualId: 'victory_door_open',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'happy',
      onEnterSound: () => {
        soundManager.playDoorOpen();
        soundManager.playBGM('victory');
      },
      text: 'KLIK... ZZZT! Kunci magnetik pintu utama akhirnya terlepas! Lampu amaran merah dah bertukar hijau!',
    },
    {
      visualId: 'victory_monitor_clear',
      speaker: 'SISTEM PROF. RAZAK',
      speakerType: 'system',
      sfx: 'pickup',
      text: 'PENENTUKURAN EC 1.8 mS/cm DISAHKAN. Sistem penguncian Makmal Agro dibatalkan dan pelepasan gas beracun diberhentikan.',
    },
    {
      visualId: 'victory_escape',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'happy',
      sfx: 'bonus',
      nextLabel: 'Lihat Sijil & Keputusan ▸',
      text: 'Fuh, selamat juga akhirnya! Ilmu NPK, pH tanah, tekstur USDA, anatomi tumbuhan, taksonomi dan EC betul-betul menyelamatkan aku malam ni!',
    },
  ];
}

function buildGameOverCutscene(playerName) {
  return [
    {
      visualId: 'gameover_alarm',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'shocked',
      frameShake: true,
      typeSpeed: 25,
      onEnterSound: () => {
        playSFX('alarm');
        soundManager.playGasHiss();
      },
      text: 'TIDAK!! Masa dah tamat! Injap gas beracun atas siling Makmal Agro mula terbuka...',
    },
    {
      visualId: 'gameover_gas',
      speaker: 'SISTEM PROF. RAZAK',
      speakerType: 'system',
      portraitType: 'player',
      emotion: 'coughing',
      typeSpeed: 25,
      onEnterSound: () => soundManager.playGasHiss(),
      text: 'AMARAN KRITIKAL: GAS BERACUN DILEPASKAN. SEMUA PINTU KELUAR MAKMAL AGRO DIKUNCI SEPENUHNYA.',
    },
    {
      visualId: 'gameover_silhouette',
      speaker: playerName,
      speakerType: 'player',
      emotion: 'dizzy',
      visualBlur: true,
      portraitDroop: true,
      textFaint: true,
      typeSpeed: 65,
      dotPauseMs: 320,
      instantButtonAdvance: true,
      onEnterSound: () => soundManager.playLoseSound(),
      nextLabel: 'Lihat Keputusan ▸',
      text: 'Pandangan aku mula kabur...',
    },
  ];
}

/**
 * Fungsi boleh guna semula untuk mencetuskan mana-mana cutscene gaya Ghost Case
 * (Digunakan untuk Intro, Bilik Rahsia view5, dan Tamat Kemenangan dalam Bahagian 2–4)
 */
function triggerCutscene(panelsArray, callback) {
  if (!Array.isArray(panelsArray) || panelsArray.length === 0) {
    if (typeof callback === 'function') callback();
    return;
  }

  clearTimeout(activeCutscene.typingTimer);
  activeCutscene = {
    panels: panelsArray,
    index: 0,
    charIndex: 0,
    typingTimer: null,
    isTyping: false,
    onComplete: callback || null,
  };

  dom.registrationScreen.classList.remove('active');
  dom.registrationScreen.hidden = true;
  dom.gameScreen.hidden = true;
  dom.cutsceneScreen.hidden = false;
  dom.cutsceneScreen.classList.add('active');

  renderCutscenePanel();
}

function resetCutsceneEffectClasses() {
  if (dom.cutsceneFrame) {
    dom.cutsceneFrame.classList.remove('is-shaking');
  }
  if (dom.cutsceneVisual) {
    dom.cutsceneVisual.classList.remove('is-fainting-blur');
  }
  if (dom.cutscenePortrait) {
    dom.cutscenePortrait.classList.remove('is-drooping');
  }
  if (dom.cutsceneText) {
    dom.cutsceneText.classList.remove('is-fainting');
  }
}

function renderCutscenePanel() {
  const panel = activeCutscene.panels[activeCutscene.index];
  if (!panel) {
    finishCutscene();
    return;
  }

  // Kemas kini penunjuk kemajuan
  dom.cutsceneProgress.innerHTML = activeCutscene.panels
    .map((_, idx) => {
      const cls =
        idx < activeCutscene.index
          ? 'cutscene-pip done'
          : idx === activeCutscene.index
            ? 'cutscene-pip active'
            : 'cutscene-pip';
      return `<span class="${cls}"></span>`;
    })
    .join('');

  // Tetapkan semula kelas kesan visual sebelum merender slaid semasa
  resetCutsceneEffectClasses();

  // Ilustrasi & potret
  dom.cutsceneVisual.innerHTML = panel.customSvg || getCutscenePanelSVG(panel.visualId);
  const isSystem = panel.speakerType === 'system';
  const portraitType = panel.portraitType || (isSystem ? 'system' : 'player');
  dom.cutscenePortrait.innerHTML = getPortraitSVG(
    portraitType,
    gameState.avatar,
    panel.emotion || 'neutral'
  );
  dom.cutsceneSpeaker.textContent = panel.speaker;
  dom.cutsceneSpeaker.classList.toggle('is-system', isSystem);

  if (panel.frameShake && dom.cutsceneFrame) {
    void dom.cutsceneFrame.offsetWidth;
    dom.cutsceneFrame.classList.add('is-shaking');
  }
  if (panel.visualBlur && dom.cutsceneVisual) {
    void dom.cutsceneVisual.offsetWidth;
    dom.cutsceneVisual.classList.add('is-fainting-blur');
  }
  if (panel.portraitDroop && dom.cutscenePortrait) {
    void dom.cutscenePortrait.offsetWidth;
    dom.cutscenePortrait.classList.add('is-drooping');
  }
  if (panel.textFaint && dom.cutsceneText) {
    void dom.cutsceneText.offsetWidth;
    dom.cutsceneText.classList.add('is-fainting');
  }

  if (typeof panel.onEnterSound === 'function') {
    panel.onEnterSound();
  } else if (panel.sfx) {
    playSFX(panel.sfx);
  }

  // Kesan mesin taip (typewriter)
  clearTimeout(activeCutscene.typingTimer);
  activeCutscene.charIndex = 0;
  activeCutscene.isTyping = true;
  dom.cutsceneText.textContent = '';

  const isLast = activeCutscene.index === activeCutscene.panels.length - 1;
  dom.btnNextCutscene.textContent = isLast
    ? panel.nextLabel || 'Teruskan ▸'
    : 'Seterusnya ▸';

  typeNextChar(panel.text, panel);
}

function typeNextChar(fullText, panel = null) {
  if (!activeCutscene.isTyping) return;
  if (activeCutscene.charIndex < fullText.length) {
    activeCutscene.charIndex += 1;
    const currentChar = fullText.charAt(activeCutscene.charIndex - 1);
    dom.cutsceneText.textContent = fullText.slice(0, activeCutscene.charIndex);

    const isFaintingText = Boolean(panel && panel.textFaint);
    if (isFaintingText) {
      if (currentChar !== '.' && activeCutscene.charIndex % 4 === 0) {
        playSFX('type');
      }
    } else if (activeCutscene.charIndex % 3 === 0) {
      playSFX('type');
    }

    const baseDelay = Number(panel && panel.typeSpeed) > 0 ? Number(panel.typeSpeed) : 22;
    const dotDelay = Number(panel && panel.dotPauseMs) > 0 ? Number(panel.dotPauseMs) : baseDelay;
    const nextChar = fullText.charAt(activeCutscene.charIndex);
    const charDelay =
      currentChar === '.' || (panel && panel.dotPauseMs && nextChar === '.' && activeCutscene.charIndex >= fullText.length - 3)
        ? dotDelay
        : baseDelay;

    activeCutscene.typingTimer = setTimeout(() => typeNextChar(fullText, panel), charDelay);
  } else {
    activeCutscene.isTyping = false;
  }
}

function advanceCutscene(fromNextButton = false) {
  const panel = activeCutscene.panels[activeCutscene.index];
  if (!panel) {
    finishCutscene();
    return;
  }

  // Jika masih menaip, lengkapkan ayat terus pada klik pertama
  // (Kecuali jika butang utama ditekan pada slaid terakhir yang membenarkan terus mara)
  if (activeCutscene.isTyping) {
    clearTimeout(activeCutscene.typingTimer);
    activeCutscene.isTyping = false;
    dom.cutsceneText.textContent = panel.text;
    if (!(fromNextButton && panel.instantButtonAdvance)) {
      playSFX('click');
      return;
    }
  }

  playSFX('click');
  activeCutscene.index += 1;
  if (activeCutscene.index >= activeCutscene.panels.length) {
    finishCutscene();
  } else {
    renderCutscenePanel();
  }
}

function finishCutscene() {
  clearTimeout(activeCutscene.typingTimer);
  activeCutscene.isTyping = false;
  resetCutsceneEffectClasses();
  dom.cutsceneScreen.hidden = true;
  dom.cutsceneScreen.classList.remove('active');

  const cb = activeCutscene.onComplete;
  activeCutscene.onComplete = null;
  if (typeof cb === 'function') {
    cb();
  }
}

// ============================================================================
// 7. PEMASA 10 MINIT, FASA KETEGANGAN 3-PERINGKAT, BONUS +60s & PENALTI MASA
// ============================================================================

let bonusBadgeTimeoutId = null;

function formatSeconds(sec) {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateTimerAndTensionUI() {
  dom.hudTimer.textContent = formatSeconds(gameState.remainingSeconds);
  dom.hudMistakesCount.textContent = String(gameState.mistakes);

  const isPaused = Boolean(gameState.isTimerPaused);
  if (dom.hudTimerBox) {
    dom.hudTimerBox.classList.toggle('is-paused', isPaused);
  }
  if (dom.hudPausedBadge) {
    dom.hudPausedBadge.hidden = !isPaused;
  }

  const s = gameState.remainingSeconds;
  dom.body.classList.remove('tension-phase-1', 'tension-phase-2', 'tension-phase-3');

  if (s <= 120) {
    dom.body.classList.add('tension-phase-3');
    if (gameState.isGameActive && !isPaused && !gameState.flags.phase3Warned) {
      gameState.flags.phase3Warned = true;
      playSFX('alarm');
      showDialogue(
        gameState.playerName,
        'TINGGAL 2 MINIT SAHAJA! Penggera gas beracun dah hampir ke tahap kritikal—aku kena cepat!',
        'warning'
      );
    }
  } else if (s <= 300) {
    dom.body.classList.add('tension-phase-2');
    if (gameState.isGameActive && !isPaused && !gameState.flags.phase2Warned) {
      gameState.flags.phase2Warned = true;
      playSFX('alarm');
      showDialogue(
        gameState.playerName,
        'Eh, udara makmal makin berat... Paras oksigen dah mula menurun! Tinggal separuh masa sahaja lagi.',
        'warning'
      );
    }
  } else {
    dom.body.classList.add('tension-phase-1');
  }
}

function startCountdownTimer() {
  stopCountdownTimer();
  updateTimerAndTensionUI();

  timerIntervalId = setInterval(() => {
    if (!gameState.isGameActive || gameState.isTimerPaused) return;
    gameState.totalElapsedSeconds += 1;
    gameState.remainingSeconds = Math.max(0, gameState.remainingSeconds - 1);
    updateTimerAndTensionUI();

    if (gameState.remainingSeconds > 0 && gameState.remainingSeconds <= 120) {
      soundManager.playTick(gameState.remainingSeconds <= 30);
    }

    if (gameState.remainingSeconds <= 0) {
      triggerGameOver();
    }
  }, 1000);
}

function stopCountdownTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

/**
 * Menambah bonus masa +60 saat apabila pemain berjaya menyelesaikan teka-teki utama,
 * mencetuskan lencana hijau zamrud pada HUD serta maklum balas dialog.
 */
function addTimeBonus(seconds = 60, reason = '') {
  if (!gameState.isGameActive) return;

  const bonus = Math.max(1, Number(seconds) || 60);
  gameState.remainingSeconds += bonus;
  updateTimerAndTensionUI();

  if (dom.hudTimerBox) {
    dom.hudTimerBox.classList.remove('is-bonus');
    void dom.hudTimerBox.offsetWidth;
    dom.hudTimerBox.classList.add('is-bonus');
  }

  if (dom.hudBonusBadge) {
    dom.hudBonusBadge.textContent = `+${bonus} SAAT!`;
    dom.hudBonusBadge.hidden = false;
  }

  clearTimeout(bonusBadgeTimeoutId);
  bonusBadgeTimeoutId = setTimeout(() => {
    if (dom.hudTimerBox) dom.hudTimerBox.classList.remove('is-bonus');
    if (dom.hudBonusBadge) dom.hudBonusBadge.hidden = true;
  }, 2400);

  soundManager.playTimeBonus();
  const suffix = reason ? ` (${TOPIC_LABELS[reason] || reason})` : '';
  showDialogue(
    'SISTEM MAKMAL AGRO',
    `Protokol disahkan! Pelepasan gas beracun ditangguhkan selama ${bonus} saat!${suffix}`,
    'bonus'
  );
}

/**
 * Menolak masa pada percubaan salah, berkelip merah, merekod pecahan kesalahan
 * dan memaparkan amaran dalam kotak dialog.
 */
function applyTimePenalty(seconds = 30, puzzleId = 'general', customWarning = '') {
  if (!gameState.isGameActive) return;

  const penalty = Math.max(1, Number(seconds) || 30);
  gameState.remainingSeconds = Math.max(0, gameState.remainingSeconds - penalty);
  gameState.mistakes += 1;

  if (!Object.prototype.hasOwnProperty.call(gameState.mistakeBreakdown, puzzleId)) {
    gameState.mistakeBreakdown[puzzleId] = 0;
  }
  gameState.mistakeBreakdown[puzzleId] += 1;

  // Kilasan amaran merah
  dom.penaltyFlash.classList.remove('active');
  void dom.penaltyFlash.offsetWidth; // paksa reflow animasi
  dom.penaltyFlash.classList.add('active');

  playSFX('penalty');
  updateTimerAndTensionUI();

  const message =
    customWarning ||
    `Aduh! Jawapan tak tepat (${TOPIC_LABELS[puzzleId] || 'Uji Kaji'}) — sistem menolak ${penalty} saat sebelum gas beracun dilepaskan!`;

  showDialogue(gameState.playerName, message, 'warning');

  if (gameState.remainingSeconds <= 0) {
    triggerGameOver();
  }
}

function countSolvedPuzzles() {
  const p = gameState.puzzles || {};
  return [
    Boolean(p.greenhouseRack),
    Boolean(p.soilCabinet),
    Boolean(p.soilTriangle),
    Boolean(p.microscope),
    Boolean(p.bioVault),
    Boolean(p.controlPanel),
  ].filter(Boolean).length;
}

function triggerGameOver() {
  if (!gameState.isGameActive && gameState.recordSaved) return;
  gameState.isGameActive = false;
  gameState.isTimerPaused = false;
  gameState.pauseStartedAt = null;
  gameState.endTimeISO = new Date().toISOString();
  stopCountdownTimer();

  closeAllGameplayModals();
  updateTimerAndTensionUI();
  soundManager.playDoorSlamLock();
  soundManager.playBGM('fail');

  const savedRecord = saveGameRecord('MASA TAMAT');
  const gameOverPanels = buildGameOverCutscene(gameState.playerName || 'Pelajar');
  triggerCutscene(gameOverPanels, () => {
    showEndScreen('MASA TAMAT', savedRecord);
  });
}

function completeGame() {
  if (!gameState.isGameActive && gameState.recordSaved) return;
  gameState.isGameActive = false;
  gameState.isTimerPaused = false;
  gameState.pauseStartedAt = null;
  gameState.endTimeISO = new Date().toISOString();
  stopCountdownTimer();

  closeAllGameplayModals();
  updateTimerAndTensionUI();
  soundManager.playWinFanfare();
  soundManager.playBGM('victory');

  const savedRecord = saveGameRecord('BERJAYA');
  showEndScreen('BERJAYA', savedRecord);
}

function closeAllGameplayModals() {
  closeNotebookModal(true);
  closeInspectModal();
}

function formatCertificateDate(record) {
  const iso = record && record.timestampISO ? record.timestampISO : null;
  const dateObj = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dateObj.getTime())) {
    return (record && record.tarikhMasa) || new Date().toLocaleDateString('ms-MY');
  }
  return dateObj.toLocaleDateString('ms-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCertificateGrade(gradeText) {
  const raw = String(gradeText || '');
  if (raw.includes('A+')) return 'Gred A+ — Pakar Agronomi Muda';
  if (raw.includes('Gred A ')) return 'Gred A — Pelajar Cemerlang';
  if (raw.includes('Gred B')) return 'Gred B — Lulus Kepujian';
  if (raw.includes('Gred C')) return 'Gred C — Nyaris Terperangkap';
  return raw || 'Gred A — Pelajar Cemerlang';
}

function renderVictoryCertificatePreview(record) {
  if (!dom.victoryCertificatePreview) return;
  const playerName = escapeHtml(record.nama || 'Pelajar');
  const rawMatric = String(record.noMatrik || '').trim();
  const hasMatric = Boolean(rawMatric && rawMatric !== '-');
  const avatarType = record.avatar || gameState.avatar || 'male';
  const durationLabel = formatSeconds(record.durationSeconds || 0);
  const gradeLabel = escapeHtml(formatCertificateGrade(record.grade));
  const dateLabel = escapeHtml(formatCertificateDate(record));

  dom.victoryCertificatePreview.innerHTML = `
    <div class="cert-card">
      <span class="cert-corner cert-corner-tl" aria-hidden="true"></span>
      <span class="cert-corner cert-corner-tr" aria-hidden="true"></span>
      <span class="cert-corner cert-corner-bl" aria-hidden="true"></span>
      <span class="cert-corner cert-corner-br" aria-hidden="true"></span>

      <header class="cert-header">
        <svg class="cert-crest" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M12 10 H52 V32 C52 46 32 56 32 56 C32 56 12 46 12 32 Z" fill="#0e2438" stroke="#b8882e" stroke-width="3"/>
          <path d="M32 18 C25 26 23 33 26 40 C29 45 35 45 38 40 C41 33 39 26 32 18 Z" fill="#d99b38"/>
          <line x1="32" y1="22" x2="32" y2="43" stroke="#0e2438" stroke-width="2"/>
        </svg>
        <p class="cert-uni">MAKMAL AGRO · SAINS PERTANIAN</p>
        <p class="cert-program">PROGRAM SAINS PERTANIAN (SEMESTER 1)</p>
        <h3 class="cert-title">SIJIL PENCAPAIAN ESCAPE: MAKMAL AGRO</h3>
        <div class="cert-divider" aria-hidden="true"></div>
      </header>

      <div class="cert-recipient-block">
        <div class="cert-avatar-ring" aria-hidden="true">
          ${getPlayerPortraitSVG(avatarType, 'happy')}
        </div>
        <p class="cert-awarded-to">Dengan ini diperakui bahawa</p>
        <p class="cert-player-name">${playerName}</p>
        ${hasMatric ? `<p class="cert-player-matric">No. Matrik: ${escapeHtml(rawMatric)}</p>` : ''}
        <p class="cert-citation">
          Telah berjaya menyelesaikan kesemua 6 protokol eksperimen Sains Pertanian dan melepaskan diri daripada sistem penguncian Makmal Agro.
        </p>
      </div>

      <div class="cert-metrics-grid">
        <div class="cert-metric">
          <span class="cert-metric-label">Tempoh Masa Tamat</span>
          <span class="cert-metric-val">${durationLabel}</span>
        </div>
        <div class="cert-metric">
          <span class="cert-metric-label">Gred Prestasi</span>
          <span class="cert-metric-val cert-grade-highlight">${gradeLabel}</span>
        </div>
        <div class="cert-metric">
          <span class="cert-metric-label">Tarikh Penyelesaian</span>
          <span class="cert-metric-val">${dateLabel}</span>
        </div>
      </div>

      <footer class="cert-footer">
        <div class="cert-seal-box">
          <svg class="cert-seal-svg" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="32" fill="#0d5c45" stroke="#b8882e" stroke-width="3" stroke-dasharray="4 2"/>
            <circle cx="36" cy="36" r="24" fill="#0e2438" stroke="#d99b38" stroke-width="2"/>
            <path d="M25 37 L32 44 L47 28" fill="none" stroke="#f3be5a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="cert-seal-text">DISAHKAN OLEH SISTEM MAKMAL PROF. RAZAK</span>
        </div>

        <div class="cert-signature-box">
          <svg class="cert-signature-svg" viewBox="0 0 180 42" aria-hidden="true">
            <path d="M18 30 Q35 8 44 26 T68 18 Q78 28 96 14 T132 24 Q146 16 162 24" fill="none" stroke="#0e2438" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          <div class="cert-signature-line"></div>
          <p class="cert-signature-name">Prof. Dr. Razak bin Ahmad</p>
          <p class="cert-signature-role">Ketua Makmal Agro</p>
        </div>
      </footer>
    </div>
  `;
}

function drawCertificateAvatar(ctx, cx, cy, radius, avatarType) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Latar gelap potret
  ctx.fillStyle = '#122933';
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  const s = (radius * 2) / 64;
  const ox = cx - radius;
  const oy = cy - radius;

  // Kot makmal putih
  ctx.beginPath();
  ctx.moveTo(ox + 12 * s, oy + 64 * s);
  ctx.bezierCurveTo(ox + 14 * s, oy + 48 * s, ox + 22 * s, oy + 44 * s, ox + 32 * s, oy + 44 * s);
  ctx.bezierCurveTo(ox + 42 * s, oy + 44 * s, ox + 50 * s, oy + 48 * s, ox + 52 * s, oy + 64 * s);
  ctx.closePath();
  ctx.fillStyle = '#e6eff2';
  ctx.fill();
  ctx.lineWidth = 2.4 * s;
  ctx.strokeStyle = '#05080a';
  ctx.stroke();

  if (avatarType === 'female') {
    // Tudung teal gelap kemas
    ctx.beginPath();
    ctx.moveTo(ox + 16 * s, oy + 32 * s);
    ctx.bezierCurveTo(ox + 16 * s, oy + 14 * s, ox + 24 * s, oy + 10 * s, ox + 32 * s, oy + 10 * s);
    ctx.bezierCurveTo(ox + 40 * s, oy + 10 * s, ox + 48 * s, oy + 14 * s, ox + 48 * s, oy + 32 * s);
    ctx.lineTo(ox + 46 * s, oy + 49 * s);
    ctx.bezierCurveTo(ox + 40 * s, oy + 53 * s, ox + 24 * s, oy + 53 * s, ox + 18 * s, oy + 49 * s);
    ctx.closePath();
    ctx.fillStyle = '#1f5868';
    ctx.fill();
    ctx.lineWidth = 2.3 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Wajah
    ctx.beginPath();
    ctx.ellipse(ox + 32 * s, oy + 28 * s, 11.5 * s, 12.5 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e2be9e';
    ctx.fill();
    ctx.lineWidth = 2.1 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Garis anak tudung
    ctx.beginPath();
    ctx.moveTo(ox + 20.5 * s, oy + 24 * s);
    ctx.bezierCurveTo(ox + 23 * s, oy + 17 * s, ox + 41 * s, oy + 17 * s, ox + 43.5 * s, oy + 24 * s);
    ctx.lineWidth = 1.9 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Mata gembira (^ ^), pipi kemerahan & senyuman lebar
    ctx.strokeStyle = '#05080a';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + 24.9 * s, oy + 28.8 * s);
    ctx.quadraticCurveTo(ox + 27.5 * s, oy + 25.4 * s, ox + 30.1 * s, oy + 28.8 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ox + 33.9 * s, oy + 28.8 * s);
    ctx.quadraticCurveTo(ox + 36.5 * s, oy + 25.4 * s, ox + 39.1 * s, oy + 28.8 * s);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232, 122, 122, 0.45)';
    ctx.beginPath();
    ctx.ellipse(ox + 24 * s, oy + 31.5 * s, 2.3 * s, 1.3 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(ox + 40 * s, oy + 31.5 * s, 2.3 * s, 1.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ox + 26.8 * s, oy + 33 * s);
    ctx.quadraticCurveTo(ox + 32 * s, oy + 38.8 * s, ox + 37.2 * s, oy + 33 * s);
    ctx.closePath();
    ctx.fillStyle = '#8f2d39';
    ctx.fill();
    ctx.lineWidth = 1.7 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();
  } else {
    // Kolar dalam & tali leher
    ctx.beginPath();
    ctx.moveTo(ox + 26 * s, oy + 44 * s);
    ctx.lineTo(ox + 32 * s, oy + 54 * s);
    ctx.lineTo(ox + 38 * s, oy + 44 * s);
    ctx.closePath();
    ctx.fillStyle = '#1d4d5c';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Kepala
    ctx.beginPath();
    ctx.arc(ox + 32 * s, oy + 27 * s, 13 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b493';
    ctx.fill();
    ctx.lineWidth = 2.4 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Rambut
    ctx.beginPath();
    ctx.moveTo(ox + 19 * s, oy + 25 * s);
    ctx.bezierCurveTo(ox + 19 * s, oy + 14 * s, ox + 27 * s, oy + 11 * s, ox + 33 * s, oy + 11 * s);
    ctx.bezierCurveTo(ox + 41 * s, oy + 11 * s, ox + 45 * s, oy + 17 * s, ox + 45 * s, oy + 25 * s);
    ctx.bezierCurveTo(ox + 41 * s, oy + 20 * s, ox + 35 * s, oy + 19 * s, ox + 28 * s, oy + 20 * s);
    ctx.bezierCurveTo(ox + 23 * s, oy + 20 * s, ox + 21 * s, oy + 23 * s, ox + 19 * s, oy + 25 * s);
    ctx.closePath();
    ctx.fillStyle = '#141b1f';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();

    // Mata gembira (^ ^), pipi kemerahan & senyuman lebar
    ctx.strokeStyle = '#05080a';
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + 24.4 * s, oy + 28.8 * s);
    ctx.quadraticCurveTo(ox + 27 * s, oy + 25.4 * s, ox + 29.6 * s, oy + 28.8 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ox + 34.4 * s, oy + 28.8 * s);
    ctx.quadraticCurveTo(ox + 37 * s, oy + 25.4 * s, ox + 39.6 * s, oy + 28.8 * s);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232, 122, 122, 0.45)';
    ctx.beginPath();
    ctx.ellipse(ox + 24 * s, oy + 31.5 * s, 2.3 * s, 1.3 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(ox + 40 * s, oy + 31.5 * s, 2.3 * s, 1.3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ox + 26.8 * s, oy + 33 * s);
    ctx.quadraticCurveTo(ox + 32 * s, oy + 38.8 * s, ox + 37.2 * s, oy + 33 * s);
    ctx.closePath();
    ctx.fillStyle = '#8f2d39';
    ctx.fill();
    ctx.lineWidth = 1.7 * s;
    ctx.strokeStyle = '#05080a';
    ctx.stroke();
  }

  ctx.restore();

  // Gelang bingkai emas & biru gelap di luar potret
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#b8882e';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0e2438';
  ctx.stroke();
}

function drawCertificateCorner(ctx, x, y, dx, dy) {
  ctx.save();
  ctx.strokeStyle = '#b8882e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + dy * 34);
  ctx.lineTo(x, y);
  ctx.lineTo(x + dx * 34, y);
  ctx.stroke();

  ctx.strokeStyle = '#0e2438';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + dx * 10, y + dy * 24);
  ctx.lineTo(x + dx * 10, y + dy * 10);
  ctx.lineTo(x + dx * 24, y + dy * 10);
  ctx.stroke();
  ctx.restore();
}

async function generateCertificateCanvas(record) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Teruskan dengan fon sandaran jika perlu
    }
  }

  const width = 1200;
  const height = 850;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Latar Belakang Kertas Sijil Berkrim
  const bgGrad = ctx.createRadialGradient(width / 2, 230, 80, width / 2, height / 2, 760);
  bgGrad.addColorStop(0, '#fffdf7');
  bgGrad.addColorStop(0.65, '#f7efe0');
  bgGrad.addColorStop(1, '#e8dbc0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Bingkai berganda Navy + Emas
  ctx.strokeStyle = '#0e2438';
  ctx.lineWidth = 14;
  ctx.strokeRect(22, 22, width - 44, height - 44);

  ctx.strokeStyle = '#b8882e';
  ctx.lineWidth = 4;
  ctx.strokeRect(38, 38, width - 76, height - 76);

  ctx.strokeStyle = 'rgba(184, 136, 46, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, width - 96, height - 96);

  drawCertificateCorner(ctx, 56, 56, 1, 1);
  drawCertificateCorner(ctx, width - 56, 56, -1, 1);
  drawCertificateCorner(ctx, 56, height - 56, 1, -1);
  drawCertificateCorner(ctx, width - 56, height - 56, -1, -1);

  // 2. Jata Akademik Makmal Agro & Tajuk Rasmi
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(574, 72);
  ctx.lineTo(626, 72);
  ctx.lineTo(626, 102);
  ctx.quadraticCurveTo(626, 122, 600, 134);
  ctx.quadraticCurveTo(574, 122, 574, 102);
  ctx.closePath();
  ctx.fillStyle = '#0e2438';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#b8882e';
  ctx.stroke();

  // Motif daun sains pertanian di tengah perisai
  ctx.beginPath();
  ctx.moveTo(600, 82);
  ctx.bezierCurveTo(590, 93, 588, 103, 592, 113);
  ctx.bezierCurveTo(596, 120, 604, 120, 608, 113);
  ctx.bezierCurveTo(612, 103, 610, 93, 600, 82);
  ctx.closePath();
  ctx.fillStyle = '#d99b38';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(600, 88);
  ctx.lineTo(600, 117);
  ctx.strokeStyle = '#0e2438';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0e2438';
  ctx.font = '700 26px "Fraunces", Georgia, serif';
  ctx.fillText('MAKMAL AGRO · SAINS PERTANIAN', width / 2, 174);

  ctx.fillStyle = '#946617';
  ctx.font = '700 17px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('PROGRAM SAINS PERTANIAN (SEMESTER 1)', width / 2, 204);

  ctx.fillStyle = '#0b1f31';
  ctx.font = '700 34px "Fraunces", Georgia, serif';
  ctx.fillText('SIJIL PENCAPAIAN ESCAPE: MAKMAL AGRO', width / 2, 256);

  // Garis pemisah emas
  const divGrad = ctx.createLinearGradient(360, 0, 840, 0);
  divGrad.addColorStop(0, 'rgba(184,136,46,0)');
  divGrad.addColorStop(0.5, '#b8882e');
  divGrad.addColorStop(1, 'rgba(184,136,46,0)');
  ctx.fillStyle = divGrad;
  ctx.fillRect(360, 272, 480, 3);

  // 3. Potret Avatar Pemain (Lelaki / Perempuan)
  const avatarType = record.avatar || gameState.avatar || 'male';
  drawCertificateAvatar(ctx, width / 2, 344, 54, avatarType);

  // 4. Nama Pemain & No. Matrik
  ctx.fillStyle = '#465768';
  ctx.font = 'italic 18px "Plus Jakarta Sans", Georgia, serif';
  ctx.fillText('Dengan ini diperakui bahawa', width / 2, 428);

  const playerName = String(record.nama || 'Pelajar').trim();
  ctx.font = '700 44px "Fraunces", Georgia, serif';
  // Halus bayangan emas + teks navy gelap
  ctx.fillStyle = 'rgba(184, 136, 46, 0.32)';
  ctx.fillText(playerName, width / 2, 482);
  ctx.fillStyle = '#0e2438';
  ctx.fillText(playerName, width / 2, 480);

  const nameWidth = Math.min(700, Math.max(280, ctx.measureText(playerName).width + 44));
  ctx.fillStyle = '#c7983c';
  ctx.fillRect(width / 2 - nameWidth / 2, 492, nameWidth, 2.5);

  const rawMatric = String(record.noMatrik || '').trim();
  const hasMatric = Boolean(rawMatric && rawMatric !== '-');
  let citationY = 532;
  if (hasMatric) {
    ctx.fillStyle = '#8f6214';
    ctx.font = '700 19px "JetBrains Mono", monospace';
    ctx.fillText(`No. Matrik: ${rawMatric}`, width / 2, 522);
    citationY = 556;
  }

  ctx.fillStyle = '#273b4f';
  ctx.font = '500 19px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(
    'Telah berjaya menyelesaikan kesemua 6 protokol eksperimen Sains Pertanian dan',
    width / 2,
    citationY
  );
  ctx.fillText(
    'melepaskan diri daripada sistem penguncian Makmal Agro.',
    width / 2,
    citationY + 26
  );

  // 5. Kotak Keputusan & Prestasi
  const boxX = 120;
  const boxY = 602;
  const boxW = width - 240;
  const boxH = 88;
  ctx.fillStyle = 'rgba(14, 36, 56, 0.05)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(184, 136, 46, 0.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Pembahagi kolum dalaman
  ctx.beginPath();
  ctx.moveTo(boxX + boxW * 0.29, boxY + 14);
  ctx.lineTo(boxX + boxW * 0.29, boxY + boxH - 14);
  ctx.moveTo(boxX + boxW * 0.71, boxY + 14);
  ctx.lineTo(boxX + boxW * 0.71, boxY + boxH - 14);
  ctx.strokeStyle = 'rgba(184, 136, 46, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const col1X = boxX + boxW * 0.145;
  const col2X = boxX + boxW * 0.5;
  const col3X = boxX + boxW * 0.855;

  ctx.fillStyle = '#5b6978';
  ctx.font = '700 13px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('TEMPOH MASA TAMAT', col1X, boxY + 30);
  ctx.fillText('GRED PRESTASI', col2X, boxY + 30);
  ctx.fillText('TARIKH PENYELESAIAN', col3X, boxY + 30);

  ctx.fillStyle = '#0e2438';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(formatSeconds(record.durationSeconds || 0), col1X, boxY + 64);

  ctx.fillStyle = '#0d5c45';
  ctx.font = '700 20px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(formatCertificateGrade(record.grade), col2X, boxY + 63);

  ctx.fillStyle = '#0e2438';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillText(formatCertificateDate(record), col3X, boxY + 63);

  // 6. Mohor Digital Rasmi & Tandatangan
  const sealCx = 205;
  const sealCy = 748;
  ctx.save();
  // Lingkaran bergerigi luar mohor
  ctx.beginPath();
  const teeth = 24;
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? 40 : 35;
    const angle = (i * Math.PI) / teeth;
    const px = sealCx + Math.cos(angle) * r;
    const py = sealCy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#b8882e';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sealCx, sealCy, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#0d5c45';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f3be5a';
  ctx.stroke();

  // Tanda semak sah
  ctx.beginPath();
  ctx.moveTo(sealCx - 12, sealCy + 2);
  ctx.lineTo(sealCx - 3, sealCy + 11);
  ctx.lineTo(sealCx + 14, sealCy - 10);
  ctx.strokeStyle = '#fffdf7';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0d5c45';
  ctx.font = '700 13px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('DISAHKAN OLEH', 260, 738);
  ctx.fillText('SISTEM MAKMAL PROF. RAZAK', 260, 756);
  ctx.fillStyle = '#5b6978';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillText('KOD SIJIL: AGRO-LAB-2026', 260, 774);

  // Garis Tandatangan Kanan
  const sigCx = 945;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sigCx - 80, 736);
  ctx.quadraticCurveTo(sigCx - 58, 706, sigCx - 42, 732);
  ctx.quadraticCurveTo(sigCx - 24, 744, sigCx - 8, 718);
  ctx.quadraticCurveTo(sigCx + 10, 738, sigCx + 34, 714);
  ctx.quadraticCurveTo(sigCx + 52, 734, sigCx + 80, 722);
  ctx.strokeStyle = '#0e2438';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#0e2438';
  ctx.fillRect(sigCx - 135, 744, 270, 2);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0e2438';
  ctx.font = '700 16px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('Prof. Dr. Razak bin Ahmad', sigCx, 766);

  ctx.fillStyle = '#4a5b6c';
  ctx.font = '500 13px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('Ketua Makmal Agro', sigCx, 785);

  return canvas;
}

async function downloadVictoryCertificate(record) {
  const targetRecord = record || lastCompletedRecord;
  if (!targetRecord) return;

  const btn = dom.btnDownloadCert;
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menjana Sijil...';
  }

  try {
    const canvas = await generateCertificateCanvas(targetRecord);
    const safeName =
      String(targetRecord.nama || 'Pelajar')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Pelajar';
    const fileName = `Sijil_Escape_Makmal_Agro_${safeName}.png`;

    const triggerLinkDownload = (href, revokeAfter) => {
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (revokeAfter) {
        setTimeout(() => URL.revokeObjectURL(href), 1500);
      }
    };

    if (canvas.toBlob) {
      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            triggerLinkDownload(URL.createObjectURL(blob), true);
          } else {
            triggerLinkDownload(canvas.toDataURL('image/png'), false);
          }
          resolve();
        }, 'image/png');
      });
    } else {
      triggerLinkDownload(canvas.toDataURL('image/png'), false);
    }

    soundManager.playSuccess();
    if (btn) {
      btn.textContent = '✓ Sijil Dimuat Turun';
      setTimeout(() => {
        btn.textContent = originalText || '📜 Muat Turun Sijil (.PNG)';
        btn.disabled = false;
      }, 1800);
    }
  } catch {
    if (btn) {
      btn.textContent = originalText || '📜 Muat Turun Sijil (.PNG)';
      btn.disabled = false;
    }
  }
}

function showEndScreen(status, record) {
  lastCompletedRecord = record;
  const isVictory = status === 'BERJAYA';
  const card = dom.endScreen.querySelector('.modal-end');
  card.classList.toggle('is-victory', isVictory);

  const solvedCount =
    typeof record.puzzlesSolved === 'number' ? record.puzzlesSolved : countSolvedPuzzles();

  const avatarType = record.avatar || gameState.avatar || 'male';
  if (isVictory) {
    dom.endEmblem.textContent = '🔓';
  } else {
    dom.endEmblem.innerHTML = `<div class="end-portrait-badge" aria-hidden="true">${getPlayerPortraitSVG(avatarType, 'crying')}</div>`;
  }
  dom.endTitle.textContent = isVictory
    ? 'BERJAYA MELARIKAN DIRI — GAS BERACUN DIBATALKAN!'
    : 'MISI GAGAL — TERPERANGKAP DI MAKMAL AGRO';
  dom.endSubtitle.textContent = isVictory
    ? 'Tahniah! Semua protokol Sains Pertanian Semester 1 berjaya disahkan dan pintu utama Makmal Agro telah dibuka.'
    : 'Gas beracun telah dilepaskan dan semua pintu Makmal Agro dikunci sepenuhnya sebelum protokol eksperimen berjaya diselesaikan.';

  if (isVictory) {
    renderVictoryCertificatePreview(record);
    if (dom.victoryCertificateWrap) dom.victoryCertificateWrap.hidden = false;
    if (dom.victoryMetaStrip) {
      dom.victoryMetaStrip.textContent = `Baki Pemasa: ${formatSeconds(record.remainingSeconds)} · Kesalahan: ${record.mistakes} · Petunjuk Digunakan: ${record.hintsUsed}`;
    }
    if (dom.endStatsGrid) dom.endStatsGrid.hidden = true;
    if (dom.btnDownloadCert) dom.btnDownloadCert.hidden = false;
    if (dom.btnRetryGame) dom.btnRetryGame.hidden = true;
  } else {
    if (dom.victoryCertificateWrap) dom.victoryCertificateWrap.hidden = true;
    if (dom.endStatsGrid) dom.endStatsGrid.hidden = false;
    if (dom.btnDownloadCert) dom.btnDownloadCert.hidden = true;
    if (dom.btnRetryGame) dom.btnRetryGame.hidden = false;
  }

  dom.endStatName.textContent = record.nama;
  if (dom.endStatMatric) {
    dom.endStatMatric.textContent = record.noMatrik || '-';
  }
  dom.endStatTime.textContent = isVictory
    ? formatSeconds(record.durationSeconds)
    : `${formatSeconds(record.durationSeconds)} (Tamat)`;
  if (dom.endStatRemaining) {
    dom.endStatRemaining.textContent = formatSeconds(record.remainingSeconds);
  }
  if (dom.endStatSolved) {
    dom.endStatSolved.textContent = `${solvedCount} / 6`;
  }
  dom.endStatMistakes.textContent = String(record.mistakes);
  if (dom.endStatHints) {
    dom.endStatHints.textContent = String(record.hintsUsed);
  }
  if (dom.endStatStatus) {
    dom.endStatStatus.textContent = isVictory ? 'BERJAYA' : 'GAGAL';
  }
  dom.endStatGrade.textContent = record.grade;

  dom.endScreen.hidden = false;
}

// ============================================================================
// 8. NAVIGASI 5 BILIK, LUKISAN SVG & HOTSPOT INTERAKTIF
// ============================================================================

function getAccessibleRooms() {
  return ROOMS.filter((room) => !room.requiresSecretUnlock || gameState.secretRoomUnlocked);
}

function getRoomById(viewId) {
  return ROOMS.find((r) => r.id === viewId) || ROOMS[0];
}

function navigateToRoom(viewId, silent = false) {
  const targetRoom = getRoomById(viewId);
  if (targetRoom.requiresSecretUnlock && !gameState.secretRoomUnlocked) {
    showDialogue(
      gameState.playerName,
      'Bilik Rahsia Makmal Agro masih terkunci. Aku perlu buka laluan itu dahulu.',
      'warning'
    );
    return;
  }

  gameState.currentView = targetRoom.id;
  if (!silent) playSFX('click');

  const accessible = getAccessibleRooms();
  const roomIndex = accessible.findIndex((r) => r.id === targetRoom.id);

  dom.hudRoomCode.textContent = `${targetRoom.code} / ${accessible.length}`;
  dom.hudRoomName.textContent = targetRoom.name;

  // Peralihan halus kanvas bilik
  dom.roomSceneContainer.classList.add('is-fading');
  setTimeout(() => {
    dom.roomSceneContainer.innerHTML = renderRoomSVG(targetRoom.id);
    bindRoomHotspots();
    dom.roomSceneContainer.classList.remove('is-fading');
  }, 110);

  renderRoomCompass(accessible, roomIndex);
  showDialogue(gameState.playerName, targetRoom.enterThought, 'normal');
}

function cycleRoom(direction) {
  const accessible = getAccessibleRooms();
  const currentIdx = accessible.findIndex((r) => r.id === gameState.currentView);
  const nextIdx = (currentIdx + direction + accessible.length) % accessible.length;
  navigateToRoom(accessible[nextIdx].id);
}

function renderRoomCompass(accessible) {
  dom.roomCompass.innerHTML = accessible
    .map((room, idx) => {
      const activeCls = room.id === gameState.currentView ? 'active' : '';
      const secretCls = room.id === 'view5' ? 'secret-room' : '';
      const label = room.id === 'view5' ? 'B5 🔒' : `B${idx + 1}`;
      return `<button type="button" class="compass-btn ${activeCls} ${secretCls}" data-room="${room.id}" title="${room.name}">${label}</button>`;
    })
    .join('');

  dom.roomCompass.querySelectorAll('.compass-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigateToRoom(btn.dataset.room));
  });
}

function unlockSecretRoom() {
  if (gameState.secretRoomUnlocked) return;
  gameState.secretRoomUnlocked = true;
  const accessible = getAccessibleRooms();
  renderRoomCompass(accessible);
  dom.hudRoomCode.textContent = `${getRoomById(gameState.currentView).code} / ${accessible.length}`;
}

function refreshCurrentRoomScene() {
  dom.roomSceneContainer.innerHTML = renderRoomSVG(gameState.currentView);
  bindRoomHotspots();
}

function renderRoomSVG(viewId) {
  switch (viewId) {
    case 'view1': {
      const doorOpen = gameState.puzzles.controlPanel;
      const fuseOpened = gameState.flags.fusePanelOpened;
      const fusePowered = gameState.flags.mainFuseInstalled;

      return `
        <svg viewBox="0 0 1120 630" class="room-svg" aria-label="Bilik 1: Pintu Keluar dan Panel Kawalan">
          <defs>
            <linearGradient id="v1Wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#13242d"/>
              <stop offset="100%" stop-color="#091217"/>
            </linearGradient>
            <radialGradient id="v1AlarmLamp" cx="535" cy="60" r="240" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="${doorOpen ? '#10b981' : '#ef4444'}" stop-opacity="0.38"/>
              <stop offset="60%" stop-color="#2a7f8e" stop-opacity="0.12"/>
              <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="v1DeskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#263e4a"/>
              <stop offset="100%" stop-color="#14232b"/>
            </linearGradient>
          </defs>
          <rect width="1120" height="630" fill="url(#v1Wall)"/>
          <rect width="1120" height="630" fill="url(#v1AlarmLamp)"/>

          <!-- Paip Makmal & Jalur Dinding -->
          <rect x="0" y="34" width="1120" height="14" fill="#182d37" stroke="#040709" stroke-width="3"/>
          <line x1="0" y1="365" x2="1120" y2="365" stroke="#081014" stroke-width="3"/>

          <!-- Lantai Makmal -->
          <polygon points="0,490 1120,490 1120,630 0,630" fill="#0d181e" stroke="#040709" stroke-width="4"/>
          <line x1="180" y1="490" x2="90" y2="630" stroke="#05080a" stroke-width="2.5"/>
          <line x1="420" y1="490" x2="395" y2="630" stroke="#05080a" stroke-width="2.5"/>
          <line x1="670" y1="490" x2="700" y2="630" stroke="#05080a" stroke-width="2.5"/>
          <line x1="920" y1="490" x2="1010" y2="630" stroke="#05080a" stroke-width="2.5"/>

          <!-- Hotspot 1: Pintu Utama Keluli dengan Kunci Magnetik -->
          <g class="hotspot" data-hotspot="v1_exit_door" tabindex="0" role="button" aria-label="Periksa Pintu Utama Keluli">
            <rect class="hotspot-outline" x="380" y="92" width="310" height="398" rx="4" fill="#1b303a" stroke="#040709" stroke-width="5"/>
            <rect x="404" y="114" width="262" height="376" fill="${doorOpen ? '#0e2d29' : '#111f26'}" stroke="#040709" stroke-width="3.5"/>
            <line x1="535" y1="114" x2="535" y2="490" stroke="#040709" stroke-width="5"/>
            <rect x="428" y="148" width="84" height="102" rx="4" fill="#09151a" stroke="#040709" stroke-width="3"/>
            <rect x="558" y="148" width="84" height="102" rx="4" fill="#09151a" stroke="#040709" stroke-width="3"/>
            <line x1="428" y1="199" x2="512" y2="199" stroke="#1d3540" stroke-width="2"/>
            <line x1="470" y1="148" x2="470" y2="250" stroke="#1d3540" stroke-width="2"/>
            <line x1="558" y1="199" x2="642" y2="199" stroke="#1d3540" stroke-width="2"/>
            <line x1="600" y1="148" x2="600" y2="250" stroke="#1d3540" stroke-width="2"/>
            <rect x="485" y="102" width="100" height="22" rx="3" fill="#324650" stroke="#040709" stroke-width="3"/>
            <circle cx="502" cy="113" r="4" fill="${doorOpen ? '#4ade80' : '#ef4444'}"/>
            <circle cx="568" cy="113" r="4" fill="${doorOpen ? '#4ade80' : '#ef4444'}"/>
            <rect x="372" y="280" width="326" height="40" rx="4" fill="#324650" stroke="#040709" stroke-width="4"/>
            <rect x="488" y="270" width="94" height="60" rx="6" fill="#21313a" stroke="#040709" stroke-width="4"/>
            <circle cx="535" cy="300" r="12" fill="${doorOpen ? '#10b981' : '#dc3545'}" stroke="#040709" stroke-width="3"/>
            <rect x="472" y="42" width="126" height="36" rx="4" fill="${doorOpen ? '#0f5132' : '#7f1d1d'}" stroke="#040709" stroke-width="3.5"/>
            <text x="535" y="65" text-anchor="middle" fill="${doorOpen ? '#6ee7b7' : '#fecaca'}" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">${doorOpen ? 'TERBUKA' : 'TERKUNCI'}</text>
            <g class="hotspot-hint-tag">
              <rect x="442" y="218" width="186" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="535" y="237" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Pintu Keluar Magnetik</text>
            </g>
          </g>

          <!-- Hotspot 2: Peti Fius Voltan Tinggi & Pengawal EC (3 Keadaan Visual) -->
          <g class="hotspot" data-hotspot="v1_fuse_box" tabindex="0" role="button" aria-label="Periksa Kotak Fius dan Pengawal EC">
            <rect class="hotspot-outline" x="128" y="138" width="168" height="205" rx="6" fill="#223742" stroke="#040709" stroke-width="4.5"/>
            ${
              !fuseOpened
                ? `
              <rect x="142" y="152" width="140" height="177" rx="3" fill="#182932" stroke="#040709" stroke-width="3"/>
              <!-- 4 Skru Keselamatan Penutup Fius -->
              <circle cx="152" cy="162" r="4.5" fill="#9bb3bd" stroke="#040709" stroke-width="1.8"/>
              <circle cx="272" cy="162" r="4.5" fill="#9bb3bd" stroke="#040709" stroke-width="1.8"/>
              <circle cx="152" cy="319" r="4.5" fill="#9bb3bd" stroke="#040709" stroke-width="1.8"/>
              <circle cx="272" cy="319" r="4.5" fill="#9bb3bd" stroke="#040709" stroke-width="1.8"/>
              <polygon points="212,175 244,230 180,230" fill="#d99b38" stroke="#040709" stroke-width="3"/>
              <path d="M214 190 L205 210 L214 210 L208 224 L222 204 L213 204 Z" fill="#05080a"/>
              <rect x="256" y="226" width="18" height="38" rx="3" fill="#3a525e" stroke="#040709" stroke-width="2.5"/>
              <text x="212" y="266" text-anchor="middle" fill="#9bb3bd" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">KOTAK FIUS</text>
              <text x="212" y="286" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="11">SKRU KETAT</text>
            `
                : `
              <!-- Bahagian Dalam Kotak Fius Terbuka -->
              <rect x="142" y="152" width="140" height="177" rx="3" fill="#0b151a" stroke="#040709" stroke-width="3"/>
              <!-- Pendawaian Dalaman -->
              <path d="M168 156 L168 202 M256 156 L256 202" stroke="#d98238" stroke-width="4" stroke-linecap="round"/>
              <path d="M168 242 L168 265 M256 242 L256 265" stroke="#2ea877" stroke-width="3.5" stroke-linecap="round"/>
              <!-- Soket Fius 30A -->
              <rect x="162" y="196" width="100" height="44" rx="4" fill="#182a33" stroke="#040709" stroke-width="2.5"/>
              ${
                fusePowered
                  ? `
                <rect x="174" y="205" width="76" height="26" rx="4" fill="#2ea877" stroke="#040709" stroke-width="2.5"/>
                <rect x="174" y="205" width="16" height="26" rx="2" fill="#e2e8f0" stroke="#040709" stroke-width="2"/>
                <rect x="234" y="205" width="16" height="26" rx="2" fill="#e2e8f0" stroke="#040709" stroke-width="2"/>
                <text x="212" y="222" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">30A ON</text>
                <!-- Skrin Pengawal EC Aktif -->
                <rect x="154" y="264" width="116" height="52" rx="4" fill="#0f2c27" stroke="#6ee7b7" stroke-width="2"/>
                <text x="212" y="284" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">PENGAWAL EC</text>
                <text x="212" y="304" text-anchor="middle" fill="#fef08a" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">${doorOpen ? '1.8 mS/cm OK' : `${Number(gameState.flags.ecValue || 0.5).toFixed(1)} mS/cm`}</text>
              `
                  : `
                <rect x="178" y="208" width="68" height="20" rx="3" fill="#060c0f" stroke="#ff7b89" stroke-width="1.8" stroke-dasharray="4 3"/>
                <text x="212" y="222" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700">TIADA FIUS</text>
                <rect x="154" y="264" width="116" height="52" rx="4" fill="#131f25" stroke="#040709" stroke-width="2"/>
                <text x="212" y="288" text-anchor="middle" fill="#708995" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">EC: TIADA KUASA</text>
                <text x="212" y="304" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="9.5">PASANG FIUS 30A</text>
              `
              }
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="122" y="100" width="180" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="212" y="119" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">
                ${!fuseOpened ? 'Kotak Fius Tertutup' : fusePowered ? 'Pengawal EC Digital' : 'Soket Fius Kosong'}
              </text>
            </g>
          </g>

          <!-- Meja Sisi Kiri (Menempatkan Kunci Tembaga Kecil & Fail) -->
          <g>
            <rect x="52" y="392" width="286" height="24" rx="3" fill="url(#v1DeskGrad)" stroke="#040709" stroke-width="4"/>
            <rect x="74" y="416" width="24" height="106" fill="#13222a" stroke="#040709" stroke-width="3.5"/>
            <rect x="292" y="416" width="24" height="106" fill="#13222a" stroke="#040709" stroke-width="3.5"/>
            <rect x="108" y="416" width="174" height="58" fill="#182b34" stroke="#040709" stroke-width="3"/>
            <rect x="84" y="366" width="88" height="26" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="3"/>
            <rect x="110" y="358" width="36" height="10" rx="2" fill="#3a525e" stroke="#040709" stroke-width="2.5"/>
            <path d="M196 346 L216 346 L226 392 L186 392 Z" fill="#2a7f8e" fill-opacity="0.65" stroke="#040709" stroke-width="3"/>
          </g>

          <!-- Hotspot 3: Kunci Tembaga Kecil Berkilau di Bucu Meja Sisi -->
          ${
            gameState.flags.pickedCopperKey
              ? ''
              : `
          <g class="hotspot" data-hotspot="v1_copper_key" tabindex="0" role="button" aria-label="Ambil Kunci Tembaga Kecil di bucu meja">
            <circle cx="294" cy="382" r="24" fill="#f2b749" fill-opacity="0.2"/>
            <g class="hotspot-outline" stroke="#040709" stroke-width="2.8" transform="translate(274, 368) rotate(-14 20 14)">
              <circle cx="10" cy="14" r="8" fill="#d98238"/>
              <circle cx="10" cy="14" r="3" fill="#0d181e"/>
              <rect x="17" y="11" width="22" height="5.5" rx="2" fill="#d98238"/>
              <rect x="30" y="16" width="4" height="6" fill="#d98238"/>
              <rect x="36" y="16" width="4" height="8" fill="#d98238"/>
            </g>
            <path d="M312 362 L314 368 L320 370 L314 372 L312 378 L310 372 L304 370 L310 368 Z" fill="#fef08a"/>
            <g class="hotspot-hint-tag">
              <rect x="206" y="324" width="176" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="294" y="343" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Kunci Tembaga Kecil</text>
            </g>
          </g>
          `
          }

          <!-- Hotspot 4: Panel Kawalan Makmal Agro (Kanan Pintu) -->
          <g class="hotspot" data-hotspot="v1_control_panel" tabindex="0" role="button" aria-label="Periksa Panel Kawalan Makmal Agro">
            <rect class="hotspot-outline" x="728" y="210" width="124" height="170" rx="8" fill="#1d3540" stroke="#040709" stroke-width="4.5"/>
            <rect x="744" y="228" width="92" height="58" rx="3" fill="#0a161b" stroke="#040709" stroke-width="2.5"/>
            <text x="790" y="253" text-anchor="middle" fill="#7ee0eb" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">EC PINTU</text>
            <text x="790" y="272" text-anchor="middle" fill="${doorOpen ? '#4ade80' : fusePowered ? '#f2b749' : '#ff7b89'}" font-family="JetBrains Mono, monospace" font-size="11">${doorOpen ? 'NYAHAKTIF' : fusePowered ? 'SEDIA EC' : 'SEKAT'}</text>
            <g fill="#2b4854" stroke="#040709" stroke-width="2">
              <rect x="748" y="300" width="24" height="16" rx="2"/><rect x="778" y="300" width="24" height="16" rx="2"/><rect x="808" y="300" width="24" height="16" rx="2"/>
              <rect x="748" y="322" width="24" height="16" rx="2"/><rect x="778" y="322" width="24" height="16" rx="2"/><rect x="808" y="322" width="24" height="16" rx="2"/>
              <rect x="748" y="344" width="84" height="18" rx="2" fill="${doorOpen ? '#2ea877' : '#d99b38'}"/>
            </g>
            <g class="hotspot-hint-tag">
              <rect x="715" y="172" width="150" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="790" y="191" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Panel Kawalan EC</text>
            </g>
          </g>

          <!-- Pintu Sisi Terlindung (Bilik Rahsia view5) -->
          <g class="hotspot" data-hotspot="v1_secret_hatch" tabindex="0" role="button" aria-label="${gameState.secretRoomUnlocked ? 'Masuk ke Bilik 5 Bio-Vault' : 'Periksa Pintu Bio-Vault'}">
            <rect class="hotspot-outline" x="905" y="170" width="135" height="320" rx="4" fill="${gameState.secretRoomUnlocked ? '#132d28' : '#101d24'}" stroke="#040709" stroke-width="4"/>
            <line x1="920" y1="210" x2="1025" y2="210" stroke="#060b0e" stroke-width="3"/>
            <line x1="920" y1="440" x2="1025" y2="440" stroke="#060b0e" stroke-width="3"/>
            <circle cx="928" cy="330" r="8" fill="${gameState.secretRoomUnlocked ? '#2ea877' : '#2b4552'}" stroke="#040709" stroke-width="2.5"/>
            <g class="hotspot-hint-tag">
              <rect x="890" y="132" width="165" height="28" rx="4" fill="#05080a" stroke="${gameState.secretRoomUnlocked ? '#4ade80' : '#f2b749'}" stroke-width="1.5"/>
              <text x="972" y="151" text-anchor="middle" fill="${gameState.secretRoomUnlocked ? '#6ee7b7' : '#f2b749'}" font-size="13" font-weight="700">${gameState.secretRoomUnlocked ? 'Pintu Bio-Vault ▸' : 'Pintu Bio-Vault (?)'}</text>
            </g>
          </g>
        </svg>
      `;
    }

    case 'view2': {
      const phSample = gameState.flags.activePhSample;
      const treated = gameState.flags.treatedSoilSamples || {};
      let lcdText = '--.-';
      let lcdColor = '#6ee7b7';
      if (phSample === 's1') {
        lcdText = treated.s1 || gameState.puzzles.soilCabinet ? '6.2' : '4.2';
        lcdColor = treated.s1 || gameState.puzzles.soilCabinet ? '#4ade80' : '#ff7b89';
      } else if (phSample === 's2') {
        lcdText = treated.s2 || gameState.puzzles.soilCabinet ? '6.2' : '6.0';
        lcdColor = treated.s2 || gameState.puzzles.soilCabinet ? '#4ade80' : '#6ee7b7';
      } else if (phSample === 's3') {
        lcdText = treated.s3 || gameState.puzzles.soilCabinet ? '6.2' : '7.9';
        lcdColor = treated.s3 || gameState.puzzles.soilCabinet ? '#4ade80' : '#f2b749';
      }
      const secretOpen = gameState.secretRoomUnlocked;

      return `
        <svg viewBox="0 0 1120 630" class="room-svg" aria-label="Bilik 2: Meja Kerja dan Dinding Carta Tanah">
          <defs>
            <radialGradient id="v2BenchLight" cx="420" cy="340" r="460" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#2a7f8e" stop-opacity="0.26"/>
              <stop offset="100%" stop-color="#070c0f" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="v2SecretGlow" cx="890" cy="310" r="220" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#2ea877" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#070c0f" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="1120" height="630" fill="#101e26"/>
          <rect width="1120" height="630" fill="url(#v2BenchLight)"/>
          ${secretOpen ? '<rect width="1120" height="630" fill="url(#v2SecretGlow)"/>' : ''}

          <!-- Lantai & Garis Dinding Kanan -->
          <polygon points="0,515 1120,515 1120,630 0,630" fill="#0a1318" stroke="#040709" stroke-width="4"/>

          <!-- Meja Kerja Makmal (Kiri hingga Tengah-Kanan) -->
          <rect x="18" y="405" width="690" height="225" fill="#172a34" stroke="#040709" stroke-width="5"/>
          <line x1="18" y1="422" x2="708" y2="422" stroke="#0c171d" stroke-width="3"/>

          <!-- Hotspot 1: Carta Segitiga Tekstur Tanah USDA (Dinding Kiri) -->
          <g class="hotspot" data-hotspot="v2_soil_chart" tabindex="0" role="button" aria-label="Periksa Carta Segitiga Tekstur Tanah USDA">
            <rect class="hotspot-outline" x="48" y="54" width="286" height="240" rx="6" fill="#e7dcc3" stroke="#040709" stroke-width="5"/>
            <text x="191" y="82" text-anchor="middle" fill="#10252d" font-family="Fraunces, serif" font-size="14" font-weight="700">SEGITIGA TEKSTUR TANAH USDA</text>
            <polygon points="191,104 100,254 282,254" fill="#d4c39e" stroke="#040709" stroke-width="3"/>
            <line x1="145" y1="179" x2="237" y2="179" stroke="#1b4652" stroke-width="2"/>
            <line x1="130" y1="205" x2="252" y2="205" stroke="#1b4652" stroke-width="1.5"/>
            <line x1="168" y1="142" x2="218" y2="254" stroke="#1b4652" stroke-width="1.5" stroke-dasharray="4 3"/>
            <line x1="214" y1="142" x2="164" y2="254" stroke="#92400e" stroke-width="1.5" stroke-dasharray="4 3"/>
            <circle cx="191" cy="222" r="5" fill="${gameState.puzzles.soilTriangle ? '#2ea877' : '#dc3545'}" stroke="#040709" stroke-width="1.5"/>
            <text x="191" y="99" text-anchor="middle" fill="#0e323e" font-size="10.5" font-weight="700">LIAT</text>
            <text x="90" y="271" text-anchor="middle" fill="#0e323e" font-size="10.5" font-weight="700">PASIR</text>
            <text x="292" y="271" text-anchor="middle" fill="#0e323e" font-size="10.5" font-weight="700">KELODAK</text>
            <g class="hotspot-hint-tag">
              <rect x="96" y="20" width="190" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="191" y="39" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Carta Tanah USDA</text>
            </g>
          </g>

          <!-- Hotspot 2: Kabinet Sampel Tanah & Pengapuran (Dinding Tengah) -->
          <g class="hotspot" data-hotspot="v2_soil_cabinet" tabindex="0" role="button" aria-label="Periksa Kabinet Sampel Tanah dan Pengapuran">
            <rect class="hotspot-outline" x="364" y="60" width="292" height="292" rx="6" fill="#1b323d" stroke="#040709" stroke-width="5"/>
            <rect x="382" y="80" width="256" height="114" fill="#0c181e" stroke="#040709" stroke-width="3"/>
            <!-- Beg Kapur Pertanian GML & Bahan Kimia di Rak -->
            <rect x="398" y="106" width="60" height="78" rx="4" fill="#e7dcc3" stroke="#040709" stroke-width="3"/>
            <text x="428" y="142" text-anchor="middle" fill="#10252d" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">GML</text>
            <text x="428" y="159" text-anchor="middle" fill="#1b4652" font-size="9" font-weight="700">KAPUR</text>
            <rect x="476" y="114" width="48" height="70" rx="4" fill="#d99b38" stroke="#040709" stroke-width="3"/>
            <text x="500" y="154" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">S</text>
            <rect x="542" y="110" width="52" height="74" rx="4" fill="#2a7f8e" stroke="#040709" stroke-width="3"/>
            <text x="568" y="152" text-anchor="middle" fill="#e6eff2" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">UREA</text>
            <!-- Laci Kabinet Berkunci Digital pH -->
            <rect x="382" y="210" width="256" height="124" rx="4" fill="#23404e" stroke="#040709" stroke-width="3.5"/>
            <rect x="442" y="232" width="136" height="44" rx="4" fill="#091318" stroke="#040709" stroke-width="2.5"/>
            <text x="510" y="259" text-anchor="middle" fill="${gameState.puzzles.soilCabinet ? '#4ade80' : '#ff7b89'}" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">
              ${gameState.puzzles.soilCabinet ? 'pH ~6.2 · SAH' : 'KUNCI pH 5.5–6.5'}
            </text>
            <rect x="480" y="294" width="60" height="16" rx="3" fill="${gameState.puzzles.soilCabinet ? '#4ade80' : '#d99b38'}" stroke="#040709" stroke-width="2.5"/>
            <g class="hotspot-hint-tag">
              <rect x="405" y="24" width="210" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="510" y="43" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Kabinet &amp; Bekalan Kapur</text>
            </g>
          </g>

          <!-- Hotspot 9 / 10: Laluan Bilik Rahsia & Rak Buku Keluli Berat (Dinding Kanan) -->
          ${
            secretOpen
              ? `
          <g class="hotspot" data-hotspot="v2_secret_doorway" tabindex="0" role="button" aria-label="Masuk ke Bilik Rahsia Makmal Agro (Bilik 5)">
            <!-- Pintu Laluan Rahsia Bercahaya Zamrud/Teal -->
            <rect class="hotspot-outline" x="772" y="92" width="218" height="423" rx="4" fill="#082420" stroke="#2ea877" stroke-width="4.5"/>
            <rect x="790" y="110" width="182" height="405" fill="#061918" stroke="#040709" stroke-width="3"/>
            <polygon points="815,515 948,515 922,360 842,360" fill="#134e44" opacity="0.72"/>
            <rect x="814" y="140" width="134" height="36" rx="4" fill="#091d1a" stroke="#2ea877" stroke-width="2"/>
            <text x="881" y="163" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">BILIK 5 · TERBUKA</text>
            <circle cx="881" cy="272" r="32" fill="#2ea877" fill-opacity="0.22" stroke="#6ee7b7" stroke-width="2"/>
            <path d="M873 258 L893 272 L873 286 Z" fill="#6ee7b7"/>
            <g class="hotspot-hint-tag">
              <rect x="776" y="54" width="210" height="28" rx="4" fill="#05080a" stroke="#4ade80" stroke-width="1.5"/>
              <text x="881" y="73" text-anchor="middle" fill="#4ade80" font-size="13" font-weight="700">Masuk Bilik Rahsia ▸</text>
            </g>
          </g>
          <!-- Rak Buku yang telah bergeser ke tepi kanan -->
          <g transform="translate(216, 0)" opacity="0.95">
            <rect x="776" y="88" width="220" height="427" rx="4" fill="#1d323c" stroke="#040709" stroke-width="5"/>
            <rect x="792" y="112" width="188" height="104" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="792" y="232" width="188" height="104" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="792" y="352" width="188" height="126" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="808" y="138" width="24" height="68" fill="#8b4d2b" stroke="#040709" stroke-width="2"/>
            <rect x="836" y="128" width="26" height="78" fill="#2a7f8e" stroke="#040709" stroke-width="2"/>
          </g>
          `
              : `
          <g class="hotspot" data-hotspot="v2_secret_bookshelf" tabindex="0" role="button" aria-label="Periksa Rak Buku Rahsia dan Panel Kod Tanah">
            <!-- Panel Kunci Biometrik / Kod Tekstur Tanah di Kiri Rak -->
            <rect x="716" y="220" width="52" height="110" rx="5" fill="#1a2c35" stroke="#040709" stroke-width="3.5"/>
            <rect x="724" y="234" width="36" height="26" rx="2" fill="#081014" stroke="#040709" stroke-width="2"/>
            <circle cx="742" cy="247" r="5" fill="#dc3545"/>
            <rect x="726" y="272" width="32" height="42" rx="2" fill="#294452" stroke="#040709" stroke-width="2"/>
            <polygon points="742,280 753,304 731,304" fill="#d99b38" stroke="#040709" stroke-width="1.8"/>

            <!-- Rak Buku Keluli Berat Tertutup -->
            <rect class="hotspot-outline" x="776" y="88" width="270" height="427" rx="4" fill="#1d323c" stroke="#040709" stroke-width="5"/>
            <rect x="794" y="112" width="234" height="104" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="794" y="232" width="234" height="104" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <rect x="794" y="352" width="234" height="126" fill="#0e1b22" stroke="#040709" stroke-width="3"/>
            <!-- Buku & Bekas Spesimen di Rak -->
            <rect x="810" y="138" width="24" height="68" fill="#8b4d2b" stroke="#040709" stroke-width="2"/>
            <rect x="838" y="128" width="26" height="78" fill="#2a7f8e" stroke="#040709" stroke-width="2"/>
            <rect x="868" y="142" width="22" height="64" fill="#d99b38" stroke="#040709" stroke-width="2"/>
            <rect x="920" y="134" width="30" height="72" fill="#234f5e" stroke="#040709" stroke-width="2"/>
            <rect x="814" y="256" width="34" height="70" fill="#7f1d1d" stroke="#040709" stroke-width="2"/>
            <rect x="854" y="264" width="24" height="62" fill="#1e544a" stroke="#040709" stroke-width="2"/>
            <rect x="935" y="276" width="66" height="50" rx="4" fill="#2b4552" stroke="#040709" stroke-width="2.5"/>
            <rect x="816" y="392" width="70" height="76" rx="4" fill="#1b3945" stroke="#040709" stroke-width="2.5"/>
            <rect x="904" y="402" width="96" height="66" rx="4" fill="#142b34" stroke="#040709" stroke-width="2.5"/>
            <g class="hotspot-hint-tag">
              <rect x="782" y="50" width="258" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="911" y="69" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Rak Buku Rahsia (Kunci Tanah)</text>
            </g>
          </g>
          `
          }

          <!-- Hotspot 3, 4, 5: 3 Bikar Kaca Sampel Tanah atas Meja Kerja -->
          <!-- Bikar 1: Tanah Gambut -->
          <g class="hotspot" data-hotspot="v2_beaker_1" tabindex="0" role="button" aria-label="Periksa Sampel 1: Tanah Gambut">
            <rect class="hotspot-outline" x="58" y="348" width="76" height="106" rx="6" fill="rgba(126,224,235,0.16)" stroke="#040709" stroke-width="3.5"/>
            <path d="M62 404 Q96 396 130 404 L130 450 L62 450 Z" fill="#2c1d16" stroke="#040709" stroke-width="2"/>
            <circle cx="82" cy="428" r="4" fill="#180f0b"/><circle cx="110" cy="420" r="5" fill="#3f2b21"/>
            <rect x="52" y="460" width="88" height="30" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2.5"/>
            <text x="96" y="474" text-anchor="middle" fill="#10252d" font-size="9.5" font-weight="700">SAMPEL 1</text>
            <text x="96" y="485" text-anchor="middle" fill="#1b4652" font-size="9" font-weight="700">Tanah Gambut</text>
            <g class="hotspot-hint-tag">
              <rect x="24" y="312" width="144" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="96" y="330" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">Uji Tanah Gambut</text>
            </g>
          </g>

          <!-- Bikar 2: Tanah Aluvium -->
          <g class="hotspot" data-hotspot="v2_beaker_2" tabindex="0" role="button" aria-label="Periksa Sampel 2: Tanah Aluvium">
            <rect class="hotspot-outline" x="166" y="348" width="76" height="106" rx="6" fill="rgba(126,224,235,0.16)" stroke="#040709" stroke-width="3.5"/>
            <path d="M170 402 Q204 395 238 402 L238 450 L170 450 Z" fill="#6d4c34" stroke="#040709" stroke-width="2"/>
            <circle cx="188" cy="424" r="4" fill="#543825"/><circle cx="218" cy="432" r="4" fill="#825d42"/>
            <rect x="160" y="460" width="88" height="30" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2.5"/>
            <text x="204" y="474" text-anchor="middle" fill="#10252d" font-size="9.5" font-weight="700">SAMPEL 2</text>
            <text x="204" y="485" text-anchor="middle" fill="#1b4652" font-size="9" font-weight="700">Tanah Aluvium</text>
            <g class="hotspot-hint-tag">
              <rect x="132" y="312" width="144" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="204" y="330" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">Uji Tanah Aluvium</text>
            </g>
          </g>

          <!-- Bikar 3: Tanah Berkapur -->
          <g class="hotspot" data-hotspot="v2_beaker_3" tabindex="0" role="button" aria-label="Periksa Sampel 3: Tanah Berkapur">
            <rect class="hotspot-outline" x="274" y="348" width="76" height="106" rx="6" fill="rgba(126,224,235,0.16)" stroke="#040709" stroke-width="3.5"/>
            <path d="M278 404 Q312 397 346 404 L346 450 L278 450 Z" fill="#cec5ae" stroke="#040709" stroke-width="2"/>
            <circle cx="296" cy="426" r="4" fill="#b3a88e"/><circle cx="326" cy="420" r="5" fill="#e2dac6"/>
            <rect x="268" y="460" width="88" height="30" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2.5"/>
            <text x="312" y="474" text-anchor="middle" fill="#10252d" font-size="9.5" font-weight="700">SAMPEL 3</text>
            <text x="312" y="485" text-anchor="middle" fill="#1b4652" font-size="9" font-weight="700">Tanah Berkapur</text>
            <g class="hotspot-hint-tag">
              <rect x="240" y="312" width="144" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="312" y="330" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">Uji Tanah Berkapur</text>
            </g>
          </g>

          <!-- Hotspot 6: Meter pH Digital dengan Skrin LCD -->
          <g class="hotspot" data-hotspot="v2_ph_meter" tabindex="0" role="button" aria-label="Gunakan Meter pH Digital">
            <rect class="hotspot-outline" x="384" y="342" width="114" height="136" rx="8" fill="#223b47" stroke="#040709" stroke-width="4.5"/>
            <rect x="398" y="356" width="86" height="50" rx="4" fill="#122723" stroke="#040709" stroke-width="2.5"/>
            <text x="441" y="373" text-anchor="middle" fill="#9bb3bd" font-family="JetBrains Mono, monospace" font-size="9.5">METER pH</text>
            <text x="441" y="396" text-anchor="middle" fill="${lcdColor}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">${lcdText}</text>
            <circle cx="418" cy="430" r="9" fill="#d99b38" stroke="#040709" stroke-width="2.5"/>
            <circle cx="464" cy="430" r="9" fill="#2a7f8e" stroke="#040709" stroke-width="2.5"/>
            <path d="M384 446 Q362 458 354 428" fill="none" stroke="#040709" stroke-width="3.5" stroke-linecap="round"/>
            <g class="hotspot-hint-tag">
              <rect x="356" y="306" width="170" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="441" y="325" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Meja Meter pH Digital</text>
            </g>
          </g>

          <!-- Hotspot 7: Peti Alat Mikroskop atas Meja (Terbuka selepas selesai pH S1, S2 & S3) -->
          ${(() => {
            const caseOpen = Boolean(gameState.puzzles.phSolved || gameState.puzzles.soilCabinet);
            const hasMagnifier = Boolean(gameState.flags.pickedMagnifier);
            const hasSlide = Boolean(gameState.flags.pickedGlassSlide);
            return `
          <g class="hotspot" data-hotspot="v2_tool_case" tabindex="0" role="button" aria-label="Periksa Peti Alat Mikroskop">
            <rect class="hotspot-outline" x="518" y="484" width="174" height="96" rx="6" fill="${caseOpen ? '#172b35' : '#243a45'}" stroke="#040709" stroke-width="4.5"/>
            ${
              caseOpen
                ? `
              <rect x="528" y="492" width="154" height="80" rx="4" fill="#0b151b" stroke="#040709" stroke-width="3"/>
              <rect x="536" y="498" width="66" height="68" rx="4" fill="#122128" stroke="#040709" stroke-width="1.8"/>
              <rect x="608" y="498" width="66" height="68" rx="4" fill="#122128" stroke="#040709" stroke-width="1.8"/>
              ${
                hasMagnifier && hasSlide
                  ? `<text x="605" y="537" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">SEMUA ALAT DIKUTIP</text>`
                  : ''
              }
            `
                : `
              <rect x="528" y="494" width="154" height="76" rx="4" fill="#1b303a" stroke="#040709" stroke-width="3"/>
              <line x1="528" y1="524" x2="682" y2="524" stroke="#040709" stroke-width="3.5"/>
              <rect x="556" y="514" width="22" height="16" rx="2" fill="#d99b38" stroke="#040709" stroke-width="2"/>
              <rect x="632" y="514" width="22" height="16" rx="2" fill="#d99b38" stroke="#040709" stroke-width="2"/>
              <rect x="555" y="538" width="100" height="22" rx="3" fill="#0a1318" stroke="#040709" stroke-width="2"/>
              <text x="605" y="553" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700">KUNCI pH 5.5–6.5</text>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="506" y="452" width="198" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="605" y="470" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">${caseOpen ? 'Peti Alat Mikroskop (Terbuka)' : 'Peti Alat Mikroskop (Terkunci)'}</text>
            </g>
          </g>
          ${
            caseOpen && !hasMagnifier
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v2_item_magnifier" tabindex="0" role="button" aria-label="Ambil Kanta Pembesar daripada Peti Alat Mikroskop">
            <rect x="538" y="500" width="62" height="64" rx="4" fill="transparent"/>
            <circle class="hotspot-outline" cx="566" cy="524" r="17" fill="#7ee0eb" fill-opacity="0.4" stroke="#f2b749" stroke-width="3"/>
            <line x1="578" y1="536" x2="594" y2="554" stroke="#d99b38" stroke-width="6.5" stroke-linecap="round"/>
            <line x1="578" y1="536" x2="594" y2="554" stroke="#040709" stroke-width="2" stroke-linecap="round"/>
            <g class="hotspot-hint-tag">
              <rect x="488" y="466" width="160" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="568" y="484" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Kanta Pembesar</text>
            </g>
          </g>
          `
              : ''
          }
          ${
            caseOpen && !hasSlide
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v2_item_slides" tabindex="0" role="button" aria-label="Ambil Slaid Kaca Spesimen daripada Peti Alat Mikroskop">
            <rect x="610" y="500" width="62" height="64" rx="4" fill="transparent"/>
            <rect class="hotspot-outline" x="616" y="518" width="50" height="24" rx="3" fill="#a5f3fc" fill-opacity="0.82" stroke="#f2b749" stroke-width="3"/>
            <rect x="633" y="522" width="18" height="16" rx="1.5" fill="#ecfdf5" stroke="#0d5c45" stroke-width="1.5"/>
            <circle cx="642" cy="530" r="4" fill="#2ea877" stroke="#040709" stroke-width="1.4"/>
            <rect x="619" y="521" width="8" height="18" rx="1" fill="#e7dcc3" stroke="#040709" stroke-width="1.2"/>
            <g class="hotspot-hint-tag">
              <rect x="562" y="466" width="160" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="642" y="484" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Slaid Kaca</text>
            </g>
          </g>
          `
              : ''
          }
          `;
          })()}

          <!-- Hotspot 8: Buku Log Prof. Razak atas Meja -->
          <g class="hotspot" data-hotspot="v2_prof_log" tabindex="0" role="button" aria-label="Periksa Buku Log Makmal Profesor Razak">
            <rect class="hotspot-outline" x="536" y="388" width="142" height="72" rx="4" fill="#2b4c59" stroke="#040709" stroke-width="4"/>
            <rect x="546" y="395" width="122" height="58" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="2.5"/>
            <line x1="560" y1="412" x2="650" y2="412" stroke="#10252d" stroke-width="3"/>
            <line x1="560" y1="427" x2="640" y2="427" stroke="#10252d" stroke-width="2.5"/>
            <line x1="560" y1="442" x2="622" y2="442" stroke="#10252d" stroke-width="2.5"/>
            <g class="hotspot-hint-tag">
              <rect x="522" y="352" width="170" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="607" y="370" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">Buku Log Profesor</text>
            </g>
          </g>
        </svg>
      `;
    }

    case 'view3': {
      const slideBoxOpen = gameState.flags.slideBoxUnlocked;
      const microSolved = gameState.puzzles.microscope;
      return `
        <svg viewBox="0 0 1120 630" class="room-svg" aria-label="Bilik 3: Sudut Mikroskop dan Botani">
          <defs>
            <radialGradient id="v3ScopeLight" cx="225" cy="300" r="280" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#7ee0eb" stop-opacity="0.24"/>
              <stop offset="100%" stop-color="#081014" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="1120" height="630" fill="#0d1b22"/>
          <rect width="1120" height="630" fill="url(#v3ScopeLight)"/>

          <!-- Meja Kerja Botani -->
          <rect x="0" y="425" width="1120" height="205" fill="#15262e" stroke="#040709" stroke-width="5"/>
          <line x1="0" y1="442" x2="1120" y2="442" stroke="#0b151a" stroke-width="3"/>

          <!-- Hotspot 1: Mikroskop Kompaun & Slaid Keratan Batang -->
          <g class="hotspot" data-hotspot="v3_microscope" tabindex="0" role="button" aria-label="Periksa Mikroskop Cahaya Kompaun">
            <rect class="hotspot-outline" x="125" y="410" width="166" height="32" rx="4" fill="#2c4855" stroke="#040709" stroke-width="4"/>
            <path class="hotspot-outline" d="M188 410 C138 338 144 224 214 182 L244 202 C190 242 190 340 226 410 Z" fill="#3b5e6e" stroke="#040709" stroke-width="4"/>
            <!-- Tiub Okular & Kanta Objektif -->
            <rect x="220" y="130" width="32" height="108" rx="3" transform="rotate(24 236 184)" fill="#d99b38" stroke="#040709" stroke-width="3.5"/>
            <rect x="200" y="252" width="26" height="32" rx="2" fill="#233b47" stroke="#040709" stroke-width="3"/>
            <!-- Pentas Slaid & Sumber Cahaya -->
            <rect x="172" y="330" width="112" height="14" rx="2" fill="#13242c" stroke="#040709" stroke-width="3"/>
            ${
              slideBoxOpen
                ? `<rect x="198" y="323" width="58" height="6" rx="1" fill="#7ee0eb" stroke="#040709" stroke-width="1.5"/>`
                : ''
            }
            <circle cx="212" cy="378" r="14" fill="${microSolved ? '#4ade80' : '#7ee0eb'}" stroke="#040709" stroke-width="3"/>
            <circle cx="170" cy="378" r="9" fill="#d99b38" stroke="#040709" stroke-width="2.5"/>
            <g class="hotspot-hint-tag">
              <rect x="115" y="92" width="196" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="213" y="111" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${microSolved ? 'Mikroskop (Disahkan)' : 'Mikroskop Cahaya'}</text>
            </g>
          </g>

          <!-- Hotspot 4: Peti Slaid Botani Berkunci (Kunci Loyang dari Bilik 2) -->
          <g class="hotspot" data-hotspot="v3_slide_box" tabindex="0" role="button" aria-label="Periksa Peti Slaid Botani">
            <rect class="hotspot-outline" x="326" y="362" width="150" height="80" rx="6" fill="${slideBoxOpen ? '#173440' : '#2a3e48'}" stroke="#040709" stroke-width="4.5"/>
            ${
              slideBoxOpen
                ? `
              <rect x="336" y="372" width="130" height="58" rx="3" fill="#0d1b22" stroke="#040709" stroke-width="3"/>
              <!-- Dua Slaid Kaca Spesimen X & Y -->
              <rect x="348" y="384" width="48" height="32" rx="2" fill="#99e2eb" fill-opacity="0.72" stroke="#040709" stroke-width="2"/>
              <circle cx="372" cy="400" r="7" fill="#2ea877" stroke="#040709" stroke-width="1.5"/>
              <rect x="406" y="384" width="48" height="32" rx="2" fill="#99e2eb" fill-opacity="0.72" stroke="#040709" stroke-width="2"/>
              <circle cx="430" cy="400" r="7" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
              <text x="372" y="427" text-anchor="middle" fill="#7ee0eb" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700">SLAID X</text>
              <text x="430" y="427" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700">SLAID Y</text>
            `
                : `
              <rect x="326" y="362" width="150" height="22" rx="4" fill="#3a525e" stroke="#040709" stroke-width="3"/>
              <!-- Kunci Loyang -->
              <rect x="386" y="376" width="30" height="26" rx="4" fill="#eab308" stroke="#040709" stroke-width="2.5"/>
              <circle cx="401" cy="389" r="4" fill="#05080a"/>
              <text x="401" y="424" text-anchor="middle" fill="#e7dcc3" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">PETI SLAID</text>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="316" y="324" width="170" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="401" y="343" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${slideBoxOpen ? 'Peti Slaid (Terbuka)' : 'Peti Slaid Berkunci'}</text>
            </g>
          </g>

          <!-- Hotspot 2: Poster Anatomi Monokotiledon vs Dikotiledon -->
          <g class="hotspot" data-hotspot="v3_botany_poster" tabindex="0" role="button" aria-label="Periksa Poster Anatomi Monokotiledon dan Dikotiledon">
            <rect class="hotspot-outline" x="486" y="68" width="316" height="252" rx="6" fill="#e7dcc3" stroke="#040709" stroke-width="5"/>
            <text x="644" y="100" text-anchor="middle" fill="#10252d" font-family="Fraunces, serif" font-size="16" font-weight="700">MONOKOT vs DIKOT</text>
            <circle cx="566" cy="196" r="56" fill="#c7d6b3" stroke="#040709" stroke-width="3"/>
            <circle cx="548" cy="176" r="6" fill="#1b4652"/><circle cx="584" cy="171" r="6" fill="#1b4652"/>
            <circle cx="566" cy="201" r="6" fill="#1b4652"/><circle cx="542" cy="214" r="6" fill="#1b4652"/>
            <circle cx="588" cy="218" r="6" fill="#1b4652"/>
            <text x="566" y="276" text-anchor="middle" fill="#10252d" font-size="11.5" font-weight="700">Monokotiledon</text>
            <text x="566" y="293" text-anchor="middle" fill="#1b4652" font-size="10">Tersebar · 1 Kotiledon</text>
            <circle cx="722" cy="196" r="56" fill="#c7d6b3" stroke="#040709" stroke-width="3"/>
            <circle cx="722" cy="158" r="6" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
            <circle cx="758" cy="182" r="6" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
            <circle cx="744" cy="224" r="6" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
            <circle cx="700" cy="224" r="6" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
            <circle cx="686" cy="182" r="6" fill="#d99b38" stroke="#040709" stroke-width="1.5"/>
            <text x="722" y="276" text-anchor="middle" fill="#10252d" font-size="11.5" font-weight="700">Dikotiledon</text>
            <text x="722" y="293" text-anchor="middle" fill="#1b4652" font-size="10">Gelang · 2 Kotiledon</text>
            <g class="hotspot-hint-tag">
              <rect x="554" y="32" width="180" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="644" y="51" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Poster Anatomi Tumbuhan</text>
            </g>
          </g>

          <!-- Hotspot 3: Rak Herbarium Spesimen Tumbuhan (Atas) -->
          <g class="hotspot" data-hotspot="v3_herbarium" tabindex="0" role="button" aria-label="Periksa Rak Spesimen Herbarium">
            <rect class="hotspot-outline" x="845" y="130" width="205" height="142" rx="6" fill="#192e38" stroke="#040709" stroke-width="5"/>
            <rect x="865" y="148" width="165" height="108" fill="#11222a" stroke="#040709" stroke-width="3"/>
            <path d="M948 242 L948 168 M948 212 Q918 198 908 178 M948 198 Q978 184 988 166" stroke="#2ea877" stroke-width="4" fill="none" stroke-linecap="round"/>
            <g class="hotspot-hint-tag">
              <rect x="862" y="92" width="170" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="947" y="111" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Rak Herbarium</text>
            </g>
          </g>

          <!-- Hotspot 5: Peti Spesimen & Alatan Berkunci (Terbuka selepas Mikroskop selesai) -->
          <g class="hotspot" data-hotspot="v3_tool_cabinet" tabindex="0" role="button" aria-label="Periksa Peti Spesimen dan Alatan">
            <rect class="hotspot-outline" x="845" y="282" width="205" height="143" rx="6" fill="#192e38" stroke="#040709" stroke-width="5"/>
            <rect x="865" y="298" width="165" height="112" rx="3" fill="${microSolved ? '#0c2321' : '#11222a'}" stroke="#040709" stroke-width="3"/>
            ${
              microSolved
                ? `
              <!-- Pintu kaca terbuka ke kiri -->
              <rect x="840" y="296" width="26" height="116" rx="2" fill="#7ee0eb" fill-opacity="0.24" stroke="#040709" stroke-width="2.5"/>
              ${
                gameState.flags.pickedScrewdriver
                  ? `<text x="948" y="358" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">ALAT TELAH DIKUTIP</text>`
                  : `<text x="948" y="320" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="700">TERBUKA · KUTIP ALAT</text>`
              }
            `
                : `
              <!-- Pintu kaca berkunci -->
              <rect x="869" y="302" width="157" height="104" rx="2" fill="#2a7f8e" fill-opacity="0.16" stroke="#040709" stroke-width="2"/>
              <rect x="912" y="332" width="70" height="44" rx="4" fill="#091318" stroke="#040709" stroke-width="2.5"/>
              <circle cx="947" cy="347" r="5" fill="#dc3545"/>
              <text x="947" y="366" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700">TERKUNCI</text>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="842" y="248" width="210" height="26" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="947" y="266" text-anchor="middle" fill="#f2b749" font-size="12" font-weight="700">${microSolved ? 'Peti Spesimen (Terbuka)' : 'Peti Spesimen &amp; Alatan'}</text>
            </g>
          </g>

          ${
            microSolved && !gameState.flags.pickedScrewdriver
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v3_item_screwdriver" tabindex="0" role="button" aria-label="Ambil Pemutar Skru Berpenebat">
            <rect x="892" y="330" width="110" height="68" rx="6" fill="transparent"/>
            <g class="hotspot-outline" stroke="#f2b749" stroke-width="2.6">
              <path d="M915 384 L946 355" stroke="#cbd5e1" stroke-width="6.5" stroke-linecap="round"/>
              <path d="M909 390 L920 380" stroke="#f8fafc" stroke-width="7.5" stroke-linecap="round"/>
              <rect x="941" y="339" width="38" height="16" rx="5" transform="rotate(-43 960 347)" fill="#d97706"/>
            </g>
            <g class="hotspot-hint-tag">
              <rect x="862" y="294" width="170" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="947" y="312" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Pemutar Skru</text>
            </g>
          </g>
          `
              : ''
          }
        </svg>
      `;
    }

    case 'view4': {
      const cured = gameState.puzzles.npkCured || { A: false, B: false, C: false };
      const allCured = cured.A && cured.B && cured.C;
      const drawerOpen = gameState.flags.npkDrawerUnlocked;
      return `
        <svg viewBox="0 0 1120 630" class="room-svg" aria-label="Bilik 4: Rumah Hijau Mini dan Rak Semaian">
          <defs>
            <linearGradient id="growPurpleTeal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#a855f7" stop-opacity="0.34"/>
              <stop offset="55%" stop-color="#1e6b7b" stop-opacity="0.20"/>
              <stop offset="100%" stop-color="#0a1419" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="glassPane" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#132934"/>
              <stop offset="100%" stop-color="#0b171d"/>
            </linearGradient>
          </defs>
          <rect width="1120" height="630" fill="#0c181f"/>

          <!-- Panel Kaca Rumah Hijau & Siluet Tumbuhan Malam -->
          <rect x="70" y="28" width="980" height="392" fill="url(#glassPane)" stroke="#040709" stroke-width="5"/>
          <path d="M100 420 Q155 290 215 240 Q240 315 250 420 Z" fill="#081317"/>
          <path d="M840 420 Q890 270 965 215 Q990 325 1015 420 Z" fill="#081317"/>
          <line x1="315" y1="28" x2="315" y2="420" stroke="#040709" stroke-width="4.5"/>
          <line x1="560" y1="28" x2="560" y2="420" stroke="#040709" stroke-width="4.5"/>
          <line x1="805" y1="28" x2="805" y2="420" stroke="#040709" stroke-width="4.5"/>

          <!-- Lampu Tumbuhan Ungu-Teal & Kon Cahaya -->
          <polygon points="150,118 760,118 820,420 90,420" fill="url(#growPurpleTeal)"/>
          <rect x="140" y="96" width="630" height="26" rx="6" fill="#233742" stroke="#040709" stroke-width="4"/>
          <rect x="160" y="114" width="590" height="10" rx="3" fill="#c084fc" stroke="#040709" stroke-width="2"/>

          <!-- Meja Rumah Hijau -->
          <rect x="0" y="420" width="1120" height="210" fill="#162831" stroke="#040709" stroke-width="5"/>
          <rect x="65" y="420" width="990" height="20" fill="#233d49" stroke="#040709" stroke-width="4"/>

          <!-- PASU A: Klorosis Daun Tua Menguning (Kekurangan N) -->
          <g class="hotspot" data-hotspot="v4_pot_a" tabindex="0" role="button" aria-label="Periksa atau Rawat Pasu A">
            <!-- Pasu Tanah Liat -->
            <polygon class="hotspot-outline" points="168,365 268,365 252,422 184,422" fill="#8b4d2b" stroke="#040709" stroke-width="4"/>
            <rect x="160" y="352" width="116" height="16" rx="3" fill="#a25a34" stroke="#040709" stroke-width="3.5"/>
            <rect x="190" y="380" width="56" height="22" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <text x="218" y="395" text-anchor="middle" fill="#10252d" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">PASU A</text>
            <!-- Batang & Daun -->
            <path d="M218 352 L218 228" stroke="${cured.A ? '#2ea877' : '#85a64a'}" stroke-width="7" stroke-linecap="round"/>
            <!-- Daun Bawah (Tua) — Kuning pucat sekata jika belum dirawat -->
            <path d="M218 322 Q165 304 142 324 Q175 344 218 328 Z" fill="${cured.A ? '#2ea877' : '#e0cc48'}" stroke="#040709" stroke-width="3"/>
            <path d="M218 314 Q270 296 294 316 Q260 338 218 322 Z" fill="${cured.A ? '#2ea877' : '#d6bf3c'}" stroke="#040709" stroke-width="3"/>
            <!-- Daun Atas -->
            <path d="M218 272 Q178 242 158 258 Q186 284 218 278 Z" fill="${cured.A ? '#38c78d' : '#a8c256'}" stroke="#040709" stroke-width="3"/>
            <path d="M218 264 Q258 234 278 250 Q250 276 218 270 Z" fill="${cured.A ? '#38c78d' : '#a8c256'}" stroke="#040709" stroke-width="3"/>
            <path d="M218 232 Q204 196 218 182 Q232 196 218 232 Z" fill="${cured.A ? '#4ade80' : '#8fb858'}" stroke="#040709" stroke-width="3"/>
            <g class="hotspot-hint-tag">
              <rect x="148" y="144" width="140" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="218" y="163" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${cured.A ? 'Pasu A (Sihat)' : 'Periksa Pasu A'}</text>
            </g>
          </g>

          <!-- PASU B: Daun Ungu Kemerahan (Kekurangan P) -->
          <g class="hotspot" data-hotspot="v4_pot_b" tabindex="0" role="button" aria-label="Periksa atau Rawat Pasu B">
            <polygon class="hotspot-outline" points="398,365 498,365 482,422 414,422" fill="#8b4d2b" stroke="#040709" stroke-width="4"/>
            <rect x="390" y="352" width="116" height="16" rx="3" fill="#a25a34" stroke="#040709" stroke-width="3.5"/>
            <rect x="420" y="380" width="56" height="22" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <text x="448" y="395" text-anchor="middle" fill="#10252d" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">PASU B</text>
            <path d="M448 352 L448 240" stroke="${cured.B ? '#2ea877' : '#6f326b'}" stroke-width="7" stroke-linecap="round"/>
            <!-- Daun Berwarna Ungu Antosianin jika belum dirawat -->
            <path d="M448 320 Q398 302 378 322 Q408 342 448 326 Z" fill="${cured.B ? '#2ea877' : '#85327b'}" stroke="#040709" stroke-width="3"/>
            <path d="M448 312 Q498 294 518 314 Q488 336 448 320 Z" fill="${cured.B ? '#2ea877' : '#73266a'}" stroke="#040709" stroke-width="3"/>
            <path d="M448 276 Q410 250 392 266 Q418 288 448 282 Z" fill="${cured.B ? '#38c78d' : '#96408b'}" stroke="#040709" stroke-width="3"/>
            <path d="M448 268 Q486 242 504 258 Q478 280 448 274 Z" fill="${cured.B ? '#38c78d' : '#85327b'}" stroke="#040709" stroke-width="3"/>
            <path d="M448 242 Q436 210 448 198 Q460 210 448 242 Z" fill="${cured.B ? '#4ade80' : '#65285e'}" stroke="#040709" stroke-width="3"/>
            <g class="hotspot-hint-tag">
              <rect x="378" y="158" width="140" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="448" y="177" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${cured.B ? 'Pasu B (Sihat)' : 'Periksa Pasu B'}</text>
            </g>
          </g>

          <!-- PASU C: Nekrosis / Tepi Daun Hangus Keperangan (Kekurangan K) -->
          <g class="hotspot" data-hotspot="v4_pot_c" tabindex="0" role="button" aria-label="Periksa atau Rawat Pasu C">
            <polygon class="hotspot-outline" points="628,365 728,365 712,422 644,422" fill="#8b4d2b" stroke="#040709" stroke-width="4"/>
            <rect x="620" y="352" width="116" height="16" rx="3" fill="#a25a34" stroke="#040709" stroke-width="3.5"/>
            <rect x="650" y="380" width="56" height="22" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <text x="678" y="395" text-anchor="middle" fill="#10252d" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">PASU C</text>
            <path d="M678 352 L678 232" stroke="#2ea877" stroke-width="7" stroke-linecap="round"/>
            <!-- Daun Hijau dengan Tepi Hangus Keperangan (Nekrosis) -->
            <path d="M678 322 Q625 304 602 324 Q635 344 678 328 Z" fill="#2ea877" stroke="${cured.C ? '#040709' : '#b45309'}" stroke-width="${cured.C ? '3' : '5'}"/>
            <path d="M678 314 Q730 296 754 316 Q720 338 678 322 Z" fill="#2ea877" stroke="${cured.C ? '#040709' : '#92400e'}" stroke-width="${cured.C ? '3' : '5'}"/>
            ${
              cured.C
                ? ''
                : `
            <circle cx="606" cy="324" r="6" fill="#78350f" stroke="#040709" stroke-width="2"/>
            <circle cx="750" cy="316" r="6" fill="#78350f" stroke="#040709" stroke-width="2"/>
            <circle cx="622" cy="258" r="5" fill="#92400e" stroke="#040709" stroke-width="2"/>
            <circle cx="734" cy="250" r="5" fill="#92400e" stroke="#040709" stroke-width="2"/>
            `
            }
            <path d="M678 272 Q638 242 618 258 Q646 284 678 278 Z" fill="#38c78d" stroke="${cured.C ? '#040709' : '#92400e'}" stroke-width="${cured.C ? '3' : '4.5'}"/>
            <path d="M678 264 Q718 234 738 250 Q710 276 678 270 Z" fill="#38c78d" stroke="${cured.C ? '#040709' : '#b45309'}" stroke-width="${cured.C ? '3' : '4.5'}"/>
            <path d="M678 234 Q664 198 678 184 Q692 198 678 234 Z" fill="#4ade80" stroke="#040709" stroke-width="3"/>
            <g class="hotspot-hint-tag">
              <rect x="608" y="146" width="140" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="678" y="165" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${cured.C ? 'Pasu C (Sihat)' : 'Periksa Pasu C'}</text>
            </g>
          </g>

          <!-- Laci Peralatan Logam Berkunci di Bawah Meja -->
          ${(() => {
            const pickedN = Boolean(gameState.flags.pickedBajaN);
            const pickedP = Boolean(gameState.flags.pickedBajaP);
            const pickedK = Boolean(gameState.flags.pickedBajaK);
            const allPicked = pickedN && pickedP && pickedK;
            return `
          <g class="hotspot" data-hotspot="v4_tool_drawer" tabindex="0" role="button" aria-label="Periksa Laci Peralatan Logam">
            <rect class="hotspot-outline" x="280" y="462" width="330" height="122" rx="6" fill="${drawerOpen ? '#122229' : '#243a45'}" stroke="#040709" stroke-width="4.5"/>
            ${
              drawerOpen
                ? `
              <rect x="296" y="478" width="298" height="94" rx="4" fill="#0c171d" stroke="#040709" stroke-width="3"/>
              ${
                allPicked
                  ? `<text x="445" y="530" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">LACI DIBUKA · SEMUA BAJA DIKUTIP</text>`
                  : `<text x="445" y="494" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">KLIK BOTOL BAJA UNTUK KUTIP</text>`
              }
            `
                : `
              <rect x="298" y="478" width="294" height="88" rx="4" fill="#1c2f38" stroke="#040709" stroke-width="3"/>
              <rect x="405" y="510" width="80" height="22" rx="3" fill="#3a525e" stroke="#040709" stroke-width="2.5"/>
              <!-- Kunci Tembaga / Padlock -->
              <path d="M435 502 L435 492 C435 484 455 484 455 492 L455 502" fill="none" stroke="#d98238" stroke-width="4.5"/>
              <rect x="431" y="500" width="28" height="24" rx="3" fill="#d98238" stroke="#040709" stroke-width="2.5"/>
              <circle cx="445" cy="512" r="3.5" fill="#05080a"/>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="345" y="428" width="200" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="445" y="447" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${drawerOpen ? 'Laci Baja (Terbuka)' : 'Laci Baja Berkunci'}</text>
            </g>
          </g>

          ${
            drawerOpen && !pickedN
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v4_item_baja_n" tabindex="0" role="button" aria-label="Ambil Baja Cecair Nitrogen (N)">
            <rect x="322" y="498" width="60" height="68" rx="6" fill="transparent"/>
            <rect x="342" y="502" width="20" height="10" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <rect class="hotspot-outline" x="332" y="512" width="40" height="50" rx="6" fill="#1d6fa5" stroke="#f2b749" stroke-width="2.8"/>
            <rect x="338" y="524" width="28" height="24" rx="2" fill="#e7dcc3"/>
            <text x="352" y="541" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">N</text>
            <g class="hotspot-hint-tag">
              <rect x="272" y="466" width="160" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="352" y="484" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Baja N</text>
            </g>
          </g>
          `
              : ''
          }
          ${
            drawerOpen && !pickedP
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v4_item_baja_p" tabindex="0" role="button" aria-label="Ambil Baja Cecair Fosforus (P)">
            <rect x="415" y="498" width="60" height="68" rx="6" fill="transparent"/>
            <rect x="435" y="502" width="20" height="10" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <rect class="hotspot-outline" x="425" y="512" width="40" height="50" rx="6" fill="#7c3aed" stroke="#f2b749" stroke-width="2.8"/>
            <rect x="431" y="524" width="28" height="24" rx="2" fill="#e7dcc3"/>
            <text x="445" y="541" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">P</text>
            <g class="hotspot-hint-tag">
              <rect x="365" y="466" width="160" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="445" y="484" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Baja P</text>
            </g>
          </g>
          `
              : ''
          }
          ${
            drawerOpen && !pickedK
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v4_item_baja_k" tabindex="0" role="button" aria-label="Ambil Baja Cecair Kalium (K)">
            <rect x="508" y="498" width="60" height="68" rx="6" fill="transparent"/>
            <rect x="528" y="502" width="20" height="10" rx="2" fill="#e7dcc3" stroke="#040709" stroke-width="2"/>
            <rect class="hotspot-outline" x="518" y="512" width="40" height="50" rx="6" fill="#d97706" stroke="#f2b749" stroke-width="2.8"/>
            <rect x="524" y="524" width="28" height="24" rx="2" fill="#e7dcc3"/>
            <text x="538" y="541" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">K</text>
            <g class="hotspot-hint-tag">
              <rect x="458" y="466" width="160" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="538" y="484" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Baja K</text>
            </g>
          </g>
          `
              : ''
          }
          `;
          })()}

          <!-- Dulang Automatik & Nota Sampel Tanah (Terbuka apabila 3 pasu sihat!) -->
          <g class="hotspot" data-hotspot="v4_soil_note" tabindex="0" role="button" aria-label="Periksa Dulang Automatik Nota Sampel Tanah">
            <rect class="hotspot-outline" x="810" y="330" width="185" height="90" rx="6" fill="#1b303a" stroke="#040709" stroke-width="4"/>
            ${
              allCured
                ? gameState.flags.pickedSoilNote
                  ? `
                <rect x="826" y="346" width="153" height="58" rx="4" fill="#0c171d" stroke="#040709" stroke-width="2.5"/>
                <text x="902" y="380" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">NOTA DIAMBIL</text>
              `
                  : `
                <rect x="826" y="346" width="153" height="58" rx="4" fill="#0c171d" stroke="#f2b749" stroke-width="2"/>
                <circle cx="902" cy="375" r="34" fill="#f2b749" fill-opacity="0.22"/>
                <rect x="858" y="352" width="88" height="46" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2.5" transform="rotate(-4 902 375)"/>
                <line x1="870" y1="366" x2="932" y2="366" stroke="#10252d" stroke-width="2.5"/>
                <line x1="870" y1="378" x2="926" y2="378" stroke="#1b4652" stroke-width="2"/>
              `
                : `
              <rect x="822" y="342" width="161" height="66" rx="4" fill="#2a3d47" stroke="#040709" stroke-width="3"/>
              <text x="902" y="372" text-anchor="middle" fill="#9bb3bd" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">DULANG TERKUNCI</text>
              <text x="902" y="388" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="10">PULIHKAN 3 PASU</text>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="802" y="292" width="200" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="902" y="311" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${allCured ? 'Nota Sampel Tanah' : 'Dulang Automatik'}</text>
            </g>
          </g>
        </svg>
      `;
    }

    case 'view5':
    default: {
      const vaultOpen = gameState.puzzles.bioVault;
      return `
        <svg viewBox="0 0 1120 630" class="room-svg" aria-label="Bilik 5: Bilik Rahsia Makmal Agro (Bio-Vault)">
          <defs>
            <radialGradient id="vaultCore" cx="50%" cy="42%" r="58%">
              <stop offset="0%" stop-color="#2ea877" stop-opacity="0.34"/>
              <stop offset="52%" stop-color="#1b4652" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="hybridGlow" cx="275" cy="285" r="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#6ee7b7" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="#071315" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="1120" height="630" fill="#091217"/>
          <rect width="1120" height="630" fill="url(#vaultCore)"/>

          <!-- Paip Siling & Jalur Keselamatan Bio-Vault -->
          <rect x="0" y="34" width="1120" height="16" fill="#13252e" stroke="#040709" stroke-width="3"/>
          <rect x="0" y="485" width="1120" height="145" fill="#0a1318" stroke="#040709" stroke-width="5"/>
          <line x1="160" y1="485" x2="70" y2="630" stroke="#05080a" stroke-width="2.5"/>
          <line x1="560" y1="485" x2="560" y2="630" stroke="#05080a" stroke-width="2.5"/>
          <line x1="960" y1="485" x2="1050" y2="630" stroke="#05080a" stroke-width="2.5"/>

          <!-- Kiri: Kebuk Kaca Bercahaya (Spesimen Hibrid 07) -->
          <g class="hotspot" data-hotspot="v5_hybrid_chamber" tabindex="0" role="button" aria-label="Periksa Kebuk Spesimen Hibrid 07">
            <rect width="300" height="390" x="125" y="100" fill="url(#hybridGlow)" opacity="0.65"/>
            <rect class="hotspot-outline" x="155" y="96" width="240" height="390" rx="14" fill="#0e2228" stroke="#040709" stroke-width="5"/>
            <rect x="176" y="138" width="198" height="295" rx="68" fill="#0b2f2d" stroke="#040709" stroke-width="4"/>
            <rect x="192" y="156" width="166" height="258" rx="54" fill="#134e46" opacity="0.65"/>
            <!-- Tumbuhan Spesimen Hibrid 07 di dalam Cecair Nutrien -->
            <path d="M275 390 C275 330 272 280 275 235" stroke="#6ee7b7" stroke-width="6" stroke-linecap="round"/>
            <path d="M275 310 Q232 280 218 298 Q242 325 275 316 Z" fill="#34d399" stroke="#040709" stroke-width="2.5"/>
            <path d="M275 282 Q318 250 332 270 Q306 298 275 288 Z" fill="#34d399" stroke="#040709" stroke-width="2.5"/>
            <circle cx="275" cy="228" r="20" fill="#f2b749" stroke="#040709" stroke-width="3"/>
            <circle cx="242" cy="240" r="5" fill="#a7f3d0" opacity="0.6"/>
            <circle cx="308" cy="202" r="4" fill="#a7f3d0" opacity="0.6"/>
            <circle cx="252" cy="186" r="3.5" fill="#a7f3d0" opacity="0.5"/>
            <rect x="195" y="108" width="160" height="24" rx="4" fill="#071014" stroke="#040709" stroke-width="2.5"/>
            <text x="275" y="124" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="11.5" font-weight="700">SPESIMEN HIBRID 07</text>
            <rect x="195" y="446" width="160" height="26" rx="4" fill="#071014" stroke="#040709" stroke-width="2.5"/>
            <text x="275" y="463" text-anchor="middle" fill="#fef08a" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">EC OPTIMUM: KAWALAN</text>
            <g class="hotspot-hint-tag">
              <rect x="175" y="58" width="200" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="275" y="77" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Spesimen Hibrid 07</text>
            </g>
          </g>

          <!-- Kanan Atas: Papan Taksonomi Hortikultur Bercahaya (4 Spesimen Buah & Daun) -->
          <g class="hotspot" data-hotspot="v5_taxonomy_board" tabindex="0" role="button" aria-label="Periksa Papan Taksonomi Hortikultur">
            <rect class="hotspot-outline" x="455" y="76" width="540" height="205" rx="10" fill="#182b34" stroke="#040709" stroke-width="5"/>
            <rect x="472" y="92" width="506" height="28" rx="4" fill="#0a161c" stroke="#040709" stroke-width="2.5"/>
            <text x="725" y="111" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">PAPAN TAKSONOMI HORTIKULTUR · 4 BUAH TROPIKA</text>

            <!-- Plak 1: Durian -->
            <g transform="translate(476, 130)">
              <rect width="114" height="134" rx="6" fill="#0e1e26" stroke="#040709" stroke-width="3"/>
              <ellipse cx="57" cy="54" rx="24" ry="28" fill="#84a93c" stroke="#040709" stroke-width="2.5"/>
              <path d="M35 44 L29 40 M33 58 L27 58 M79 44 L85 40 M81 58 L87 58 M57 25 L57 18" stroke="#040709" stroke-width="2.5" stroke-linecap="round"/>
              <path d="M57 24 Q74 16 78 28 Q68 34 57 28 Z" fill="#2ea877" stroke="#040709" stroke-width="2"/>
              <text x="57" y="106" text-anchor="middle" fill="#e7dcc3" font-size="12" font-weight="700">DURIAN</text>
              <text x="57" y="122" text-anchor="middle" fill="${vaultOpen ? '#6ee7b7' : '#9bb3bd'}" font-size="9.5" font-style="italic">${vaultOpen ? 'D. zibethinus' : '? ? ?'}</text>
            </g>

            <!-- Plak 2: Mangga -->
            <g transform="translate(604, 130)">
              <rect width="114" height="134" rx="6" fill="#0e1e26" stroke="#040709" stroke-width="3"/>
              <path d="M55 28 C72 28 80 48 73 68 C67 84 44 84 39 68 C35 54 41 28 55 28 Z" fill="#f2b749" stroke="#040709" stroke-width="2.5"/>
              <path d="M56 28 Q75 18 82 32 Q68 38 56 30 Z" fill="#2ea877" stroke="#040709" stroke-width="2"/>
              <text x="57" y="106" text-anchor="middle" fill="#e7dcc3" font-size="12" font-weight="700">MANGGA</text>
              <text x="57" y="122" text-anchor="middle" fill="${vaultOpen ? '#6ee7b7' : '#9bb3bd'}" font-size="9.5" font-style="italic">${vaultOpen ? 'M. indica' : '? ? ?'}</text>
            </g>

            <!-- Plak 3: Rambutan -->
            <g transform="translate(732, 130)">
              <rect width="114" height="134" rx="6" fill="#0e1e26" stroke="#040709" stroke-width="3"/>
              <circle cx="57" cy="56" r="22" fill="#dc3545" stroke="#040709" stroke-width="2.5"/>
              <path d="M35 46 L26 41 M34 62 L24 64 M43 75 L38 84 M79 46 L88 41 M80 62 L90 64 M71 75 L76 84 M57 34 L57 24" stroke="#84cc16" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M58 34 Q74 22 80 33 Q69 39 58 36 Z" fill="#2ea877" stroke="#040709" stroke-width="2"/>
              <text x="57" y="106" text-anchor="middle" fill="#e7dcc3" font-size="12" font-weight="700">RAMBUTAN</text>
              <text x="57" y="122" text-anchor="middle" fill="${vaultOpen ? '#6ee7b7' : '#9bb3bd'}" font-size="9.5" font-style="italic">${vaultOpen ? 'N. lappaceum' : '? ? ?'}</text>
            </g>

            <!-- Plak 4: Nangka -->
            <g transform="translate(860, 130)">
              <rect width="114" height="134" rx="6" fill="#0e1e26" stroke="#040709" stroke-width="3"/>
              <ellipse cx="57" cy="56" rx="22" ry="27" fill="#a3a832" stroke="#040709" stroke-width="2.5"/>
              <path d="M48 44 L54 44 M62 50 L68 50 M46 60 L52 60 M60 68 L66 68" stroke="#3f4614" stroke-width="2" stroke-linecap="round"/>
              <path d="M57 28 Q74 18 81 30 Q68 35 57 30 Z" fill="#2ea877" stroke="#040709" stroke-width="2"/>
              <text x="57" y="106" text-anchor="middle" fill="#e7dcc3" font-size="12" font-weight="700">NANGKA</text>
              <text x="57" y="122" text-anchor="middle" fill="${vaultOpen ? '#6ee7b7' : '#9bb3bd'}" font-size="9.5" font-style="italic">${vaultOpen ? 'A. heterophyllus' : '? ? ?'}</text>
            </g>

            <g class="hotspot-hint-tag">
              <rect x="615" y="38" width="220" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="725" y="57" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">Papan Taksonomi Buah</text>
            </g>
          </g>

          <!-- Kanan Bawah: Peti Kebal Fius Utama (Kunci Elektronik Taksonomi) -->
          ${(() => {
            const gotFuse = Boolean(gameState.flags.pickedMainFuse);
            const gotNote = Boolean(gameState.flags.pickedEcNote);
            return `
          <g class="hotspot" data-hotspot="v5_biovault" tabindex="0" role="button" aria-label="Buka Peti Kebal Fius Utama">
            <rect class="hotspot-outline" x="505" y="310" width="440" height="175" rx="10" fill="#1b2b34" stroke="#040709" stroke-width="5.5"/>
            <rect x="525" y="328" width="400" height="139" rx="6" fill="${vaultOpen ? '#081b19' : '#121e24'}" stroke="#040709" stroke-width="3.5"/>
            ${
              vaultOpen
                ? `
              <!-- Pintu Kebal Terbuka di Kiri -->
              <rect x="462" y="316" width="60" height="162" rx="6" fill="#223640" stroke="#040709" stroke-width="4"/>
              <circle cx="492" cy="397" r="16" fill="#2ea877" stroke="#040709" stroke-width="3"/>
              <!-- Ruang Dalam Peti Kebal -->
              <rect x="542" y="346" width="175" height="104" rx="6" fill="#0d2622" stroke="#1b4652" stroke-width="2.5"/>
              <rect x="734" y="346" width="175" height="104" rx="6" fill="#0d2622" stroke="#1b4652" stroke-width="2.5"/>
              ${
                gotFuse && gotNote
                  ? `<text x="725" y="403" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">PETI KEBAL TERBUKA · SEMUA ITEM DIKUTIP</text>`
                  : `<text x="725" y="340" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">PETI KEBAL TERBUKA · KLIK ITEM DI DALAM</text>`
              }
            `
                : `
              <circle cx="620" cy="397" r="48" fill="#182a33" stroke="#040709" stroke-width="4"/>
              <circle cx="620" cy="397" r="18" fill="#d99b38" stroke="#040709" stroke-width="3"/>
              <line x1="620" y1="354" x2="620" y2="440" stroke="#040709" stroke-width="4.5"/>
              <line x1="577" y1="397" x2="663" y2="397" stroke="#040709" stroke-width="4.5"/>
              <rect x="692" y="348" width="210" height="96" rx="6" fill="#081116" stroke="#040709" stroke-width="3"/>
              <text x="797" y="378" text-anchor="middle" fill="#ff7b89" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">KUNCI TAKSONOMI</text>
              <text x="797" y="404" text-anchor="middle" fill="#e7dcc3" font-size="12">Padankan 4 Nama Saintifik Buah</text>
              <rect x="742" y="416" width="110" height="16" rx="3" fill="#dc3545" stroke="#040709" stroke-width="2"/>
            `
            }
            <g class="hotspot-hint-tag">
              <rect x="618" y="276" width="214" height="28" rx="4" fill="#05080a" stroke="#f2b749" stroke-width="1.5"/>
              <text x="725" y="295" text-anchor="middle" fill="#f2b749" font-size="13" font-weight="700">${vaultOpen ? 'Peti Kebal (Terbuka)' : 'Peti Kebal Fius Utama'}</text>
            </g>
          </g>

          ${
            vaultOpen && !gotFuse
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v5_item_fius" tabindex="0" role="button" aria-label="Ambil Fius Utama 30A">
            <rect x="556" y="356" width="146" height="84" rx="6" fill="transparent"/>
            <rect class="hotspot-outline" x="580" y="378" width="96" height="36" rx="5" fill="#2ea877" stroke="#f2b749" stroke-width="3"/>
            <rect x="580" y="378" width="20" height="36" rx="2" fill="#cbd5e1" stroke="#040709" stroke-width="2.5"/>
            <rect x="656" y="378" width="20" height="36" rx="2" fill="#cbd5e1" stroke="#040709" stroke-width="2.5"/>
            <path d="M631 384 L620 397 L629 397 L625 408 L637 394 L628 394 Z" fill="#fef08a"/>
            <text x="628" y="432" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="700">FIUS UTAMA 30A</text>
            <g class="hotspot-hint-tag">
              <rect x="542" y="320" width="172" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="628" y="338" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Fius Utama 30A</text>
            </g>
          </g>
          `
              : ''
          }
          ${
            vaultOpen && !gotNote
              ? `
          <g class="hotspot hotspot-pickup" data-hotspot="v5_item_nota_ec" tabindex="0" role="button" aria-label="Ambil Nota Lekat Prof. Razak (EC 1.8)">
            <rect x="748" y="356" width="146" height="84" rx="6" fill="transparent"/>
            <g class="hotspot-outline" stroke="#f2b749" stroke-width="2.8">
              <rect x="790" y="366" width="62" height="62" rx="3" fill="#fef08a" transform="rotate(3 821 397)"/>
              <polygon points="834,428 852,410 834,410" fill="#d99b38" stroke="#040709" stroke-width="1.8"/>
              <text x="821" y="392" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">EC</text>
              <text x="821" y="410" text-anchor="middle" fill="#b91c1c" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">1.8</text>
            </g>
            <g class="hotspot-hint-tag">
              <rect x="736" y="320" width="172" height="26" rx="4" fill="#05080a" stroke="#6ee7b7" stroke-width="1.5"/>
              <text x="822" y="338" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700">Ambil Nota Lekat EC</text>
            </g>
          </g>
          `
              : ''
          }
          `;
          })()}
        </svg>
      `;
    }
  }
}

function bindRoomHotspots() {
  dom.roomSceneContainer.querySelectorAll('.hotspot').forEach((el) => {
    const hotspotId = el.dataset.hotspot;
    el.addEventListener('click', () => handleHotspotClick(hotspotId));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleHotspotClick(hotspotId);
      }
    });
  });
}

// ============================================================================
// 8B. LOGIK TEKA-TEKI BAHAGIAN 2 (KUNCI TEMBAGA, NPK RUMAH HIJAU & pH TANAH)
// ============================================================================

function getPotCloseupSVG(potKey, isCured) {
  const configs = {
    A: {
      title: 'Pasu A — Pemeriksaan Daun',
      leafColor: isCured ? '#2ea877' : '#e0cc48',
      edgeColor: '#040709',
      edgeWidth: 3,
      caption: isCured
        ? 'Daun tua kembali hijau sihat selepas dirawat.'
        : 'Daun tua di bahagian bawah mengalami klorosis (kuning pucat sekata).',
    },
    B: {
      title: 'Pasu B — Pemeriksaan Daun',
      leafColor: isCured ? '#2ea877' : '#85327b',
      edgeColor: '#040709',
      edgeWidth: 3,
      caption: isCured
        ? 'Pigmen daun kembali hijau normal selepas dirawat.'
        : 'Daun bertukar warna ungu kemerahan (pengumpulan antosianin).',
    },
    C: {
      title: 'Pasu C — Pemeriksaan Daun',
      leafColor: '#2ea877',
      edgeColor: isCured ? '#040709' : '#92400e',
      edgeWidth: isCured ? 3 : 7,
      caption: isCured
        ? 'Tepi daun kembali pulih tanpa kesan hangus.'
        : 'Tepi dan hujung daun tua berwarna perang serta kelihatan hangus bergulung (nekrosis tepi daun).',
    },
  };
  const cfg = configs[potKey];
  return `
    <div class="inspect-visual-card">
      <svg viewBox="0 0 480 180">
        <rect width="480" height="180" fill="#0d1b22"/>
        <path d="M240 164 L240 50" stroke="#237a57" stroke-width="6" stroke-linecap="round"/>
        <path d="M240 116 Q155 82 118 112 Q165 144 240 124 Z" fill="${cfg.leafColor}" stroke="${cfg.edgeColor}" stroke-width="${cfg.edgeWidth}"/>
        <path d="M240 104 Q325 70 362 100 Q315 132 240 112 Z" fill="${cfg.leafColor}" stroke="${cfg.edgeColor}" stroke-width="${cfg.edgeWidth}"/>
        <path d="M240 62 Q216 26 240 16 Q264 26 240 62 Z" fill="${isCured ? '#4ade80' : '#4a8f63'}" stroke="#040709" stroke-width="3"/>
      </svg>
    </div>
    <div class="inspect-clue-box">${cfg.caption}</div>
  `;
}

function handleNpkPotInteraction(potKey) {
  const cured = gameState.puzzles.npkCured;
  if (cured[potKey]) {
    showDialogue(
      gameState.playerName,
      `Pasu ${potKey} dah pulih dan kelihatan subur menghijau!`,
      'normal'
    );
    return;
  }

  const selected = gameState.selectedItemId;
  const fertilizerMap = {
    baja_n: 'A',
    baja_p: 'B',
    baja_k: 'C',
  };

  // Jika pemain memilih botol baja daripada inventori
  if (selected && fertilizerMap[selected]) {
    if (fertilizerMap[selected] === potKey) {
      cured[potKey] = true;
      removeItemFromInventory(selected);
      playSFX('pickup');

      const successMessages = {
        A: 'Tepat sekali! Daun tua Pasu A yang kuning klorosis kembali hijau segar selepas diberi Baja Nitrogen (N).',
        B: 'Menjadi! Warna ungu antosianin pada daun Pasu B hilang selepas dirawat dengan Baja Fosforus (P).',
        C: 'Berjaya! Tepi daun Pasu C yang hangus nekrosis kembali pulih dengan Baja Kalium (K).',
      };

      if (cured.A && cured.B && cured.C) {
        gameState.puzzles.greenhouseRack = true;
        refreshCurrentRoomScene();
        addTimeBonus(60, 'npk_nutrien');
        showDialogue(
          gameState.playerName,
          `${successMessages[potKey]} Ketiga-tiga anak benih dah sihat—dulang automatik terbuka dan sistem menambah bonus +60 saat!`
        );
      } else {
        refreshCurrentRoomScene();
        showDialogue(gameState.playerName, successMessages[potKey]);
      }
    } else {
      applyTimePenalty(
        30,
        'npk_nutrien',
        'Alamak! Simptom daun tu tak padan dengan baja ni. Silap bacaan nutrien!'
      );
    }
    return;
  }

  // Pemeriksaan dekat simptom daun jika tiada botol baja dipilih
  const symptomDialogues = {
    A: 'Daun tua di bahagian bawah Pasu A ni kuning pucat sekata... Ini simptom klorosis yang jelas. Nutrien apa yang kurang ya?',
    B: 'Hmm, daun Pasu B ni bertukar warna ungu kemerahan gelap dan nampak terbantut.',
    C: 'Perhatikan tepi daun Pasu C ni—berwarna perang, kering dan macam hangus terbakar di pinggirnya.',
  };

  showDialogue(gameState.playerName, symptomDialogues[potKey]);
  setInspectModalWide(false);
  dom.inspectTitle.textContent = `Pemeriksaan Pasu ${potKey} (Rumah Hijau)`;
  dom.inspectBody.innerHTML = `
    ${getPotCloseupSVG(potKey, false)}
    <p style="font-size:0.88rem;color:var(--text-secondary);">
      ${
        gameState.flags.npkDrawerUnlocked
          ? 'Pilih botol baja yang betul daripada inventori di bawah, kemudian klik semula pasu ini untuk merawatnya.'
          : 'Aku perlu buka laci peralatan logam di bawah meja untuk mendapatkan botol baja rawatan.'
      }
    </p>
    <div class="pin-actions">
      <button type="button" class="btn-secondary" id="btn-inspect-ok">Tutup</button>
    </div>
  `;
  dom.inspectModal.hidden = false;
  document.getElementById('btn-inspect-ok').addEventListener('click', () => {
    playSFX('click');
    closeInspectModal();
  });
}

function handleNpkDrawerInteraction() {
  if (gameState.flags.npkDrawerUnlocked) {
    const allPicked =
      gameState.flags.pickedBajaN && gameState.flags.pickedBajaP && gameState.flags.pickedBajaK;
    showDialogue(
      gameState.playerName,
      allPicked
        ? 'Laci peralatan dah terbuka dan kesemua botol baja (N, P, K) telah diambil.'
        : 'Laci peralatan dah terbuka! Klik setiap botol baja (N, P, K) di dalam laci untuk kutip ke inventori.'
    );
    return;
  }

  if (gameState.selectedItemId === 'kunci_tembaga') {
    gameState.flags.npkDrawerUnlocked = true;
    removeItemFromInventory('kunci_tembaga');
    playSFX('pickup');
    refreshCurrentRoomScene();
    showDialogue(
      gameState.playerName,
      'Krak! Kunci tembaga muat tepat dan laci terbuka! Ada tiga botol baja (N, P, K) di dalam laci ni—klik setiap botol untuk kutip masuk ke inventori.'
    );
  } else {
    showDialogue(
      gameState.playerName,
      'Laci besi ni berkunci. Aku kena pilih kunci yang sesuai dari inventori dulu.',
      'warning'
    );
  }
}

function openSoilPhWorkbench(initialSample = null) {
  if (!gameState.flags.treatedSoilSamples) {
    gameState.flags.treatedSoilSamples = { s1: false, s2: false, s3: false };
  }

  const getSampleMeta = (id) => {
    const isTreated = Boolean(gameState.flags.treatedSoilSamples[id] || gameState.puzzles.soilCabinet);
    if (id === 's1') {
      return {
        id: 's1',
        label: 'S1: Tanah Gambut',
        fullLabel: 'Sampel 1 (S1): Tanah Gambut',
        desc: 'Tanah organik gelap',
        ph: isTreated ? '~6.2' : '4.2',
        status: isTreated ? 'STABIL OPTIMUM (5.5–6.5)' : 'TERLALU MASAM (Acidic)',
        cls: isTreated ? '' : 'is-acidic',
        treated: isTreated,
      };
    }
    if (id === 's2') {
      return {
        id: 's2',
        label: 'S2: Tanah Aluvium',
        fullLabel: 'Sampel 2 (S2): Tanah Aluvium',
        desc: 'Lom perang subur',
        ph: isTreated ? '~6.2' : '6.0',
        status: isTreated
          ? 'STABIL OPTIMUM (5.5–6.5)'
          : 'OPTIMUM (Sudah dalam julat 5.5–6.5)',
        cls: '',
        treated: isTreated,
      };
    }
    return {
      id: 's3',
      label: 'S3: Tanah Berkapur',
      fullLabel: 'Sampel 3 (S3): Tanah Berkapur',
      desc: 'Tanah berkapur pucat',
      ph: isTreated ? '~6.2' : '7.9',
      status: isTreated ? 'STABIL OPTIMUM (5.5–6.5)' : 'BERALKALI (Alkaline)',
      cls: isTreated ? '' : 'is-alkaline',
      treated: isTreated,
    };
  };

  let activeId = initialSample || gameState.flags.activePhSample || 's1';
  gameState.flags.testedSoilSamples[activeId] = true;
  gameState.flags.activePhSample = activeId;
  refreshCurrentRoomScene();

  const renderWorkbench = () => {
    const activeSample = getSampleMeta(activeId);
    const isTested = Boolean(gameState.flags.testedSoilSamples[activeId]);
    const solved = Boolean(gameState.puzzles.phSolved || gameState.puzzles.soilCabinet);
    const treatedCount = ['s1', 's2', 's3'].filter((k) => gameState.flags.treatedSoilSamples[k]).length;

    dom.inspectTitle.textContent = 'Uji Kaji pH Tanah & Pengapuran (Meja Kerja)';
    dom.inspectBody.innerHTML = `
      <div class="ph-workbench">
        <div class="ph-meter-lcd">
          <div>
            <div style="font-size:0.78rem;color:var(--text-secondary);font-weight:700;">
              METER pH DIGITAL PROFESOR · ${treatedCount}/3 SAMPEL SELESAI
            </div>
            <div style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin-top:2px;">
              ${activeSample.fullLabel}
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${activeSample.desc}</div>
          </div>
          <div class="ph-lcd-screen">
            <span class="ph-lcd-val ${isTested ? activeSample.cls : ''}">
              ${isTested ? `pH ${activeSample.ph}` : 'pH --.-'}
            </span>
            <span class="ph-lcd-status">
              ${isTested ? activeSample.status : 'Klik kad sampel untuk uji prob'}
            </span>
          </div>
        </div>

        <div class="ph-beaker-grid">
          ${['s1', 's2', 's3']
            .map((id) => {
              const s = getSampleMeta(id);
              const tested = Boolean(gameState.flags.testedSoilSamples[id]);
              return `
                <button
                  type="button"
                  class="ph-beaker-btn ${activeId === id ? 'active' : ''} ${s.treated ? 'is-treated' : ''}"
                  data-sample="${id}"
                >
                  <span class="ph-beaker-name">${s.label}</span>
                  <span class="ph-beaker-type">${tested ? `pH ${s.ph}` : 'Belum diuji'}</span>
                  ${s.treated ? '<span class="ph-beaker-badge">✅ Selesai</span>' : ''}
                </button>
              `;
            })
            .join('')}
        </div>

        ${
          solved
            ? `
          <div class="inspect-clue-box">
            <strong>Protokol pH Tanah Disahkan!</strong> Ketiga-tiga sampel (<strong>S1: Tanah Gambut</strong>, <strong>S2: Tanah Aluvium</strong>, dan <strong>S3: Tanah Berkapur</strong>) telah diuji dan distabilkan ke julat optimum (<strong>~pH 6.2</strong>). Kabinet tanah telah dibuka!
          </div>
        `
            : activeSample.treated
              ? `
          <div class="inspect-clue-box">
            <strong>${activeSample.label} telah distabilkan (✅ Selesai — ~pH 6.2).</strong><br/>
            Klik kad sampel lain di atas yang belum selesai untuk meneruskan ujian dan rawatan.
          </div>
        `
              : `
          <div class="ph-treatment-section">
            <p class="ph-treatment-title">
              Pilih rawatan kimia untuk <u>${activeSample.fullLabel}</u> bagi mencapai julat optimum (pH 5.5–6.5):
            </p>
            <div class="ph-treatment-actions">
              <button type="button" class="ph-treat-btn" data-reagent="gml">Kapur Pertanian / GML (CaCO₃·MgCO₃)</button>
              <button type="button" class="ph-treat-btn" data-reagent="sulfur">Serbuk Sulfur (S)</button>
              <button type="button" class="ph-treat-btn" data-reagent="urea">Baja Urea (46% N)</button>
              <button type="button" class="ph-treat-btn" data-reagent="water">Air Suling (H₂O) / Tiada Rawatan Kimia Diperlukan</button>
            </div>
          </div>
        `
        }
      </div>
    `;

    dom.inspectBody.querySelectorAll('.ph-beaker-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playSFX('click');
        activeId = btn.dataset.sample;
        gameState.flags.testedSoilSamples[activeId] = true;
        gameState.flags.activePhSample = activeId;
        refreshCurrentRoomScene();
        renderWorkbench();
      });
    });

    dom.inspectBody.querySelectorAll('.ph-treat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reagent = btn.dataset.reagent;
        gameState.flags.testedSoilSamples[activeId] = true;
        gameState.flags.activePhSample = activeId;

        if (gameState.flags.treatedSoilSamples[activeId]) {
          renderWorkbench();
          return;
        }

        let isCorrect = false;
        let successMsg = '';
        let errorMsg = '';

        if (activeId === 's1') {
          if (reagent === 'gml') {
            isCorrect = true;
            successMsg =
              'Tepat! Kapur Pertanian (GML) meneutralkan Tanah Gambut daripada pH 4.2 kepada ~pH 6.2!';
          } else {
            errorMsg =
              'Tanah Gambut terlalu masam (pH 4.2). Gunakan Kapur Pertanian (GML) untuk meneutralkan keasidan!';
          }
        } else if (activeId === 's2') {
          if (reagent === 'water') {
            isCorrect = true;
            successMsg =
              'Betul! Tanah Aluvium sudah berada pada pH optimum (6.0) — hanya Air Suling digunakan tanpa bahan kimia tambahan.';
          } else {
            errorMsg =
              'Tanah Aluvium sudah berada pada pH optimum (6.0)! Tidak perlu tambah kapur, sulfur, atau baja.';
          }
        } else if (activeId === 's3') {
          if (reagent === 'sulfur') {
            isCorrect = true;
            successMsg =
              'Tepat sekali! Serbuk Sulfur (S) menurunkan kealkalian Tanah Berkapur daripada pH 7.9 kepada ~pH 6.2!';
          } else {
            errorMsg =
              'Tanah Berkapur bersifat alkali (pH 7.9). Gunakan Serbuk Sulfur (S) untuk menurunkan pH tanah!';
          }
        }

        if (!isCorrect) {
          applyTimePenalty(30, 'ph_tanah', errorMsg);
          return;
        }

        gameState.flags.treatedSoilSamples[activeId] = true;
        playSFX('pickup');

        const tested = gameState.flags.testedSoilSamples;
        const treated = gameState.flags.treatedSoilSamples;
        const allTested = Boolean(tested.s1 && tested.s2 && tested.s3);
        const allTreated = Boolean(treated.s1 && treated.s2 && treated.s3);

        if (allTested && allTreated && !gameState.puzzles.phSolved) {
          gameState.puzzles.phSolved = true;
          gameState.puzzles.soilCabinet = true;

          refreshCurrentRoomScene();
          renderWorkbench();
          addTimeBonus(60, 'ph_tanah');
          showDialogue(
            gameState.playerName,
            'Syabas! Ketiga-tiga sampel tanah (S1, S2 & S3) berjaya diuji dan distabilkan ke ~pH 6.2! (+60 SAAT!) Penutup Peti Alat Mikroskop di atas meja kini terbuka—klik Kanta Pembesar dan Slaid Kaca di dalamnya untuk kutip!'
          );
        } else {
          refreshCurrentRoomScene();
          renderWorkbench();
          showDialogue(gameState.playerName, successMsg, 'normal');
        }
      });
    });
  };

  setInspectModalWide(false);
  renderWorkbench();
  dom.inspectModal.hidden = false;
}

// ============================================================================
// 8C. LOGIK TEKA-TEKI BAHAGIAN 3 (SEGI TIGA USDA & MIKROSKOP BOTANI)
// ============================================================================

function hasInventoryItem(itemId) {
  return gameState.inventory.some((item) => item.id === itemId);
}

function setInspectModalWide(isWide) {
  const card = dom.inspectModal.querySelector('.modal-inspect');
  if (card) {
    card.classList.toggle('is-wide', Boolean(isWide));
  }
}

function closeInspectModal() {
  dom.inspectModal.hidden = true;
  setInspectModalWide(false);
}

function triPoint(clay, silt, sand) {
  // Bucu Segitiga Sama Sisi: Liat=100 (260, 44), Pasir=100 (60, 390.41), Kelodak=100 (460, 390.41)
  const x = 60 + 4 * silt + 2 * clay;
  const y = 390.41 - 3.4641 * clay;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function triPointXY(clay, silt) {
  return {
    x: 60 + 4 * silt + 2 * clay,
    y: 390.41 - 3.4641 * clay,
  };
}

function triPoly(pts) {
  return pts.map(([c, k, s]) => triPoint(c, k, s)).join(' ');
}

function openSoilTriangleModal() {
  if (!gameState.puzzles.soilTriangle) {
    if (!hasInventoryItem('nota_tanah')) {
      showDialogue(
        gameState.playerName,
        'Carta segi tiga tekstur tanah ni perlukan data peratusan sampel tanah dulu. Aku kena selesaikan semaian NPK di Bilik 4 dan kutip Nota Sampel Tanah.',
        'warning'
      );
      return;
    }

    if (gameState.selectedItemId !== 'kanta_pembesar') {
      showDialogue(
        gameState.playerName,
        hasInventoryItem('kanta_pembesar')
          ? 'Tulisan skala pada carta segi tiga tekstur tanah ni halus sangat! Aku kena pilih Kanta Pembesar daripada inventori di bawah terlebih dahulu sebelum membacanya.'
          : 'Tulisan skala pada carta USDA ni halus sangat! Aku perlukan Kanta Pembesar daripada Peti Alat Mikroskop (selepas selesai uji kaji pH S1, S2 & S3).',
        'warning'
      );
      return;
    }
  }

  const guide = gameState.flags.soilTriState || { clay: 35, silt: 30, sand: 35 };

  const soilZones = [
    { id: 'pasir', label: 'Pasir (Sand)' },
    { id: 'lom_berpasir', label: 'Lom Berpasir (Sandy Loam)' },
    { id: 'tanah_lom', label: 'Tanah Lom (Loam)' },
    { id: 'lom_berkelodak', label: 'Lom Berkelodak (Silt Loam)' },
    { id: 'lom_berliat', label: 'Lom Berliat (Clay Loam)' },
    { id: 'tanah_liat', label: 'Tanah Liat (Clay)' },
  ];

  // Poligon zon tekstur USDA (Clay, Silt, Sand)
  const polyClay = triPoly([
    [100, 0, 0],
    [55, 0, 45],
    [40, 15, 45],
    [40, 40, 20],
    [60, 40, 0],
  ]);
  const polySiltyClay = triPoly([
    [60, 40, 0],
    [40, 40, 20],
    [40, 60, 0],
  ]);
  const polySandyClay = triPoly([
    [55, 0, 45],
    [35, 0, 65],
    [35, 20, 45],
    [40, 15, 45],
  ]);
  const polyClayLoam = triPoly([
    [40, 15, 45],
    [27, 28, 45],
    [27, 53, 20],
    [40, 40, 20],
  ]);
  const polySiltyClayLoam = triPoly([
    [40, 40, 20],
    [27, 53, 20],
    [27, 73, 0],
    [40, 60, 0],
  ]);
  const polySandyClayLoam = triPoly([
    [35, 0, 65],
    [20, 0, 80],
    [20, 28, 52],
    [27, 28, 45],
    [35, 20, 45],
  ]);
  const polyLoam = triPoly([
    [27, 28, 45],
    [27, 50, 23],
    [7, 50, 43],
    [7, 41, 52],
    [20, 28, 52],
  ]);
  const polySiltLoam = triPoly([
    [27, 50, 23],
    [27, 73, 0],
    [12, 88, 0],
    [12, 80, 8],
    [0, 80, 20],
    [0, 50, 50],
    [12, 50, 38],
  ]);
  const polySilt = triPoly([
    [12, 88, 0],
    [0, 100, 0],
    [0, 80, 20],
    [12, 80, 8],
  ]);
  const polySandyLoam = triPoly([
    [20, 0, 80],
    [20, 28, 52],
    [7, 41, 52],
    [7, 50, 43],
    [0, 50, 50],
    [0, 30, 70],
    [15, 0, 85],
  ]);
  const polyLoamySand = triPoly([
    [15, 0, 85],
    [0, 30, 70],
    [0, 15, 85],
    [10, 0, 90],
  ]);
  const polySand = triPoly([
    [10, 0, 90],
    [0, 15, 85],
    [0, 0, 100],
  ]);

  const buildGuideLinesSVG = (c, k, s) => {
    // 1. Garis melintang (% Liat malar)
    const clayStart = triPointXY(c, 0);
    const clayEnd = triPointXY(c, 100 - c);
    // 2. Garis pepenjuru kanan ke bawah (% Kelodak malar)
    const siltStart = triPointXY(100 - k, k);
    const siltEnd = triPointXY(0, k);
    // 3. Garis pepenjuru kiri ke bawah (% Pasir malar)
    const sandStart = triPointXY(100 - s, 0);
    const sandEnd = triPointXY(0, 100 - s);

    const isSum100 = c + k + s === 100;
    const inter = triPointXY(c, k);

    return `
      <line x1="${clayStart.x.toFixed(1)}" y1="${clayStart.y.toFixed(1)}" x2="${clayEnd.x.toFixed(1)}" y2="${clayEnd.y.toFixed(1)}" stroke="#f87171" stroke-width="2.5" stroke-dasharray="6 4"/>
      <line x1="${siltStart.x.toFixed(1)}" y1="${siltStart.y.toFixed(1)}" x2="${siltEnd.x.toFixed(1)}" y2="${siltEnd.y.toFixed(1)}" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="6 4"/>
      <line x1="${sandStart.x.toFixed(1)}" y1="${sandStart.y.toFixed(1)}" x2="${sandEnd.x.toFixed(1)}" y2="${sandEnd.y.toFixed(1)}" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="6 4"/>
      ${
        isSum100
          ? `
        <circle cx="${inter.x.toFixed(1)}" cy="${inter.y.toFixed(1)}" r="11" fill="#f2b749" fill-opacity="0.28" stroke="#040709" stroke-width="2"/>
        <circle cx="${inter.x.toFixed(1)}" cy="${inter.y.toFixed(1)}" r="5.5" fill="#fef08a" stroke="#040709" stroke-width="2"/>
      `
          : ''
      }
    `;
  };

  const labelLiat = triPointXY(20, 40);
  const labelPasir = triPointXY(3, 5);
  const labelLomPasir = triPointXY(11, 22);
  const labelLomKelodak = triPointXY(14, 65);
  const labelLomLiat = triPointXY(33, 34);
  const labelTanahLiat = triPointXY(55, 22);

  const ticks = [20, 40, 60, 80];
  const tickMarksSVG = ticks
    .map((v) => {
      const lc = triPointXY(v, 0);
      const rk = triPointXY(100 - v, v);
      const bs = triPointXY(0, 100 - v);
      return `
        <text x="${(lc.x - 16).toFixed(1)}" y="${(lc.y + 4).toFixed(1)}" text-anchor="end" fill="#fca5a5" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">${v}</text>
        <text x="${(rk.x + 14).toFixed(1)}" y="${(rk.y + 4).toFixed(1)}" text-anchor="start" fill="#7dd3fc" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">${v}</text>
        <text x="${bs.x.toFixed(1)}" y="${(bs.y + 16).toFixed(1)}" text-anchor="middle" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">${v}</text>
      `;
    })
    .join('');

  setInspectModalWide(true);
  dom.inspectTitle.textContent = 'Analisis Carta Segi Tiga Tekstur Tanah (USDA)';

  const renderTriangleModal = () => {
    const total = guide.clay + guide.silt + guide.sand;
    const isSolved = gameState.puzzles.soilTriangle;

    dom.inspectBody.innerHTML = `
      <div class="soil-tri-layout">
        <div class="soil-tri-clue">
          <span><strong>Petunjuk Sampel Blok B (Nota Rumah Hijau):</strong></span>
          <span class="soil-tri-clue-nums">40% Pasir | 40% Kelodak | 20% Liat</span>
        </div>

        <div class="soil-tri-svg-box">
          <svg viewBox="0 0 520 445" aria-label="Carta Segi Tiga Tekstur Tanah USDA Interaktif">
            <rect width="520" height="445" fill="#0d181e"/>
            <!-- Zon Tekstur Tanah USDA -->
            <g stroke="#040709" stroke-width="1.8">
              <polygon points="${polyClay}" fill="#9b4d4d"/>
              <polygon points="${polySiltyClay}" fill="#7c566d"/>
              <polygon points="${polySandyClay}" fill="#a85c48"/>
              <polygon points="${polyClayLoam}" fill="#8e774f"/>
              <polygon points="${polySiltyClayLoam}" fill="#5e7874"/>
              <polygon points="${polySandyClayLoam}" fill="#9c7e47"/>
              <polygon points="${polyLoam}" fill="#4f825b"/>
              <polygon points="${polySiltLoam}" fill="#487c82"/>
              <polygon points="${polySilt}" fill="#3a6b73"/>
              <polygon points="${polySandyLoam}" fill="#8a8b53"/>
              <polygon points="${polyLoamySand}" fill="#b59d54"/>
              <polygon points="${polySand}" fill="#ceb05a"/>
            </g>

            <!-- Label Zon Utama -->
            <g font-family="Plus Jakarta Sans, sans-serif" font-weight="700" fill="#05080a" text-anchor="middle">
              <text x="${labelTanahLiat.x.toFixed(1)}" y="${labelTanahLiat.y.toFixed(1)}" font-size="11" fill="#f8fafc">Tanah Liat</text>
              <text x="${labelLomLiat.x.toFixed(1)}" y="${labelLomLiat.y.toFixed(1)}" font-size="10" fill="#f8fafc">Lom Berliat</text>
              <text x="${labelLiat.x.toFixed(1)}" y="${(labelLiat.y + 4).toFixed(1)}" font-size="10.5" fill="#fef9c3">Tanah Lom</text>
              <text x="${labelLomKelodak.x.toFixed(1)}" y="${labelLomKelodak.y.toFixed(1)}" font-size="9.5" fill="#f8fafc">Lom Berkelodak</text>
              <text x="${labelLomPasir.x.toFixed(1)}" y="${labelLomPasir.y.toFixed(1)}" font-size="9.5">Lom Berpasir</text>
              <text x="${(labelPasir.x + 12).toFixed(1)}" y="${(labelPasir.y + 4).toFixed(1)}" font-size="9">Pasir</text>
            </g>

            <!-- Sempadan Segitiga & Garis Panduan -->
            <polygon points="${triPoint(100, 0, 0)} ${triPoint(0, 0, 100)} ${triPoint(0, 100, 0)}" fill="none" stroke="#e7dcc3" stroke-width="2.5"/>
            <g id="soil-tri-guides">
              ${buildGuideLinesSVG(guide.clay, guide.silt, guide.sand)}
            </g>

            <!-- Penanda Paksi 20..80 & Tajuk Paksi -->
            ${tickMarksSVG}
            <text x="115" y="206" text-anchor="middle" fill="#fca5a5" font-size="11.5" font-weight="700" transform="rotate(-60 115 206)">% LIAT (CLAY)</text>
            <text x="408" y="206" text-anchor="middle" fill="#7dd3fc" font-size="11.5" font-weight="700" transform="rotate(60 408 206)">% KELODAK (SILT)</text>
            <text x="260" y="428" text-anchor="middle" fill="#fde68a" font-size="11.5" font-weight="700">← % PASIR (SAND)</text>
          </svg>
        </div>

        <div class="soil-tri-controls">
          <div class="soil-slider-card">
            <div class="soil-slider-header">
              <span>Garis Panduan Persilangan</span>
              <span id="soil-total-readout" class="soil-total-readout ${total === 100 ? 'is-valid' : ''}">
                Jumlah: ${total}%${total === 100 ? ' (Tepat)' : ' (Perlu 100%)'}
              </span>
            </div>

            <div class="soil-slider-row">
              <div class="soil-slider-label">
                <span style="color:#fde68a;">% Pasir (Sand)</span>
                <span id="val-sand" class="soil-slider-val" style="color:#fde68a;">${guide.sand}%</span>
              </div>
              <input type="range" id="range-sand" class="soil-range is-sand" min="0" max="100" step="5" value="${guide.sand}"/>
            </div>

            <div class="soil-slider-row">
              <div class="soil-slider-label">
                <span style="color:#7dd3fc;">% Kelodak (Silt)</span>
                <span id="val-silt" class="soil-slider-val" style="color:#7dd3fc;">${guide.silt}%</span>
              </div>
              <input type="range" id="range-silt" class="soil-range is-silt" min="0" max="100" step="5" value="${guide.silt}"/>
            </div>

            <div class="soil-slider-row">
              <div class="soil-slider-label">
                <span style="color:#fca5a5;">% Liat (Clay)</span>
                <span id="val-clay" class="soil-slider-val" style="color:#fca5a5;">${guide.clay}%</span>
              </div>
              <input type="range" id="range-clay" class="soil-range is-clay" min="0" max="100" step="5" value="${guide.clay}"/>
            </div>
          </div>

          <div class="soil-zone-card">
            <p class="soil-zone-title">
              ${
                isSolved
                  ? 'Kod Tekstur Tanah Disahkan: Tanah Lom (Loam)'
                  : 'Pilih Kelas Tekstur Tanah untuk Kod Rak Buku Rahsia:'
              }
            </p>
            <div class="soil-zone-grid">
              ${soilZones
                .map(
                  (z) => `
                <button
                  type="button"
                  class="soil-zone-btn ${isSolved && z.id === 'tanah_lom' ? 'is-solved' : ''}"
                  data-zone="${z.id}"
                >
                  ${z.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    const updateGuides = () => {
      const guidesGroup = document.getElementById('soil-tri-guides');
      const totalReadout = document.getElementById('soil-total-readout');
      if (guidesGroup) {
        guidesGroup.innerHTML = buildGuideLinesSVG(guide.clay, guide.silt, guide.sand);
      }
      const sum = guide.clay + guide.silt + guide.sand;
      if (totalReadout) {
        totalReadout.textContent = `Jumlah: ${sum}%${sum === 100 ? ' (Tepat)' : ' (Perlu 100%)'}`;
        totalReadout.classList.toggle('is-valid', sum === 100);
      }
    };

    const rangeSand = document.getElementById('range-sand');
    const rangeSilt = document.getElementById('range-silt');
    const rangeClay = document.getElementById('range-clay');

    rangeSand.addEventListener('input', () => {
      guide.sand = Number(rangeSand.value);
      document.getElementById('val-sand').textContent = `${guide.sand}%`;
      updateGuides();
    });
    rangeSilt.addEventListener('input', () => {
      guide.silt = Number(rangeSilt.value);
      document.getElementById('val-silt').textContent = `${guide.silt}%`;
      updateGuides();
    });
    rangeClay.addEventListener('input', () => {
      guide.clay = Number(rangeClay.value);
      document.getElementById('val-clay').textContent = `${guide.clay}%`;
      updateGuides();
    });

    dom.inspectBody.querySelectorAll('.soil-zone-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const zone = btn.dataset.zone;
        if (gameState.puzzles.soilTriangle) {
          closeInspectModal();
          return;
        }

        if (zone === 'tanah_lom') {
          gameState.puzzles.soilTriangle = true;
          unlockSecretRoom();
          closeInspectModal();
          addTimeBonus(60, 'tekstur_tanah');
          refreshCurrentRoomScene();

          const secretPanels = [
            {
              visualId: 'bookshelf_open',
              speaker: gameState.playerName,
              speakerType: 'player',
              sfx: 'clang',
              text: 'GRRKKK... Eh?! Rak buku besi ni bergerak! Ada bilik tersembunyi di sebalik dinding makmal?!',
            },
            {
              visualId: 'biovault_glimpse',
              speaker: gameState.playerName,
              speakerType: 'player',
              sfx: 'pickup',
              nextLabel: 'Teruskan ▸',
              text: 'Ini... Bilik Rahsia Makmal Agro Profesor Razak! Mungkin kod akhir pintu keluar ada di dalam peti kebal tu.',
            },
          ];

          triggerCutscene(secretPanels, () => {
            dom.gameScreen.hidden = false;
            dom.gameScreen.classList.add('active');
            refreshCurrentRoomScene();
            showDialogue(
              gameState.playerName,
              'Protokol Tekstur Tanah (Tanah Lom) disahkan (+60 SAAT)! Laluan ke Bilik 5 (Bilik Rahsia Makmal Agro) kini terbuka!'
            );
          });
        } else {
          applyTimePenalty(
            30,
            'tekstur_tanah',
            'Persilangan garis 40% Pasir, 40% Kelodak, dan 20% Liat tidak berada di zon tu. Cuba semak semula pertemuan tiga garis!'
          );
        }
      });
    });
  };

  renderTriangleModal();
  dom.inspectModal.hidden = false;
}

function handleSlideBoxInteraction() {
  if (gameState.flags.slideBoxUnlocked) {
    showDialogue(
      gameState.playerName,
      'Slaid spesimen telah dipasang. Aku boleh terus menganalisis Spesimen X dan Y di bawah Mikroskop Cahaya.'
    );
    openMicroscopePuzzleModal();
    return;
  }

  if (gameState.selectedItemId === 'kunci_slaid' || gameState.selectedItemId === 'slaid_kaca') {
    gameState.flags.slideBoxUnlocked = true;
    removeItemFromInventory('kunci_slaid');
    removeItemFromInventory('slaid_kaca');
    playSFX('pickup');
    refreshCurrentRoomScene();
    showDialogue(
      gameState.playerName,
      'Sempurna! Slaid Kaca Spesimen X dan Spesimen Y telah dipasang pada pentas Mikroskop Cahaya.'
    );
    openMicroscopePuzzleModal();
  } else {
    showDialogue(
      gameState.playerName,
      hasInventoryItem('slaid_kaca')
        ? 'Pentas mikroskop & peti slaid masih kosong. Pilih Slaid Kaca Spesimen daripada inventori di bawah terlebih dahulu untuk memasangnya!'
        : 'Peti slaid botani ni masih kosong. Dapatkan Slaid Kaca Spesimen daripada Peti Alat Mikroskop di Bilik 2 (selepas selesai uji kaji pH S1, S2 & S3).',
      'warning'
    );
  }
}

function openMicroscopePuzzleModal() {
  if (!gameState.flags.slideBoxUnlocked) {
    if (gameState.selectedItemId === 'slaid_kaca') {
      gameState.flags.slideBoxUnlocked = true;
      removeItemFromInventory('slaid_kaca');
      playSFX('pickup');
      refreshCurrentRoomScene();
    } else {
      showDialogue(
        gameState.playerName,
        hasInventoryItem('slaid_kaca')
          ? 'Pentas mikroskop masih kosong! Pilih Slaid Kaca Spesimen daripada inventori di bawah terlebih dahulu sebelum klik mikroskop.'
          : 'Mikroskop cahaya ni sedia digunakan, tapi pentasnya kosong. Kumpul Slaid Kaca Spesimen daripada Peti Alat Mikroskop di Bilik 2 dahulu.',
        'warning'
      );
      return;
    }
  }

  let activeSlide = 'X';
  const answers = {
    xClass: gameState.puzzles.microscope ? 'monokot' : '',
    xCot: gameState.puzzles.microscope ? '1' : '',
    yClass: gameState.puzzles.microscope ? 'dikot' : '',
    yCot: gameState.puzzles.microscope ? '2' : '',
  };

  const getSpecimenOcularSVG = (slide) => {
    if (slide === 'X') {
      // Keratan Rentas Batang Monokotiledon: Berkas Vaskular Tersebar
      const bundles = [
        [120, 70], [82, 85], [158, 86], [62, 120], [108, 114],
        [144, 124], [178, 122], [78, 156], [122, 152], [160, 158],
        [102, 178], [140, 176], [120, 128],
      ];
      return `
        <svg viewBox="0 0 240 240" aria-label="Keratan rentas batang Spesimen X di bawah mikroskop">
          <circle cx="120" cy="120" r="96" fill="#d9efd8" stroke="#1b4652" stroke-width="5"/>
          <circle cx="120" cy="120" r="88" fill="#c3e3be" stroke="#2d6a4f" stroke-width="2.5"/>
          ${bundles
            .map(
              ([cx, cy]) => `
            <g transform="translate(${cx}, ${cy})">
              <ellipse cx="0" cy="0" rx="8.5" ry="10.5" fill="#1b4332" stroke="#081c15" stroke-width="1.5"/>
              <circle cx="-2.5" cy="2" r="2.6" fill="#d97706"/>
              <circle cx="2.5" cy="2" r="2.6" fill="#d97706"/>
              <circle cx="0" cy="-3.5" r="3" fill="#52b788"/>
            </g>
          `
            )
            .join('')}
          <line x1="120" y1="8" x2="120" y2="232" stroke="#05080a" stroke-opacity="0.2" stroke-width="1.5"/>
          <line x1="8" y1="120" x2="232" y2="120" stroke="#05080a" stroke-opacity="0.2" stroke-width="1.5"/>
        </svg>
      `;
    }

    // Keratan Rentas Batang Dikotiledon: Berkas Vaskular Tersusun dalam Gelang
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    const ringBundles = angles
      .map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 120 + Math.cos(rad) * 62;
        const cy = 120 + Math.sin(rad) * 62;
        return `
          <g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${deg + 90})">
            <path d="M-9,10 L9,10 L6,-12 L-6,-12 Z" fill="#1b4332" stroke="#081c15" stroke-width="1.5"/>
            <ellipse cx="0" cy="-6" rx="5.5" ry="4" fill="#52b788"/>
            <circle cx="-2.5" cy="4" r="2.5" fill="#d97706"/>
            <circle cx="2.5" cy="4" r="2.5" fill="#d97706"/>
          </g>
        `;
      })
      .join('');

    return `
      <svg viewBox="0 0 240 240" aria-label="Keratan rentas batang Spesimen Y di bawah mikroskop">
        <circle cx="120" cy="120" r="96" fill="#e9f2cf" stroke="#3f6212" stroke-width="5"/>
        <circle cx="120" cy="120" r="85" fill="#d7e8b3" stroke="#4d7c0f" stroke-width="2"/>
        <!-- Empulur Tengah (Pith) & Gelang Kambium -->
        <circle cx="120" cy="120" r="62" fill="none" stroke="#1b4332" stroke-width="2" stroke-dasharray="5 3"/>
        <circle cx="120" cy="120" r="42" fill="#f3f7dc" stroke="#65a30d" stroke-width="1.5"/>
        ${ringBundles}
        <line x1="120" y1="8" x2="120" y2="232" stroke="#05080a" stroke-opacity="0.2" stroke-width="1.5"/>
        <line x1="8" y1="120" x2="232" y2="120" stroke="#05080a" stroke-opacity="0.2" stroke-width="1.5"/>
      </svg>
    `;
  };

  setInspectModalWide(true);
  dom.inspectTitle.textContent = 'Mikroskop Cahaya: Analisis Anatomi Batang (Monokot vs Dikot)';

  const renderMicroscopeModal = () => {
    const solved = gameState.puzzles.microscope;
    const traitInfo =
      activeSlide === 'X'
        ? '<strong>Spesimen X (100×):</strong> Berkas vaskular <u>tersebar</u> rawak dalam tisu asas. Ciri lapangan: urat daun selari &amp; akar serabut.'
        : '<strong>Spesimen Y (100×):</strong> Berkas vaskular <u>tersusun dalam satu gelang</u> mengelilingi empulur. Ciri lapangan: urat daun jejala &amp; akar tunjang.';

    dom.inspectBody.innerHTML = `
      <div class="micro-layout">
        <div class="micro-viewer-col">
          <div class="micro-slide-tabs">
            <button type="button" class="micro-slide-tab ${activeSlide === 'X' ? 'active' : ''}" data-slide="X">
              Slaid Spesimen X
            </button>
            <button type="button" class="micro-slide-tab ${activeSlide === 'Y' ? 'active' : ''}" data-slide="Y">
              Slaid Spesimen Y
            </button>
          </div>

          <div class="micro-ocular-wrap">
            <div class="micro-ocular-lens">
              ${getSpecimenOcularSVG(activeSlide)}
            </div>
            <div class="micro-traits-strip">${traitInfo}</div>
          </div>
        </div>

        <div class="micro-quiz-col">
          <div class="micro-spec-card">
            <h3 class="micro-spec-title">Pengesahan Spesimen X</h3>
            <div>
              <div class="micro-field-label">Kelas Tumbuhan</div>
              <div class="micro-choice-row">
                <button type="button" class="micro-choice-btn ${answers.xClass === 'monokot' ? 'selected' : ''}" data-key="xClass" data-val="monokot" ${solved ? 'disabled' : ''}>Monokotiledon</button>
                <button type="button" class="micro-choice-btn ${answers.xClass === 'dikot' ? 'selected' : ''}" data-key="xClass" data-val="dikot" ${solved ? 'disabled' : ''}>Dikotiledon</button>
              </div>
            </div>
            <div>
              <div class="micro-field-label">Bilangan Kotiledon</div>
              <div class="micro-choice-row">
                <button type="button" class="micro-choice-btn ${answers.xCot === '1' ? 'selected' : ''}" data-key="xCot" data-val="1" ${solved ? 'disabled' : ''}>1 Kotiledon</button>
                <button type="button" class="micro-choice-btn ${answers.xCot === '2' ? 'selected' : ''}" data-key="xCot" data-val="2" ${solved ? 'disabled' : ''}>2 Kotiledon</button>
              </div>
            </div>
          </div>

          <div class="micro-spec-card">
            <h3 class="micro-spec-title">Pengesahan Spesimen Y</h3>
            <div>
              <div class="micro-field-label">Kelas Tumbuhan</div>
              <div class="micro-choice-row">
                <button type="button" class="micro-choice-btn ${answers.yClass === 'monokot' ? 'selected' : ''}" data-key="yClass" data-val="monokot" ${solved ? 'disabled' : ''}>Monokotiledon</button>
                <button type="button" class="micro-choice-btn ${answers.yClass === 'dikot' ? 'selected' : ''}" data-key="yClass" data-val="dikot" ${solved ? 'disabled' : ''}>Dikotiledon</button>
              </div>
            </div>
            <div>
              <div class="micro-field-label">Bilangan Kotiledon</div>
              <div class="micro-choice-row">
                <button type="button" class="micro-choice-btn ${answers.yCot === '1' ? 'selected' : ''}" data-key="yCot" data-val="1" ${solved ? 'disabled' : ''}>1 Kotiledon</button>
                <button type="button" class="micro-choice-btn ${answers.yCot === '2' ? 'selected' : ''}" data-key="yCot" data-val="2" ${solved ? 'disabled' : ''}>2 Kotiledon</button>
              </div>
            </div>
          </div>

          ${
            solved
              ? `
            <div class="inspect-clue-box" style="margin-bottom:0;">
              <strong>Analisis Mikroskop Disahkan!</strong> Pintu kaca <strong>Peti Spesimen &amp; Alatan</strong> di sebelah kanan kini terbuka. Tutup paparan ini dan klik <strong>Pemutar Skru Berpenebat</strong> di dalam peti tersebut untuk mengutipnya!
            </div>
          `
              : `
            <button type="button" id="btn-submit-microscope" class="btn-primary btn-full">
              SAHKAN ANALISIS MIKROSKOP
            </button>
          `
          }
        </div>
      </div>
    `;

    dom.inspectBody.querySelectorAll('.micro-slide-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        playSFX('click');
        activeSlide = btn.dataset.slide;
        renderMicroscopeModal();
      });
    });

    dom.inspectBody.querySelectorAll('.micro-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (gameState.puzzles.microscope) return;
        playSFX('click');
        answers[btn.dataset.key] = btn.dataset.val;
        renderMicroscopeModal();
      });
    });

    const submitBtn = document.getElementById('btn-submit-microscope');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (!answers.xClass || !answers.xCot || !answers.yClass || !answers.yCot) {
          showDialogue(
            gameState.playerName,
            'Aku kena lengkapkan pilihan kelas tumbuhan dan bilangan kotiledon bagi kedua-dua Spesimen X dan Y sebelum mengesahkan!',
            'warning'
          );
          return;
        }

        const isCorrect =
          answers.xClass === 'monokot' &&
          answers.xCot === '1' &&
          answers.yClass === 'dikot' &&
          answers.yCot === '2';

        if (isCorrect) {
          gameState.puzzles.microscope = true;
          playSFX('pickup');
          addTimeBonus(60, 'anatomi_tumbuhan');
          refreshCurrentRoomScene();
          renderMicroscopeModal();
          showDialogue(
            gameState.playerName,
            'Tepat sekali! Monokot (1 kotiledon) & Dikot (2 kotiledon) disahkan (+60 SAAT!). Klik! Pintu kaca Peti Spesimen & Alatan di sebelah kanan terbuka—ambil Pemutar Skru Berpenebat di dalamnya!'
          );
        } else {
          applyTimePenalty(
            30,
            'anatomi_tumbuhan',
            'Analisis anatomi kurang tepat! Perhatikan susunan berkas vaskular tersebar vs gelang dan semak Buku Nota Kuliah.'
          );
        }
      });
    }
  };

  renderMicroscopeModal();
  dom.inspectModal.hidden = false;
}

// ============================================================================
// 8D. LOGIK TEKA-TEKI BAHAGIAN 4 (TAKSONOMI BUAH VIEW 5 & KOTAK FIUS EC VIEW 1)
// ============================================================================

function getFruitPlaqueIconSVG(fruitKey) {
  switch (fruitKey) {
    case 'durian':
      return `<svg viewBox="0 0 40 40" width="32" height="32"><ellipse cx="20" cy="22" rx="11" ry="13" fill="#84a93c" stroke="#040709" stroke-width="2"/><path d="M9 17 L5 14 M8 24 L4 24 M31 17 L35 14 M32 24 L36 24 M20 9 L20 5" stroke="#040709" stroke-width="2" stroke-linecap="round"/><path d="M20 9 Q28 4 30 10 Q25 14 20 11 Z" fill="#2ea877" stroke="#040709" stroke-width="1.5"/></svg>`;
    case 'mangga':
      return `<svg viewBox="0 0 40 40" width="32" height="32"><path d="M19 9 C27 9 31 19 28 28 C25 35 14 35 12 28 C10 21 13 9 19 9 Z" fill="#f2b749" stroke="#040709" stroke-width="2"/><path d="M20 9 Q28 4 31 11 Q25 15 20 11 Z" fill="#2ea877" stroke="#040709" stroke-width="1.5"/></svg>`;
    case 'rambutan':
      return `<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="21" r="10" fill="#dc3545" stroke="#040709" stroke-width="2"/><path d="M10 16 L5 13 M9 23 L4 24 M14 30 L11 35 M30 16 L35 13 M31 23 L36 24 M26 30 L29 35 M20 11 L20 6" stroke="#84cc16" stroke-width="2" stroke-linecap="round"/></svg>`;
    case 'nangka':
    default:
      return `<svg viewBox="0 0 40 40" width="32" height="32"><ellipse cx="20" cy="22" rx="10.5" ry="13" fill="#a3a832" stroke="#040709" stroke-width="2"/><path d="M16 16 L19 16 M22 20 L25 20 M15 25 L18 25 M21 29 L24 29" stroke="#3f4614" stroke-width="1.8" stroke-linecap="round"/><path d="M20 9 Q28 4 30 10 Q25 14 20 11 Z" fill="#2ea877" stroke="#040709" stroke-width="1.5"/></svg>`;
  }
}

function openFruitTaxonomyModal() {
  const fruits = [
    { key: 'durian', label: 'Durian', target: 'Durio zibethinus' },
    { key: 'mangga', label: 'Mangga', target: 'Mangifera indica' },
    { key: 'rambutan', label: 'Rambutan', target: 'Nephelium lappaceum' },
    { key: 'nangka', label: 'Nangka', target: 'Artocarpus heterophyllus' },
  ];

  const scientificOptions = [
    'Artocarpus heterophyllus',
    'Carica papaya',
    'Durio zibethinus',
    'Mangifera indica',
    'Musa acuminata',
    'Nephelium lappaceum',
    'Artocarpus integer',
  ];

  let selectedFruitKey = 'durian';
  const pairings = gameState.puzzles.bioVault
    ? {
        durian: 'Durio zibethinus',
        mangga: 'Mangifera indica',
        rambutan: 'Nephelium lappaceum',
        nangka: 'Artocarpus heterophyllus',
      }
    : {
        durian: '',
        mangga: '',
        rambutan: '',
        nangka: '',
      };

  setInspectModalWide(true);
  dom.inspectTitle.textContent = 'Padanan Taksonomi Pokok Buah-Buahan (Bio-Vault)';

  const renderTaxonomyModal = () => {
    const solved = gameState.puzzles.bioVault;
    const activeFruit = fruits.find((f) => f.key === selectedFruitKey) || fruits[0];

    dom.inspectBody.innerHTML = `
      <div class="inspect-clue-box" style="margin-bottom:14px;">
        ${
          solved
            ? '<strong>Kunci Taksonomi Disahkan!</strong> Pintu <strong>Peti Kebal Fius Utama</strong> kini terbuka. Tutup paparan ini dan klik <strong>Fius Utama 30A</strong> serta <strong>Nota Lekat Prof. Razak</strong> di dalam peti kebal untuk mengutipnya!'
            : `Pilih pokok buah di sebelah kiri, kemudian klik nama saintifik binomial yang sepadan di sebelah kanan. <strong>Aktif sekarang: ${activeFruit.label}</strong>.`
        }
      </div>

      <div class="taxo-layout">
        <div>
          <p class="taxo-col-title">1. Spesimen Pokok Buah (Pilih)</p>
          <div class="taxo-fruit-list">
            ${fruits
              .map((f) => {
                const assigned = pairings[f.key];
                const isActive = !solved && selectedFruitKey === f.key;
                return `
                  <button
                    type="button"
                    class="taxo-fruit-btn ${isActive ? 'active' : ''} ${assigned ? 'paired' : ''}"
                    data-fruit="${f.key}"
                    ${solved ? 'disabled' : ''}
                  >
                    <span class="taxo-fruit-icon">${getFruitPlaqueIconSVG(f.key)}</span>
                    <span class="taxo-fruit-meta">
                      <span class="taxo-fruit-name">${f.label}</span>
                      <span class="taxo-fruit-assigned ${assigned ? '' : 'is-empty'}">
                        ${assigned ? `<em>${assigned}</em>` : 'Belum dipadankan'}
                      </span>
                    </span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>

        <div>
          <p class="taxo-col-title">2. Nama Saintifik Binomial (Klik untuk Padan)</p>
          <div class="taxo-sci-list">
            ${scientificOptions
              .map((sci) => {
                const usedBy = fruits.find((f) => pairings[f.key] === sci);
                return `
                  <button
                    type="button"
                    class="taxo-sci-btn ${usedBy ? 'used' : ''}"
                    data-sci="${sci}"
                    ${solved ? 'disabled' : ''}
                  >
                    <span><em>${sci}</em></span>
                    <span class="taxo-sci-tag">${usedBy ? usedBy.label : 'Pilih'}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>

      <div class="pin-actions" style="margin-top:18px;">
        ${
          solved
            ? '<button type="button" id="btn-taxo-done" class="btn-primary">Tutup Peti Kebal</button>'
            : '<button type="button" id="btn-submit-taxonomy" class="btn-primary">SAHKAN PADANAN TAKSONOMI</button>'
        }
      </div>
    `;

    dom.inspectBody.querySelectorAll('.taxo-fruit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (gameState.puzzles.bioVault) return;
        playSFX('click');
        selectedFruitKey = btn.dataset.fruit;
        renderTaxonomyModal();
      });
    });

    dom.inspectBody.querySelectorAll('.taxo-sci-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (gameState.puzzles.bioVault) return;
        playSFX('click');
        const sci = btn.dataset.sci;
        // Kosongkan mana-mana buah lain yang menggunakan nama saintifik sama
        Object.keys(pairings).forEach((k) => {
          if (pairings[k] === sci) pairings[k] = '';
        });
        pairings[selectedFruitKey] = sci;
        // Majukan pilihan aktif ke buah seterusnya yang belum dipadankan
        const nextUnpaired = fruits.find((f) => !pairings[f.key]);
        if (nextUnpaired) {
          selectedFruitKey = nextUnpaired.key;
        }
        renderTaxonomyModal();
      });
    });

    const doneBtn = document.getElementById('btn-taxo-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        playSFX('click');
        closeInspectModal();
      });
    }

    const submitBtn = document.getElementById('btn-submit-taxonomy');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const allPaired = fruits.every((f) => Boolean(pairings[f.key]));
        if (!allPaired) {
          showDialogue(
            gameState.playerName,
            'Aku kena padankan keempat-empat pokok buah (Durian, Mangga, Rambutan, Nangka) dengan nama saintifiknya sebelum mengesahkan!',
            'warning'
          );
          return;
        }

        const allCorrect = fruits.every((f) => pairings[f.key] === f.target);
        if (allCorrect) {
          gameState.puzzles.bioVault = true;
          playSFX('pickup');

          addTimeBonus(60, 'nama_saintifik');
          refreshCurrentRoomScene();
          renderTaxonomyModal();
          showDialogue(
            gameState.playerName,
            'Peti Kebal Fius Utama terbuka! (+60 SAAT!) Kelihatan Fius Utama 30A dan Nota Lekat Prof. Razak di dalamnya—klik kedua-duanya untuk kutip ke inventori!'
          );
        } else {
          applyTimePenalty(
            30,
            'nama_saintifik',
            'Padanan nama saintifik tak tepat! Semak semula Nota Kuliah Taksonomi Buah atau perhatikan ciri genus setiap buah tropika.'
          );
        }
      });
    }
  };

  renderTaxonomyModal();
  dom.inspectModal.hidden = false;
}

function handleFuseBoxInteraction() {
  if (gameState.puzzles.controlPanel) {
    showDialogue(
      gameState.playerName,
      'Pengawal EC pintu keluar telah dilaraskan tepat pada 1.8 mS/cm dan pintu utama sudah pun dibuka!'
    );
    return;
  }

  // Langkah A: Buka skru penutup kotak fius dengan Pemutar Skru Berpenebat
  if (!gameState.flags.fusePanelOpened) {
    if (gameState.selectedItemId === 'pemutar_skru') {
      gameState.flags.fusePanelOpened = true;
      removeItemFromInventory('pemutar_skru');
      playSFX('pickup');
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Penutup kotak fius berjaya dibuka! Eh, soket Fius Utama 30A kat dalam ni kosong—aku kena pasang fius dari Bilik Rahsia Bio-Vault.'
      );
    } else {
      showDialogue(
        gameState.playerName,
        hasInventoryItem('pemutar_skru')
          ? 'Penutup kotak fius ni dikunci ketat dengan skru keselamatan. Pilih Pemutar Skru Berpenebat daripada inventori di bawah terlebih dahulu!'
          : 'Penutup kotak fius ni dikunci ketat dengan skru keselamatan. Aku perlukan pemutar skru.',
        'warning'
      );
    }
    return;
  }

  // Langkah B: Pasang Fius Utama 30A ke dalam soket
  if (!gameState.flags.mainFuseInstalled) {
    if (gameState.selectedItemId === 'fius_utama') {
      gameState.flags.mainFuseInstalled = true;
      removeItemFromInventory('fius_utama');
      playSFX('pickup');
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Bzzzt... Fius Utama 30A terpasang! Skrin Pengawal EC digital baru menyala—sekarang aku kena tetapkan bacaan EC yang betul!'
      );
      openEcCalibrationModal();
    } else {
      showDialogue(
        gameState.playerName,
        hasInventoryItem('fius_utama')
          ? 'Soket fius utama masih kosong! Pilih Fius Utama 30A daripada inventori di bawah terlebih dahulu sebelum memasangnya.'
          : 'Soket fius utama kat dalam ni masih kosong! Dapatkan Fius Utama 30A daripada Peti Kebal di Bilik 5 (Bio-Vault).',
        'warning'
      );
    }
    return;
  }

  // Langkah C: Pengawal EC sudah berkuasa — buka modal penentukuran EC
  openEcCalibrationModal();
}

function openEcCalibrationModal() {
  if (!gameState.flags.mainFuseInstalled) {
    handleFuseBoxInteraction();
    return;
  }

  let currentEc = Number(gameState.flags.ecValue ?? 0.5);

  setInspectModalWide(false);
  dom.inspectTitle.textContent = 'Penentukuran Pengawal EC Pintu Keluar (Kotak Fius)';

  const renderEcModal = () => {
    const solved = gameState.puzzles.controlPanel;
    const ecStr = currentEc.toFixed(1);

    dom.inspectBody.innerHTML = `
      <div class="ec-panel">
        <div class="ec-screen">
          <div>
            <div style="font-size:0.76rem;color:var(--text-secondary);font-weight:700;">PENGAWAL KEBERALIRAN ELEKTRIK (EC)</div>
            <div style="font-size:0.94rem;font-weight:700;color:var(--text-primary);margin-top:2px;">
              Sistem Kunci Magnetik Pintu Utama
            </div>
            <div style="font-size:0.78rem;color:var(--text-secondary);">
              Julat pelarasan: 0.0 – 3.0 mS/cm
            </div>
          </div>
          <div class="ec-readout" id="ec-readout">${ecStr} mS/cm</div>
        </div>

        <div class="ec-dial-controls">
          <div class="soil-slider-header">
            <span>Laraskan Tombol Penentukuran EC</span>
            <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--accent-amber);">Langkah: 0.1 mS/cm</span>
          </div>

          <div class="ec-step-row">
            <button type="button" id="btn-ec-minus" class="ec-step-btn" ${solved ? 'disabled' : ''}>-0.1</button>
            <input
              type="range"
              id="range-ec"
              class="soil-range is-silt"
              min="0.0"
              max="3.0"
              step="0.1"
              value="${ecStr}"
              style="flex:1;"
              ${solved ? 'disabled' : ''}
            />
            <button type="button" id="btn-ec-plus" class="ec-step-btn" ${solved ? 'disabled' : ''}>+0.1</button>
          </div>
        </div>

        <div class="inspect-clue-box" style="margin-bottom:0;">
          ${
            solved
              ? '<strong>Sistem Penguncian Dinyahaktifkan!</strong> Bacaan <strong>1.8 mS/cm</strong> disahkan stabil.'
              : 'Petunjuk: Semak <strong>Nota Lekat Prof. Razak</strong> dalam inventori anda untuk nilai sasaran EC yang tepat bagi nyahaktifkan kunci magnetik.'
          }
        </div>

        <div class="pin-actions">
          <button type="button" class="btn-secondary" id="btn-ec-close">Tutup</button>
          ${
            solved
              ? ''
              : '<button type="button" class="btn-primary" id="btn-ec-confirm">SAHKAN BACAAN EC</button>'
          }
        </div>
      </div>
    `;

    const rangeEl = document.getElementById('range-ec');
    const readoutEl = document.getElementById('ec-readout');
    const minusBtn = document.getElementById('btn-ec-minus');
    const plusBtn = document.getElementById('btn-ec-plus');

    const syncEcUI = (val) => {
      currentEc = Math.round(Math.max(0, Math.min(3.0, val)) * 10) / 10;
      gameState.flags.ecValue = currentEc;
      if (rangeEl) rangeEl.value = currentEc.toFixed(1);
      if (readoutEl) readoutEl.textContent = `${currentEc.toFixed(1)} mS/cm`;
    };

    if (rangeEl) {
      rangeEl.addEventListener('input', () => {
        syncEcUI(Number(rangeEl.value));
      });
    }
    if (minusBtn) {
      minusBtn.addEventListener('click', () => {
        playSFX('click');
        syncEcUI(currentEc - 0.1);
      });
    }
    if (plusBtn) {
      plusBtn.addEventListener('click', () => {
        playSFX('click');
        syncEcUI(currentEc + 0.1);
      });
    }

    document.getElementById('btn-ec-close').addEventListener('click', () => {
      playSFX('click');
      closeInspectModal();
    });

    const confirmBtn = document.getElementById('btn-ec-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (currentEc.toFixed(1) === '1.8') {
          gameState.puzzles.controlPanel = true;
          stopCountdownTimer();
          closeInspectModal();
          refreshCurrentRoomScene();

          const victoryPanels = buildVictoryCutscene(gameState.playerName);
          triggerCutscene(victoryPanels, () => {
            completeGame();
          });
        } else {
          applyTimePenalty(
            30,
            'panel_ec',
            'Bacaan EC tidak stabil! Rujuk semula nota lekat Profesor Razak.'
          );
        }
      });
    }
  };

  renderEcModal();
  dom.inspectModal.hidden = false;
}

function handleHotspotClick(hotspotId) {
  playSFX('click');

  if (hotspotId === 'v1_secret_hatch') {
    if (gameState.secretRoomUnlocked) {
      navigateToRoom('view5');
    } else {
      showDialogue(gameState.playerName, 'Terkunci...', 'normal');
    }
    return;
  }

  // --- VIEW 1: KUTIPAN KUNCI TEMBAGA KECIL & INTERAKSI PINTU ---
  if (hotspotId === 'v1_copper_key' && !gameState.flags.pickedCopperKey) {
    gameState.flags.pickedCopperKey = true;
    addItemToInventory({
      id: 'kunci_tembaga',
      name: 'Kunci Tembaga Kecil',
      icon: '🔑',
      description: 'Kunci tembaga kecil yang ditemui di bucu meja sisi berhampiran pintu keluar.',
    });
    refreshCurrentRoomScene();
    showDialogue(
      gameState.playerName,
      'Eh, ada kunci tembaga kecil kat tepi meja ni. Mungkin kunci laci dekat ruang rumah hijau?'
    );
    return;
  }

  // --- VIEW 4: TEKA-TEKI 1 (NPK RUMAH HIJAU) ---
  if (hotspotId === 'v4_pot_a') {
    handleNpkPotInteraction('A');
    return;
  }
  if (hotspotId === 'v4_pot_b') {
    handleNpkPotInteraction('B');
    return;
  }
  if (hotspotId === 'v4_pot_c') {
    handleNpkPotInteraction('C');
    return;
  }
  if (hotspotId === 'v4_tool_drawer') {
    handleNpkDrawerInteraction();
    return;
  }
  if (hotspotId === 'v4_item_baja_n' && gameState.flags.npkDrawerUnlocked && !gameState.flags.pickedBajaN) {
    if (
      addItemToInventory({
        id: 'baja_n',
        name: 'Baja Cecair Nitrogen (N)',
        icon: '🧪',
        description: '',
      })
    ) {
      gameState.flags.pickedBajaN = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Baja Cecair Nitrogen (N) diambil! Pilih botol ini daripada inventori untuk merawat anak benih yang kekurangan N.'
      );
    }
    return;
  }
  if (hotspotId === 'v4_item_baja_p' && gameState.flags.npkDrawerUnlocked && !gameState.flags.pickedBajaP) {
    if (
      addItemToInventory({
        id: 'baja_p',
        name: 'Baja Cecair Fosforus (P)',
        icon: '🧪',
        description: '',
      })
    ) {
      gameState.flags.pickedBajaP = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Baja Cecair Fosforus (P) diambil! Pilih botol ini daripada inventori untuk merawat anak benih yang kekurangan P.'
      );
    }
    return;
  }
  if (hotspotId === 'v4_item_baja_k' && gameState.flags.npkDrawerUnlocked && !gameState.flags.pickedBajaK) {
    if (
      addItemToInventory({
        id: 'baja_k',
        name: 'Baja Cecair Kalium (K)',
        icon: '🧪',
        description: '',
      })
    ) {
      gameState.flags.pickedBajaK = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Baja Cecair Kalium (K) diambil! Pilih botol ini daripada inventori untuk merawat anak benih yang kekurangan K.'
      );
    }
    return;
  }
  if (hotspotId === 'v4_soil_note') {
    if (!gameState.puzzles.greenhouseRack) {
      showDialogue(
        gameState.playerName,
        'Dulang automatik ni terkunci. Pengesan biologi kat tepi tu menunjukkan ketiga-tiga anak benih mesti dipulihkan dahulu.'
      );
      return;
    }
    if (!gameState.flags.pickedSoilNote) {
      if (
        addItemToInventory({
          id: 'nota_tanah',
          name: 'Nota Sampel Tanah',
          icon: '📄',
          description: 'Rekod Sampel Blok B: 40% Pasir, 40% Kelodak, 20% Liat.',
        })
      ) {
        gameState.flags.pickedSoilNote = true;
        refreshCurrentRoomScene();
      } else {
        return;
      }
    }
    showDialogue(
      gameState.playerName,
      'Rekod Sampel Blok B: 40% Pasir, 40% Kelodak, 20% Liat. Aku simpan nota ni—boleh klik dalam inventori untuk baca semula bila-bila masa!'
    );
    openClueNoteModal('nota_tanah');
    return;
  }

  // --- VIEW 2: TEKA-TEKI 2 (pH TANAH & PENGAPURAN) ---
  if (hotspotId === 'v2_beaker_1') {
    showDialogue(gameState.playerName, 'Aku celupkan prob Meter pH Digital ke dalam bikar Sampel 1: Tanah Gambut...');
    openSoilPhWorkbench('s1');
    return;
  }
  if (hotspotId === 'v2_beaker_2') {
    showDialogue(gameState.playerName, 'Aku celupkan prob Meter pH Digital ke dalam bikar Sampel 2: Tanah Aluvium...');
    openSoilPhWorkbench('s2');
    return;
  }
  if (hotspotId === 'v2_beaker_3') {
    showDialogue(gameState.playerName, 'Aku celupkan prob Meter pH Digital ke dalam bikar Sampel 3: Tanah Berkapur...');
    openSoilPhWorkbench('s3');
    return;
  }
  if (hotspotId === 'v2_ph_meter') {
    showDialogue(gameState.playerName, 'Meter pH digital ni sedia menguji ketiga-tiga bikar sampel tanah dan memantau proses pengapuran.');
    openSoilPhWorkbench();
    return;
  }
  if (hotspotId === 'v2_soil_cabinet') {
    if (gameState.puzzles.phSolved || gameState.puzzles.soilCabinet) {
      showDialogue(
        gameState.playerName,
        'Kabinet Sampel Tanah dah disahkan selepas kesemua 3 sampel tanah (S1, S2 & S3) distabilkan ke ~pH 6.2. Semak Peti Alat Mikroskop di atas meja!'
      );
      openInspectModal(
        'Kabinet Sampel Tanah (Disahkan)',
        'Uji kaji pH &amp; pengapuran bagi ketiga-tiga sampel (S1, S2 &amp; S3) telah disahkan pada <strong>~pH 6.2 (Optimum)</strong>. <strong>Peti Alat Mikroskop</strong> di atas meja kerja kini terbuka!'
      );
    } else {
      showDialogue(
        gameState.playerName,
        'Kabinet ni ada kunci pengesan pH. Aku kena uji dan rawat kesemua 3 sampel tanah (S1, S2 & S3) di meja kerja ke julat optimum!'
      );
      openSoilPhWorkbench();
    }
    return;
  }

  if (hotspotId === 'v2_tool_case') {
    const caseOpen = Boolean(gameState.puzzles.phSolved || gameState.puzzles.soilCabinet);
    if (!caseOpen) {
      showDialogue(
        gameState.playerName,
        'Peti Alat Mikroskop ni berkunci secara elektronik. Aku kena uji dan rawat kesemua 3 sampel tanah (S1, S2 & S3) di Meter pH dahulu!',
        'warning'
      );
    } else if (gameState.flags.pickedMagnifier && gameState.flags.pickedGlassSlide) {
      showDialogue(
        gameState.playerName,
        'Peti Alat Mikroskop ni dah kosong—Kanta Pembesar dan Slaid Kaca Spesimen dah aku kutip.'
      );
    } else {
      showDialogue(
        gameState.playerName,
        'Penutup Peti Alat Mikroskop dah terbuka! Klik Kanta Pembesar atau Slaid Kaca Spesimen di dalamnya untuk kutip masuk inventori.'
      );
    }
    return;
  }

  if (
    hotspotId === 'v2_item_magnifier' &&
    (gameState.puzzles.phSolved || gameState.puzzles.soilCabinet) &&
    !gameState.flags.pickedMagnifier
  ) {
    if (
      addItemToInventory({
        id: 'kanta_pembesar',
        name: 'Kanta Pembesar',
        icon: '🔍',
        description: 'Kanta pembesar lapangan untuk membaca skala halus Carta Segitiga Tekstur Tanah USDA.',
      })
    ) {
      gameState.flags.pickedMagnifier = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Kanta Pembesar dikutip! Pilih Kanta Pembesar daripada inventori untuk membaca Carta Segitiga Tekstur Tanah USDA di dinding.'
      );
    }
    return;
  }

  if (
    hotspotId === 'v2_item_slides' &&
    (gameState.puzzles.phSolved || gameState.puzzles.soilCabinet) &&
    !gameState.flags.pickedGlassSlide
  ) {
    if (
      addItemToInventory({
        id: 'slaid_kaca',
        name: 'Slaid Kaca Spesimen',
        icon: '🔬',
        description: 'Set slaid kaca keratan rentas batang monokotiledon & dikotiledon untuk Mikroskop Cahaya di Bilik 3.',
      })
    ) {
      gameState.flags.pickedGlassSlide = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Slaid Kaca Spesimen dikutip! Pilih slaid ni daripada inventori apabila hendak memasangnya pada Mikroskop Cahaya di Bilik 3.'
      );
    }
    return;
  }

  // --- VIEW 2: TEKA-TEKI 3 (SEGI TIGA TEKSTUR TANAH USDA & BILIK RAHSIA) ---
  if (hotspotId === 'v2_soil_chart') {
    openSoilTriangleModal();
    return;
  }

  if (hotspotId === 'v2_secret_bookshelf') {
    showDialogue(
      gameState.playerName,
      'Rak buku keluli ni berat luar biasa—ada panel pengimbas kod tekstur tanah kat tepi tu. Mungkin terbuka kalau aku masukkan jenis tanah yang tepat dari Carta USDA.'
    );
    openInspectModal(
      'Rak Buku Rahsia (Kunci Kod Tanah)',
      'Panel kunci mekanikal ini bersambung dengan <strong>Carta Segitiga Tekstur Tanah USDA</strong>. Dapatkan peratusan sampel tanah dan pilih Kanta Pembesar daripada inventori untuk membaca carta.'
    );
    return;
  }

  if (hotspotId === 'v2_secret_doorway') {
    navigateToRoom('view5');
    return;
  }

  // --- VIEW 3: TEKA-TEKI 4 (MIKROSKOP CAHAYA & ANATOMI TUMBUHAN) ---
  if (hotspotId === 'v3_slide_box') {
    handleSlideBoxInteraction();
    return;
  }

  if (hotspotId === 'v3_microscope') {
    openMicroscopePuzzleModal();
    return;
  }

  if (hotspotId === 'v3_tool_cabinet') {
    if (!gameState.puzzles.microscope) {
      showDialogue(
        gameState.playerName,
        'Pintu kaca Peti Spesimen & Alatan ni terkunci secara automatik. Aku kena selesaikan analisis Spesimen X dan Y pada Mikroskop Cahaya dahulu!',
        'warning'
      );
    } else if (gameState.flags.pickedScrewdriver) {
      showDialogue(
        gameState.playerName,
        'Peti Spesimen & Alatan dah dibuka dan Pemutar Skru Berpenebat sudah diambil.'
      );
    } else {
      showDialogue(
        gameState.playerName,
        'Pintu kaca Peti Spesimen & Alatan dah terbuka! Klik Pemutar Skru Berpenebat di dalamnya untuk kutip masuk ke inventori.'
      );
    }
    return;
  }

  if (hotspotId === 'v3_item_screwdriver' && gameState.puzzles.microscope && !gameState.flags.pickedScrewdriver) {
    if (
      addItemToInventory({
        id: 'pemutar_skru',
        name: 'Pemutar Skru Berpenebat',
        icon: '🪛',
        description:
          'Pemutar skru berpenebat untuk membuka penutup kotak fius pintu keluar di Bilik 1.',
      })
    ) {
      gameState.flags.pickedScrewdriver = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Pemutar Skru Berpenebat dikutip! Aku boleh pilih pemutar skru ni daripada inventori untuk membuka Kotak Fius di Bilik 1.'
      );
    }
    return;
  }

  // --- VIEW 1: KOTAK FIUS & PENGAWAL EC (TEKA-TEKI 6 PENAMAT) ---
  if (hotspotId === 'v1_fuse_box') {
    handleFuseBoxInteraction();
    return;
  }

  if (hotspotId === 'v1_control_panel') {
    if (gameState.flags.mainFuseInstalled) {
      openEcCalibrationModal();
    } else {
      showDialogue(
        gameState.playerName,
        'Panel kawalan Makmal Agro ni gelap tanpa kuasa. Aku perlu buka Kotak Fius di sebelah kiri dan pasang Fius Utama 30A dahulu.'
      );
      openInspectModal(
        'Panel Kawalan EC Pintu Utama',
        'Terminal ini menunggu bekalan kuasa daripada <strong>Kotak Fius</strong> di sebelah kiri pintu.<br/><br/>Langkah: Buka kotak fius dengan memilih <strong>Pemutar Skru Berpenebat</strong>, pasang <strong>Fius Utama 30A</strong> dari Bilik 5, kemudian laraskan bacaan EC tepat.'
      );
    }
    return;
  }

  // --- VIEW 5: TEKA-TEKI 5 (TAKSONOMI BUAH-BUAHAN BIO-VAULT) ---
  if (hotspotId === 'v5_taxonomy_board') {
    openFruitTaxonomyModal();
    return;
  }

  if (hotspotId === 'v5_biovault') {
    if (!gameState.puzzles.bioVault) {
      openFruitTaxonomyModal();
    } else if (gameState.flags.pickedMainFuse && gameState.flags.pickedEcNote) {
      showDialogue(
        gameState.playerName,
        'Peti Kebal Fius Utama dah terbuka dan kedua-dua item (Fius Utama 30A & Nota Lekat Prof. Razak) telah diambil.'
      );
    } else {
      showDialogue(
        gameState.playerName,
        'Peti Kebal Fius Utama dah terbuka! Klik Fius Utama 30A dan Nota Lekat Prof. Razak di dalam peti kebal untuk mengutipnya.'
      );
    }
    return;
  }

  if (hotspotId === 'v5_item_fius' && gameState.puzzles.bioVault && !gameState.flags.pickedMainFuse) {
    if (
      addItemToInventory({
        id: 'fius_utama',
        name: 'Fius Utama 30A',
        icon: '⚡',
        description: 'Fius kuasa berat 30A untuk menghidupkan pengawal EC di kotak fius pintu keluar (Bilik 1).',
      })
    ) {
      gameState.flags.pickedMainFuse = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Fius Utama 30A dikutip! Pilih fius ini daripada inventori untuk dipasang di dalam Kotak Fius Bilik 1.'
      );
    }
    return;
  }

  if (hotspotId === 'v5_item_nota_ec' && gameState.puzzles.bioVault && !gameState.flags.pickedEcNote) {
    if (
      addItemToInventory({
        id: 'nota_ec',
        name: 'Nota Lekat Prof. Razak',
        icon: '📝',
        description:
          'Peringatan kecemasan: Tetapkan pengawal EC pintu keluar tepat pada bacaan 1.8 mS/cm untuk batalkan pelepasan gas beracun!',
      })
    ) {
      gameState.flags.pickedEcNote = true;
      refreshCurrentRoomScene();
      showDialogue(
        gameState.playerName,
        'Nota Lekat Prof. Razak dikutip! Bacaan sasaran EC: 1.8 mS/cm. Klik nota ini dalam inventori bila-bila masa untuk membacanya semula.'
      );
      openClueNoteModal('nota_ec');
    }
    return;
  }

  const hotspotInfo = {
    v1_exit_door: {
      title: gameState.puzzles.controlPanel
        ? 'Pintu Utama Makmal (TERBUKA)'
        : 'Pintu Utama Makmal (Kunci Magnetik)',
      thought: gameState.puzzles.controlPanel
        ? 'Kunci magnetik dah pun dilepaskan!'
        : 'Pintu keluli ni dikunci oleh kunci magnetik voltan tinggi. Aku nampak kotak fius di sebelah kiri—mungkin perlu pemutar skru, fius utama, dan pelarasan EC yang tepat untuk nyahaktifkannya.',
      clue: gameState.puzzles.controlPanel
        ? 'Status: <strong>DINYAHAKTIFKAN</strong>. Bacaan EC 1.8 mS/cm stabil.'
        : 'Status: <strong>TERKUNCI RAPAT</strong>. Kunci magnetik disambungkan ke <strong>Kotak Fius</strong> di sebelah kiri pintu. Selesaikan protokol makmal untuk mendapatkan peralatan dan bacaan EC.',
    },
    v2_prof_log: {
      title: 'Buku Log Profesor Razak',
      thought: 'Profesor Razak meninggalkan catatan ringkas mengenai eksperimen pelajar Semester 1.',
      clue: '<em>"Ingatan kepada pelajar ISMP Sains Pertanian: Sentiasa rujuk Buku Nota Kuliah jika keliru tentang simptom NPK, pengapuran GML, Segitiga USDA, anatomi tumbuhan, atau taksonomi buah tropika."</em>',
    },
    v3_botany_poster: {
      title: 'Poster Anatomi Monokotiledon vs Dikotiledon',
      thought: 'Poster rujukan dinding ini membandingkan susunan berkas vaskular, urat daun dan bilangan kotiledon.',
      clue: '<strong>Monokotiledon:</strong> 1 kotiledon, urat daun selari, berkas vaskular tersebar, akar serabut.<br/><strong>Dikotiledon:</strong> 2 kotiledon, urat daun jejala, berkas vaskular tersusun dalam gelang, akar tunjang.',
    },
    v3_herbarium: {
      title: 'Rak Spesimen Herbarium',
      thought: 'Balang spesimen dan daun kering disusun mengikut famili botani.',
      clue: 'Beberapa label spesies buah-buahan tropika (Durian, Mangga, Rambutan, Nangka) dipadankan di papan taksonomi Bilik 5 (Bio-Vault).',
    },
    v5_hybrid_chamber: {
      title: 'Kebuk Kaca Spesimen Hibrid 07',
      thought: 'Ini Spesimen Hibrid 07 milik Profesor Razak! Sistem hidroponiknya dijaga rapi di bawah lampu kuarantin.',
      clue: 'Spesimen ini dipelihara dalam larutan nutrien terkawal di Bilik Kebal Bio-Vault. Semak <strong>Papan Taksonomi Hortikultur</strong> dan <strong>Peti Kebal Fius Utama</strong> di sebelah kanan untuk mendapatkan Fius 30A.',
    },
  };

  const info = hotspotInfo[hotspotId];
  if (!info) return;

  showDialogue(gameState.playerName, info.thought, 'normal');
  openInspectModal(info.title, info.clue);
}

function openInspectModal(title, htmlContent) {
  setInspectModalWide(false);
  dom.inspectTitle.textContent = title;
  dom.inspectBody.innerHTML = `
    <div class="inspect-clue-box">${htmlContent}</div>
    <div class="pin-actions">
      <button type="button" class="btn-secondary" id="btn-inspect-ok">Faham</button>
    </div>
  `;
  dom.inspectModal.hidden = false;
  document.getElementById('btn-inspect-ok').addEventListener('click', () => {
    playSFX('click');
    closeInspectModal();
  });
}

// ============================================================================
// 9. KOTAK DIALOG WATAK & SISTEM INVENTORI (6 SLOT + IKON SVG KHUSUS)
// ============================================================================

function getInventoryItemSVG(itemId) {
  switch (itemId) {
    case 'kunci_tembaga':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><circle cx="12" cy="20" r="6.5" fill="#d98238" stroke="#040709" stroke-width="2.2"/><circle cx="12" cy="20" r="2.2" fill="#081015"/><rect x="18" y="18" width="17" height="4.5" rx="1.5" fill="#d98238" stroke="#040709" stroke-width="2"/><rect x="27" y="22" width="3.5" height="5" fill="#d98238" stroke="#040709" stroke-width="1.6"/><rect x="32" y="22" width="3.5" height="6.5" fill="#d98238" stroke="#040709" stroke-width="1.6"/></svg>`;
    case 'baja_n':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="15" y="5" width="10" height="5" rx="1.5" fill="#e7dcc3" stroke="#040709" stroke-width="2"/><rect x="11" y="10" width="18" height="24" rx="4" fill="#1d6fa5" stroke="#040709" stroke-width="2.2"/><rect x="13" y="17" width="14" height="12" rx="1.5" fill="#e7dcc3"/><text x="20" y="26.5" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">N</text></svg>`;
    case 'baja_p':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="15" y="5" width="10" height="5" rx="1.5" fill="#e7dcc3" stroke="#040709" stroke-width="2"/><rect x="11" y="10" width="18" height="24" rx="4" fill="#7c3aed" stroke="#040709" stroke-width="2.2"/><rect x="13" y="17" width="14" height="12" rx="1.5" fill="#e7dcc3"/><text x="20" y="26.5" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">P</text></svg>`;
    case 'baja_k':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="15" y="5" width="10" height="5" rx="1.5" fill="#e7dcc3" stroke="#040709" stroke-width="2"/><rect x="11" y="10" width="18" height="24" rx="4" fill="#d97706" stroke="#040709" stroke-width="2.2"/><rect x="13" y="17" width="14" height="12" rx="1.5" fill="#e7dcc3"/><text x="20" y="26.5" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="10" font-weight="700">K</text></svg>`;
    case 'nota_tanah':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="8" y="6" width="24" height="28" rx="3" fill="#e7dcc3" stroke="#040709" stroke-width="2.2"/><line x1="13" y1="13" x2="27" y2="13" stroke="#10252d" stroke-width="2.2"/><line x1="13" y1="19" x2="27" y2="19" stroke="#1b4652" stroke-width="2"/><line x1="13" y1="25" x2="23" y2="25" stroke="#1b4652" stroke-width="2"/></svg>`;
    case 'kunci_slaid':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><circle cx="13" cy="19" r="6" fill="#eab308" stroke="#040709" stroke-width="2.2"/><rect x="18" y="17" width="16" height="4" rx="1.5" fill="#eab308" stroke="#040709" stroke-width="2"/><rect x="28" y="21" width="4" height="6" fill="#eab308" stroke="#040709" stroke-width="1.6"/></svg>`;
    case 'slaid_kaca':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="4" y="13" width="32" height="14" rx="2" fill="#a5f3fc" fill-opacity="0.72" stroke="#040709" stroke-width="2.2"/><rect x="14" y="15" width="12" height="10" rx="1" fill="#ecfdf5" fill-opacity="0.7" stroke="#0d5c45" stroke-width="1.4"/><circle cx="20" cy="20" r="3" fill="#2ea877" stroke="#040709" stroke-width="1.4"/><rect x="6" y="15" width="5" height="10" rx="1" fill="#e7dcc3" stroke="#040709" stroke-width="1.2"/></svg>`;
    case 'kanta_pembesar':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><circle cx="17" cy="17" r="9" fill="#7ee0eb" fill-opacity="0.45" stroke="#040709" stroke-width="2.4"/><line x1="23.5" y1="23.5" x2="34" y2="34" stroke="#d99b38" stroke-width="4.5" stroke-linecap="round"/><line x1="23.5" y1="23.5" x2="34" y2="34" stroke="#040709" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case 'kad_botani':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="5" y="9" width="30" height="22" rx="3" fill="#184e3d" stroke="#040709" stroke-width="2.2"/><circle cx="13" cy="20" r="4.5" fill="#6ee7b7" stroke="#040709" stroke-width="1.5"/><line x1="20" y1="16" x2="31" y2="16" stroke="#e7dcc3" stroke-width="2.2"/><line x1="20" y1="21" x2="29" y2="21" stroke="#9bb3bd" stroke-width="1.8"/><line x1="20" y1="26" x2="27" y2="26" stroke="#9bb3bd" stroke-width="1.8"/></svg>`;
    case 'pemutar_skru':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><path d="M9 31 L18 22" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/><path d="M7 33 L11 29" stroke="#e2e8f0" stroke-width="4.5" stroke-linecap="round"/><rect x="17" y="13" width="16" height="8" rx="3" transform="rotate(-45 25 17)" fill="#d97706" stroke="#040709" stroke-width="2.2"/><line x1="21" y1="19" x2="26" y2="14" stroke="#040709" stroke-width="1.8"/></svg>`;
    case 'fius_utama':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="7" y="13" width="26" height="14" rx="3" fill="#2ea877" stroke="#040709" stroke-width="2.2"/><rect x="7" y="13" width="6.5" height="14" rx="1.5" fill="#cbd5e1" stroke="#040709" stroke-width="2"/><rect x="26.5" y="13" width="6.5" height="14" rx="1.5" fill="#cbd5e1" stroke="#040709" stroke-width="2"/><path d="M21 15 L17 21 L20.5 21 L19 25 L23 19 L19.5 19 Z" fill="#fef08a"/></svg>`;
    case 'nota_ec':
      return `<svg class="inv-slot-svg" viewBox="0 0 40 40"><rect x="8" y="7" width="24" height="26" rx="2" fill="#fef08a" stroke="#040709" stroke-width="2.2"/><polygon points="24,33 32,25 24,25" fill="#d99b38" stroke="#040709" stroke-width="1.5"/><text x="20" y="19" text-anchor="middle" fill="#05080a" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700">EC</text><text x="20" y="28" text-anchor="middle" fill="#b91c1c" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700">1.8</text></svg>`;
    default:
      return null;
  }
}

function showDialogue(speaker, text, mood = 'normal') {
  dom.dialogueSpeaker.textContent = speaker || gameState.playerName || 'Pelajar';
  dom.dialogueSpeaker.classList.toggle('mood-warning', mood === 'warning');
  dom.dialogueSpeaker.classList.toggle('mood-bonus', mood === 'bonus');
  dom.dialogueText.textContent = text;
  dom.dialoguePortrait.innerHTML = getPortraitSVG(mood === 'system' || mood === 'bonus' ? 'system' : 'player');
}

function addItemToInventory(item) {
  if (!item || !item.id) return false;
  if (gameState.inventory.some((i) => i.id === item.id)) return true;
  if (gameState.inventory.length >= MAX_INVENTORY_SLOTS) {
    showDialogue(gameState.playerName, 'Beg inventori aku dah penuh (maksimum 6 barang)!', 'warning');
    return false;
  }
  gameState.inventory.push(item);
  playSFX('pickup');
  renderInventory();
  return true;
}

function setSelectedInventoryItem(itemId) {
  gameState.selectedItemId = itemId || null;
  gameState.selectedItem = itemId || null;
}

function openClueNoteModal(itemId) {
  setInspectModalWide(false);
  if (itemId === 'nota_tanah') {
    dom.inspectTitle.textContent = 'Nota Sampel Tanah (Blok B)';
    dom.inspectBody.innerHTML = `
      <div class="clue-note-sheet">
        <div class="clue-note-kicker">REKOD MAKMAL AGRO · SAMPEL BLOK B</div>
        <h3 class="clue-note-heading">Analisis Pecahan Zarah Tanah</h3>
        <div class="clue-note-data">40% Pasir &nbsp;|&nbsp; 40% Kelodak &nbsp;|&nbsp; 20% Liat</div>
        <p class="clue-note-desc">
          Gunakan peratusan ini bersama <strong>Carta Segitiga Tekstur Tanah USDA</strong> di Bilik 2.
          Jangan lupa pilih <strong>Kanta Pembesar</strong> daripada inventori apabila hendak membaca carta tersebut.
        </p>
      </div>
      <div class="pin-actions">
        <button type="button" class="btn-primary" id="btn-clue-note-close">Tutup Nota</button>
      </div>
    `;
  } else if (itemId === 'nota_ec') {
    dom.inspectTitle.textContent = 'Nota Lekat Prof. Razak';
    dom.inspectBody.innerHTML = `
      <div class="clue-note-sheet is-sticky">
        <div class="clue-note-kicker">PERINGATAN KECEMASAN MAKMAL AGRO</div>
        <h3 class="clue-note-heading">Tetapan Pengawal EC Pintu Utama</h3>
        <div class="clue-note-data">Bacaan Sasaran: 1.8 mS/cm</div>
        <p class="clue-note-desc">
          Tetapkan pengawal keberaliran elektrik (EC) di dalam Kotak Fius Bilik 1 tepat pada <strong>1.8 mS/cm</strong>
          selepas memasang <strong>Fius Utama 30A</strong> untuk melepaskan kunci magnetik!
        </p>
      </div>
      <div class="pin-actions">
        <button type="button" class="btn-primary" id="btn-clue-note-close">Tutup Nota</button>
      </div>
    `;
  } else {
    return;
  }

  dom.inspectModal.hidden = false;
  document.getElementById('btn-clue-note-close').addEventListener('click', () => {
    playSFX('click');
    closeInspectModal();
  });
}

function removeItemFromInventory(itemId) {
  gameState.inventory = gameState.inventory.filter((i) => i.id !== itemId);
  if (gameState.selectedItemId === itemId || gameState.selectedItem === itemId) {
    setSelectedInventoryItem(null);
  }
  renderInventory();
}

function selectInventoryItem(itemId) {
  const item = gameState.inventory.find((i) => i.id === itemId);
  const itemDialogue = item ? (item.description ? `${item.name}: ${item.description}` : item.name) : '';
  if (itemId === 'nota_tanah' || itemId === 'nota_ec') {
    playSFX('page');
    setSelectedInventoryItem(itemId);
    if (item) {
      showDialogue(gameState.playerName, itemDialogue, 'normal');
    }
    renderInventory();
    openClueNoteModal(itemId);
    return;
  }

  if (gameState.selectedItemId === itemId) {
    setSelectedInventoryItem(null);
  } else {
    setSelectedInventoryItem(itemId);
    if (item) {
      showDialogue(gameState.playerName, itemDialogue, 'normal');
    }
  }
  playSFX('click');
  renderInventory();
}

function renderInventory() {
  const slotsHtml = [];
  for (let i = 0; i < MAX_INVENTORY_SLOTS; i += 1) {
    const item = gameState.inventory[i];
    if (item) {
      const isSelected = gameState.selectedItemId === item.id;
      const visual = item.svg || getInventoryItemSVG(item.id) || `<span aria-hidden="true">${item.icon}</span>`;
      slotsHtml.push(`
        <button
          type="button"
          class="inv-slot has-item ${isSelected ? 'selected' : ''}"
          data-item-id="${item.id}"
          title="${item.name}"
          aria-label="${item.name}"
          aria-pressed="${isSelected}"
        >
          ${visual}
        </button>
      `);
    } else {
      slotsHtml.push(`
        <div class="inv-slot" aria-label="Slot inventori kosong">
          <span class="inv-slot-empty-dot" aria-hidden="true"></span>
        </div>
      `);
    }
  }
  dom.inventorySlots.innerHTML = slotsHtml.join('');

  const selected = gameState.inventory.find((i) => i.id === gameState.selectedItemId);
  dom.inventorySelectedLabel.textContent = selected ? `Item Aktif: ${selected.name}` : 'Tiada dipilih';
  dom.inventorySelectedLabel.classList.toggle('is-active', Boolean(selected));

  dom.inventorySlots.querySelectorAll('.inv-slot.has-item').forEach((btn) => {
    btn.addEventListener('click', () => selectInventoryItem(btn.dataset.itemId));
  });
}

// ============================================================================
// 10. BUKU NOTA KULIAH (HINT JOURNAL — SAINS PERTANIAN SEM 1)
// ============================================================================

const NOTEBOOK_TOPICS = {
  npk: `
    <h3>1. Simptom Kekurangan Nutrien Makro (NPK)</h3>
    <p>Nutrien N, P, dan K bersifat <strong>mudah alih (mobile)</strong> di dalam floem tumbuhan. Apabila berlaku kekurangan, tumbuhan memindahkan nutrien ke pucuk baharu, menyebabkan simptom muncul dahulu pada <strong>daun tua (bawah)</strong>:</p>
    <div class="note-grid">
      <div class="note-card">
        <h4>Nitrogen (N)</h4>
        <ul>
          <li>Klorosis (daun menjadi kuning pucat sekata) bermula pada daun tua.</li>
          <li>Pertumbuhan vegetatif terbantut dan batang kurus.</li>
        </ul>
      </div>
      <div class="note-card">
        <h4>Fosforus (P)</h4>
        <ul>
          <li>Daun tua bertukar warna hijau gelap atau <strong>ungu kemerahan</strong> (pengumpulan antosianin).</li>
          <li>Perkembangan akar lemah dan pembungaan lewat.</li>
        </ul>
      </div>
      <div class="note-card">
        <h4>Kalium (K)</h4>
        <ul>
          <li><strong>Nekrosis (hangus/kering keperangan) di tepi dan hujung daun tua</strong>.</li>
          <li>Tangkai lemah dan daya tahan penyakit merosot.</li>
        </ul>
      </div>
    </div>
  `,
  ph: `
    <h3>2. pH Tanah Tropika &amp; Amalan Pengapuran</h3>
    <p>Kebanyakan tanaman pertanian di Malaysia tumbuh optimum pada julat <strong>pH 5.5 – 6.5</strong>, di mana ketersediaan nutrien makro dan mikro berada pada tahap terbaik.</p>
    <div class="note-grid">
      <div class="note-card">
        <h4>Kesan Tanah Terlalu Berasid (pH &lt; 5.0)</h4>
        <ul>
          <li>Ketoksikan Aluminium (Al³⁺) dan Mangan (Mn²⁺) merosakkan hujung akar.</li>
          <li>Fosforus terikat oleh Fe/Al menjadi tidak tersedia kepada tanaman.</li>
          <li>Aktiviti mikrob pengikat nitrogen terencat.</li>
        </ul>
      </div>
      <div class="note-card">
        <h4>Rawatan Pengapuran (Liming)</h4>
        <ul>
          <li>Gunakan <strong>Kapur Pertanian / GML</strong> (Ground Magnesium Limestone: CaCO₃·MgCO₃) atau Batu Kapur Kalsit (CaCO₃).</li>
          <li>Ion karbonat meneutralkan ion H⁺ serta membekalkan Ca²⁺ dan Mg²⁺.</li>
        </ul>
      </div>
    </div>
  `,
  texture: `
    <h3>3. Panduan Segitiga Tekstur Tanah USDA</h3>
    <p>Tekstur tanah ditentukan oleh peratusan relatif tiga pecahan zarah mineral (tidak termasuk bahan organik): <strong>Pasir (Sand)</strong>, <strong>Kelodak (Silt)</strong>, dan <strong>Liat (Clay)</strong>.</p>
    <table class="note-table">
      <thead>
        <tr>
          <th>Pecahan Zarah</th>
          <th>Saiz Diameter (USDA)</th>
          <th>Sifat Utama Pertanian</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Pasir (Sand)</strong></td>
          <td>0.05 – 2.00 mm</td>
          <td>Saliran &amp; pengudaraan sangat laju; pegangan air &amp; nutrien (KTK) rendah.</td>
        </tr>
        <tr>
          <td><strong>Kelodak (Silt)</strong></td>
          <td>0.002 – 0.05 mm</td>
          <td>Tekstur licin seperti tepung; pegangan air sederhana baik.</td>
        </tr>
        <tr>
          <td><strong>Liat (Clay)</strong></td>
          <td>&lt; 0.002 mm</td>
          <td>KTK (CEC) &amp; pegangan air sangat tinggi; mudah padat jika basah.</td>
        </tr>
        <tr>
          <td><strong>Tanah Lom (Loam)</strong></td>
          <td>~40% Pasir · 40% Kelodak · 20% Liat</td>
          <td>Tekstur ideal kebanyakan tanaman — seimbang antara saliran dan kesuburan.</td>
        </tr>
      </tbody>
    </table>
  `,
  botany: `
    <h3>4. Perbandingan Anatomi Monokotiledon vs Dikotiledon</h3>
    <p>Tumbuhan berbunga (Angiospermae) dibahagikan kepada dua kelas utama berdasarkan struktur biji benih dan anatominya:</p>
    <table class="note-table">
      <thead>
        <tr>
          <th>Ciri Anatomi</th>
          <th>Monokotiledon</th>
          <th>Dikotiledon</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Kotiledon</strong></td>
          <td>1 kotiledon</td>
          <td>2 kotiledon</td>
        </tr>
        <tr>
          <td><strong>Urat Daun</strong></td>
          <td>Selari (Parallel)</td>
          <td>Jejala (Reticulate / Netted)</td>
        </tr>
        <tr>
          <td><strong>Berkas Vaskular Batang</strong></td>
          <td>Tersebar (Scattered)</td>
          <td>Tersusun dalam gelang (Ring)</td>
        </tr>
        <tr>
          <td><strong>Sistem Akar</strong></td>
          <td>Akar serabut (Fibrous)</td>
          <td>Akar tunjang (Taproot)</td>
        </tr>
        <tr>
          <td><strong>Contoh Tanaman</strong></td>
          <td>Padi, Jagung, Kelapa Sawit, Pisang, Nanas</td>
          <td>Durian, Mangga, Cili, Kacang Panjang, Getah</td>
        </tr>
      </tbody>
    </table>
  `,
  taxonomy: `
    <h3>5. Taksonomi Buah-buahan Tropika Malaysia</h3>
    <p>Pengelasan saintifik binomial (<em>Genus species</em>) dan famili bagi tanaman buah komoditi utama dalam kursus Sains Pertanian Semester 1:</p>
    <table class="note-table">
      <thead>
        <tr>
          <th>Nama Biasa</th>
          <th>Nama Saintifik</th>
          <th>Famili</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Durian</td>
          <td><em>Durio zibethinus</em></td>
          <td>Malvaceae</td>
        </tr>
        <tr>
          <td>Mangga</td>
          <td><em>Mangifera indica</em></td>
          <td>Anacardiaceae</td>
        </tr>
        <tr>
          <td>Betik</td>
          <td><em>Carica papaya</em></td>
          <td>Caricaceae</td>
        </tr>
        <tr>
          <td>Nanas</td>
          <td><em>Ananas comosus</em></td>
          <td>Bromeliaceae</td>
        </tr>
        <tr>
          <td>Pisang</td>
          <td><em>Musa acuminata</em></td>
          <td>Musaceae</td>
        </tr>
        <tr>
          <td>Rambutan</td>
          <td><em>Nephelium lappaceum</em></td>
          <td>Sapindaceae</td>
        </tr>
        <tr>
          <td>Nangka</td>
          <td><em>Artocarpus heterophyllus</em></td>
          <td>Moraceae</td>
        </tr>
      </tbody>
    </table>
  `,
};

function openNotebookModal() {
  if (gameState.isGameActive && dom.notebookModal.hidden) {
    gameState.hintsUsed += 1;
  }
  if (gameState.isGameActive && !gameState.isTimerPaused) {
    gameState.isTimerPaused = true;
    gameState.pauseStartedAt = Date.now();
  }
  playSFX('page');
  renderNotebookTab('npk');
  dom.notebookModal.hidden = false;
  updateTimerAndTensionUI();
}

function closeNotebookModal(silent = false) {
  if (gameState.isTimerPaused) {
    if (gameState.pauseStartedAt) {
      gameState.totalPausedMs += Math.max(0, Date.now() - gameState.pauseStartedAt);
      gameState.pauseStartedAt = null;
    }
    gameState.isTimerPaused = false;
  }
  if (!dom.notebookModal.hidden && !silent) {
    playSFX('click');
  }
  dom.notebookModal.hidden = true;
  updateTimerAndTensionUI();
}

function renderNotebookTab(tabKey) {
  dom.notebookTabs.forEach((tab) => {
    const active = tab.dataset.tab === tabKey;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  dom.notebookContent.innerHTML = NOTEBOOK_TOPICS[tabKey] || NOTEBOOK_TOPICS.npk;
}

// ============================================================================
// 11. STORAN REKOD, GRED PRESTASI & PAPAN PEMUKA ADMIN
// ============================================================================

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function calculatePerformanceGrade(status, elapsedSeconds, mistakes) {
  if (status !== 'BERJAYA') return 'F (Gagal Kuarantin)';
  if (mistakes <= 1 && elapsedSeconds < 480) return 'Gred A+ (Pakar Agronomi Muda)';
  if (mistakes <= 3) return 'Gred A (Pelajar Cemerlang)';
  if (mistakes <= 5) return 'Gred B (Lulus Kepujian)';
  return 'Gred C (Nyaris Terperangkap)';
}

function saveGameRecord(status) {
  if (gameState.recordSaved) {
    const existing = loadRecords();
    return existing[existing.length - 1];
  }
  gameState.recordSaved = true;

  const pausedActiveMs =
    gameState.isTimerPaused && gameState.pauseStartedAt
      ? Math.max(0, Date.now() - gameState.pauseStartedAt)
      : 0;
  const totalPaused = (gameState.totalPausedMs || 0) + pausedActiveMs;
  const actualElapsed = gameState.playStartTime
    ? Math.max(1, Math.round((Date.now() - gameState.playStartTime - totalPaused) / 1000))
    : Math.max(1, gameState.totalElapsedSeconds || TOTAL_GAME_SECONDS);
  gameState.totalElapsedSeconds = actualElapsed;

  const durationSeconds = actualElapsed;

  const now = new Date();
  const formattedDate = now.toLocaleString('ms-MY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const record = {
    id: `rec_${Date.now()}`,
    nama: gameState.playerName || 'Tanpa Nama',
    noMatrik: gameState.matricNo ? gameState.matricNo : '-',
    avatar: gameState.avatar || 'male',
    tarikhMasa: formattedDate,
    timestampISO: now.toISOString(),
    durationSeconds,
    remainingSeconds: gameState.remainingSeconds,
    status,
    puzzlesSolved: countSolvedPuzzles(),
    mistakes: gameState.mistakes,
    mistakeBreakdown: { ...gameState.mistakeBreakdown },
    hintsUsed: gameState.hintsUsed,
    grade: calculatePerformanceGrade(status, durationSeconds, gameState.mistakes),
  };

  const records = loadRecords();
  records.push(record);
  saveRecords(records);
  sendRecordToGoogleSheet(record);
  return record;
}

let activeAdminRecords = null;

function isGoogleSheetConfigured() {
  const url = String(GOOGLE_SHEET_WEBHOOK_URL || '').trim();
  return Boolean(url && !url.includes('PASTE_YOUR') && /^https?:\/\//i.test(url));
}

function sendRecordToGoogleSheet(record) {
  if (!isGoogleSheetConfigured() || !record) return;
  try {
    fetch(GOOGLE_SHEET_WEBHOOK_URL.trim(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Abaikan ralat rangkaian agar mod luar talian kekal lancar
  }
}

function setAdminSyncStatus(message, mode = 'loading') {
  if (!dom.adminSyncStatus) return;
  if (!message) {
    dom.adminSyncStatus.hidden = true;
    dom.adminSyncStatus.textContent = '';
    dom.adminSyncStatus.classList.remove('is-loading', 'is-cloud', 'is-offline');
    return;
  }
  dom.adminSyncStatus.hidden = false;
  dom.adminSyncStatus.textContent = message;
  dom.adminSyncStatus.classList.remove('is-loading', 'is-cloud', 'is-offline');
  dom.adminSyncStatus.classList.add(`is-${mode}`);
}

function normalizeCloudRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  let breakdown = raw.mistakeBreakdown;
  if (typeof breakdown === 'string') {
    try {
      breakdown = JSON.parse(breakdown);
    } catch {
      breakdown = null;
    }
  }
  if (!breakdown || typeof breakdown !== 'object') {
    const rawJson = raw['Pecahan Salah (JSON)'] || raw.pecahanSalahJson;
    if (typeof rawJson === 'string' && rawJson.trim()) {
      try {
        breakdown = JSON.parse(rawJson);
      } catch {
        breakdown = null;
      }
    }
  }
  if (!breakdown || typeof breakdown !== 'object') {
    breakdown = {
      npk_nutrien: Number(raw['Salah: NPK'] ?? raw['Salah: Simptom NPK'] ?? 0) || 0,
      ph_tanah: Number(raw['Salah: pH Tanah'] ?? 0) || 0,
      tekstur_tanah: Number(raw['Salah: Tekstur USDA'] ?? 0) || 0,
      anatomi_tumbuhan: Number(raw['Salah: Botani'] ?? 0) || 0,
      nama_saintifik: Number(raw['Salah: Taksonomi'] ?? raw['Salah: Taksonomi Buah'] ?? 0) || 0,
      panel_ec: Number(raw['Salah: Panel EC'] ?? 0) || 0,
      general: Number(raw['Salah: Umum'] ?? 0) || 0,
    };
  }

  const nama = String(raw.nama ?? raw['Nama Pemain'] ?? raw.name ?? 'Tanpa Nama').trim();
  const noMatrik = String(raw.noMatrik ?? raw['No. Matrik'] ?? raw.matric ?? '-').trim() || '-';
  const tarikhMasa = String(raw.tarikhMasa ?? raw['Tarikh / Masa'] ?? raw.timestamp ?? '-');
  const status = String(raw.status ?? raw['Status'] ?? 'BERJAYA').trim() || 'BERJAYA';
  const durationSeconds = Number(raw.durationSeconds ?? raw['Tempoh (Saat)'] ?? 0) || 0;
  const remainingSeconds = Number(raw.remainingSeconds ?? raw['Baki Masa (Saat)'] ?? 0) || 0;
  const mistakes = Number(raw.mistakes ?? raw['Jumlah Salah'] ?? 0) || 0;
  const hintsUsed = Number(raw.hintsUsed ?? raw['Petunjuk Digunakan'] ?? 0) || 0;
  const legacyGradeKey = 'Gred ' + String.fromCharCode(85, 80, 83, 73);
  const grade = String(
    raw.grade ??
      raw['Gred Prestasi'] ??
      raw[legacyGradeKey] ??
      calculatePerformanceGrade(status, durationSeconds, mistakes)
  );

  return {
    id: String(raw.id ?? raw.ID ?? `cloud_${Math.random().toString(36).slice(2, 9)}`),
    nama,
    noMatrik,
    avatar: String(raw.avatar ?? raw.Avatar ?? 'male'),
    tarikhMasa,
    timestampISO: String(raw.timestampISO ?? raw['Timestamp ISO'] ?? ''),
    durationSeconds,
    remainingSeconds,
    status,
    puzzlesSolved: Number(raw.puzzlesSolved ?? raw['Teka-Teki Selesai'] ?? 0) || 0,
    mistakes,
    mistakeBreakdown: breakdown,
    hintsUsed,
    grade,
  };
}

async function fetchCloudRecordsFromGoogleSheets() {
  const baseUrl = GOOGLE_SHEET_WEBHOOK_URL.trim();
  const sep = baseUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${baseUrl}${sep}action=list&t=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const payload = await res.json();
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.records)
      ? payload.records
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return rawList.map(normalizeCloudRecord).filter(Boolean);
}

function formatBreakdownText(breakdown) {
  if (!breakdown) return '0';
  const entries = Object.entries(breakdown).filter(([, count]) => count > 0);
  if (entries.length === 0) return '0';
  const details = entries.map(([key, count]) => `${TOPIC_LABELS[key] || key}: ${count}`).join(', ');
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  return `${total} (${details})`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAdminDashboard(recordsOverride) {
  const records = Array.isArray(recordsOverride) ? recordsOverride : loadRecords();
  activeAdminRecords = records;
  const totalPlayers = records.length;
  const successRuns = records.filter((r) => r.status === 'BERJAYA');
  const successRate =
    totalPlayers > 0 ? Math.round((successRuns.length / totalPlayers) * 100) : 0;

  let avgTimeStr = '—';
  if (successRuns.length > 0) {
    const avgSec = Math.round(
      successRuns.reduce((sum, r) => sum + (Number(r.durationSeconds) || 0), 0) /
        successRuns.length
    );
    avgTimeStr = formatSeconds(avgSec);
  }

  // Kira topik paling mencabar berdasarkan jumlah kesalahan terkumpul
  const topicTotals = {};
  records.forEach((rec) => {
    if (!rec.mistakeBreakdown) return;
    Object.entries(rec.mistakeBreakdown).forEach(([key, count]) => {
      topicTotals[key] = (topicTotals[key] || 0) + (Number(count) || 0);
    });
  });

  let hardestTopic = 'Tiada rekod salah';
  let highestMistakes = 0;
  Object.entries(topicTotals).forEach(([key, count]) => {
    if (count > highestMistakes) {
      highestMistakes = count;
      hardestTopic = `${TOPIC_LABELS[key] || key} (${count})`;
    }
  });

  dom.kpiTotalPlayers.textContent = String(totalPlayers);
  dom.kpiSuccessRate.textContent = `${successRate}%`;
  dom.kpiAvgTime.textContent = avgTimeStr;
  dom.kpiHardestTopic.textContent = hardestTopic;

  // Papan Pendahulu (Disusun mengikut masa tamat terpantas)
  const leaderboard = [...successRuns].sort((a, b) => a.durationSeconds - b.durationSeconds);
  if (leaderboard.length === 0) {
    dom.adminLeaderboardBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-row">Belum ada pelajar yang berjaya melarikan diri setakat ini.</td>
      </tr>
    `;
  } else {
    dom.adminLeaderboardBody.innerHTML = leaderboard
      .map(
        (rec, idx) => `
        <tr>
          <td class="td-mono">#${idx + 1}</td>
          <td>${escapeHtml(rec.nama)}</td>
          <td class="td-mono">${escapeHtml(rec.noMatrik || '-')}</td>
          <td class="td-mono">${formatSeconds(rec.durationSeconds)}</td>
          <td class="td-mono">${rec.mistakes}</td>
          <td class="td-mono">${rec.hintsUsed}</td>
          <td class="td-mono"><strong>${escapeHtml(rec.grade)}</strong></td>
        </tr>
      `
      )
      .join('');
  }

  // Log Lengkap Semua Pemain (Terbaharu dahulu)
  if (records.length === 0) {
    dom.adminLogBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-row">Tiada rekod permainan ditemui buat masa ini.</td>
      </tr>
    `;
  } else {
    dom.adminLogBody.innerHTML = [...records]
      .reverse()
      .map((rec) => {
        const isSuccess = rec.status === 'BERJAYA';
        const durationLabel = isSuccess
          ? formatSeconds(rec.durationSeconds)
          : `${formatSeconds(rec.durationSeconds)} (Tamat)`;
        return `
          <tr>
            <td>${escapeHtml(rec.nama)}</td>
            <td class="td-mono">${escapeHtml(rec.noMatrik || '-')}</td>
            <td class="td-mono">${escapeHtml(rec.tarikhMasa)}</td>
            <td class="td-mono">${durationLabel}</td>
            <td class="${isSuccess ? 'status-text-success' : 'status-text-fail'}">${escapeHtml(rec.status)}</td>
            <td>${escapeHtml(formatBreakdownText(rec.mistakeBreakdown))}</td>
            <td class="td-mono">${rec.hintsUsed}</td>
            <td class="td-mono"><strong>${escapeHtml(rec.grade)}</strong></td>
          </tr>
        `;
      })
      .join('');
  }
}

async function refreshAdminDashboard() {
  const localRecords = loadRecords();
  renderAdminDashboard(localRecords);

  if (!isGoogleSheetConfigured()) {
    setAdminSyncStatus(
      `💾 Mod Tempatan (Luar Talian) — Memaparkan ${localRecords.length} rekod daripada storan pelayar.`,
      'offline'
    );
    return;
  }

  setAdminSyncStatus('🔄 Memuatkan rekod langsung dari Google Sheets...', 'loading');
  if (dom.btnRefreshAdmin) {
    dom.btnRefreshAdmin.disabled = true;
  }

  try {
    const cloudRecords = await fetchCloudRecordsFromGoogleSheets();
    renderAdminDashboard(cloudRecords);
    const syncedTime = new Date().toLocaleTimeString('ms-MY', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setAdminSyncStatus(
      `☁️ Disegerakkan dengan Google Sheets · ${cloudRecords.length} rekod langsung (${syncedTime})`,
      'cloud'
    );
  } catch {
    renderAdminDashboard(localRecords);
    setAdminSyncStatus(
      `⚠️ Mod Luar Talian — Gagal capai Google Sheets. Memaparkan ${localRecords.length} rekod storan tempatan.`,
      'offline'
    );
  } finally {
    if (dom.btnRefreshAdmin) {
      dom.btnRefreshAdmin.disabled = false;
    }
  }
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function exportRecordsToCSV() {
  const records = Array.isArray(activeAdminRecords) ? activeAdminRecords : loadRecords();
  const headers = [
    'Nama Pemain',
    'No. Matrik',
    'Tarikh / Masa',
    'Tempoh Tamat (MM:SS)',
    'Tempoh (Saat)',
    'Status',
    'Jumlah Salah',
    'Salah: Simptom NPK',
    'Salah: pH Tanah',
    'Salah: Tekstur USDA',
    'Salah: Botani',
    'Salah: Taksonomi Buah',
    'Salah: Panel EC',
    'Salah: Umum',
    'Petunjuk Digunakan',
    'Gred Prestasi',
  ];

  const rows = records.map((rec) => {
    const b = rec.mistakeBreakdown || {};
    return [
      rec.nama,
      rec.noMatrik || '-',
      rec.tarikhMasa,
      formatSeconds(rec.durationSeconds),
      rec.durationSeconds,
      rec.status,
      rec.mistakes,
      b.npk_nutrien || b.npk || 0,
      b.ph_tanah || b.soil_ph || 0,
      b.tekstur_tanah || b.texture || 0,
      b.anatomi_tumbuhan || b.botany || 0,
      b.nama_saintifik || b.fruit_vault || 0,
      b.panel_ec || 0,
      b.general || 0,
      rec.hintsUsed,
      rec.grade,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateSlug = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `rekod_misteri_makmal_agro_${dateSlug}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 12. KAWALAN ALIRAN SESI PERMAINAN, TUTORIAL 4-LANGKAH & EVENT LISTENERS
// ============================================================================

const TUTORIAL_STEPS = [
  {
    title: 'Kawasan Makmal',
    posClass: 'step-pos-1',
    text: '1. Periksa Makmal: Klik atau sentuh peralatan, meja, dan mesin di dalam Makmal Agro untuk mencari petunjuk dan menyelesaikan teka-teki Sains Pertanian.',
    spotlight: ['roomStage'],
  },
  {
    title: 'Butang Bilik B1 – B4',
    posClass: 'step-pos-2',
    text: '2. Navigasi Bilik (B1 – B4): Gunakan butang B1 hingga B4 untuk bergerak antara 4 bahagian makmal bagi meneroka setiap sudut dan petunjuk tersembunyi.',
    spotlight: ['roomCompass'],
    allowStageOverflow: true,
  },
  {
    title: 'Buku Nota Kuliah',
    posClass: 'step-pos-3',
    text: '3. Buku Nota Kuliah: Buka nota rujukan Sains Pertanian pada bila-bila masa untuk menyemak skala pH, simptom nutrien NPK, dan panduan hidroponik.',
    spotlight: ['btnOpenNotebook'],
    elevateHud: true,
  },
  {
    title: 'Inventori & Masa Gas Beracun',
    posClass: 'step-pos-4',
    text: '4. Inventori & Masa: Item yang ditemui akan disimpan di ruang inventori (klik item untuk menggunakannya). Masa akan bermula sebaik sahaja anda tekan Mula!',
    spotlight: ['inventoryPanel', 'hudTimerBox'],
    elevateHud: true,
    elevateDock: true,
    buttonText: 'Mula Misi! ▸',
  },
];

let activeTutorialStep = 0;

function clearTutorialSpotlights() {
  if (dom.gameScreen) dom.gameScreen.classList.remove('is-tutorial-active');
  if (dom.hudBar) dom.hudBar.classList.remove('tutorial-has-spotlight');
  if (dom.bottomDock) dom.bottomDock.classList.remove('tutorial-has-spotlight');
  if (dom.roomStage) {
    dom.roomStage.classList.remove('tutorial-spotlight-target', 'tutorial-allow-overflow');
  }
  if (dom.roomCompass) dom.roomCompass.classList.remove('tutorial-spotlight-target');
  if (dom.btnOpenNotebook) dom.btnOpenNotebook.classList.remove('tutorial-spotlight-target');
  if (dom.inventoryPanel) dom.inventoryPanel.classList.remove('tutorial-spotlight-target');
  if (dom.hudTimerBox) dom.hudTimerBox.classList.remove('tutorial-spotlight-target');
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[activeTutorialStep];
  if (!step || !dom.tutorialOverlay) return;

  clearTutorialSpotlights();
  if (dom.gameScreen) {
    dom.gameScreen.classList.add('is-tutorial-active');
  }

  dom.tutorialOverlay.classList.remove('step-pos-1', 'step-pos-2', 'step-pos-3', 'step-pos-4');
  dom.tutorialOverlay.classList.add(step.posClass);

  if (dom.tutorialStepBadge) {
    dom.tutorialStepBadge.textContent = `${activeTutorialStep + 1}/${TUTORIAL_STEPS.length}`;
  }
  if (dom.tutorialStepTitle) {
    dom.tutorialStepTitle.textContent = step.title;
  }
  if (dom.tutorialStepText) {
    dom.tutorialStepText.textContent = step.text;
  }
  if (dom.btnNextTutorial) {
    dom.btnNextTutorial.textContent = step.buttonText || 'Seterusnya ▸';
  }
  if (dom.tutorialDots) {
    dom.tutorialDots.innerHTML = TUTORIAL_STEPS.map((_, idx) => {
      const cls =
        idx < activeTutorialStep
          ? 'tutorial-dot done'
          : idx === activeTutorialStep
            ? 'tutorial-dot active'
            : 'tutorial-dot';
      return `<span class="${cls}"></span>`;
    }).join('');
  }

  if (step.allowStageOverflow && dom.roomStage) {
    dom.roomStage.classList.add('tutorial-allow-overflow');
  }
  if (step.elevateHud && dom.hudBar) {
    dom.hudBar.classList.add('tutorial-has-spotlight');
  }
  if (step.elevateDock && dom.bottomDock) {
    dom.bottomDock.classList.add('tutorial-has-spotlight');
  }

  (step.spotlight || []).forEach((domKey) => {
    const el = dom[domKey];
    if (el) {
      el.classList.add('tutorial-spotlight-target');
    }
  });
}

function showInteractiveTutorial() {
  if (!dom.tutorialOverlay || !dom.tutorialBackdrop) {
    startTimer();
    return;
  }
  activeTutorialStep = 0;
  dom.tutorialBackdrop.hidden = false;
  dom.tutorialOverlay.hidden = false;
  renderTutorialStep();
  if (dom.btnNextTutorial) {
    dom.btnNextTutorial.focus();
  }
}

function closeInteractiveTutorial() {
  clearTutorialSpotlights();
  if (dom.tutorialBackdrop) dom.tutorialBackdrop.hidden = true;
  if (dom.tutorialOverlay) dom.tutorialOverlay.hidden = true;
}

function finishInteractiveTutorial() {
  closeInteractiveTutorial();
  startTimer();
}

function startTimer() {
  gameState.isGameActive = true;
  gameState.isTimerPaused = false;
  gameState.pauseStartedAt = null;
  gameState.totalPausedMs = 0;
  gameState.playStartTime = Date.now();
  gameState.totalElapsedSeconds = 0;
  startCountdownTimer();
}

function beginPlayableLabSession(withTutorial = true) {
  dom.gameScreen.hidden = false;
  dom.gameScreen.classList.add('active');
  gameState.isGameActive = false;
  gameState.isTimerPaused = false;
  gameState.pauseStartedAt = null;
  gameState.totalPausedMs = 0;
  gameState.totalElapsedSeconds = 0;

  soundManager.playBGM('tense');
  renderInventory();
  navigateToRoom('view1', true);
  updateTimerAndTensionUI();

  if (withTutorial) {
    showInteractiveTutorial();
  } else {
    closeInteractiveTutorial();
    startTimer();
  }
}

function resetToRegistrationScreen() {
  stopCountdownTimer();
  closeInteractiveTutorial();
  gameState = createInitialGameState();
  dom.notebookModal.hidden = true;
  updateTimerAndTensionUI();

  dom.endScreen.hidden = true;
  dom.gameScreen.hidden = true;
  dom.gameScreen.classList.remove('active');
  dom.cutsceneScreen.hidden = true;
  dom.cutsceneScreen.classList.remove('active');
  dom.registrationScreen.hidden = false;
  dom.registrationScreen.classList.add('active');
  soundManager.playBGM('calm');
  if (dom.playerAvatarInput) dom.playerAvatarInput.value = 'male';
  if (dom.avatarOptions && dom.avatarOptions.length > 0) {
    dom.avatarOptions.forEach((opt) => {
      const isMale = opt.dataset.avatar === 'male';
      opt.classList.toggle('active', isMale);
      opt.setAttribute('aria-checked', String(isMale));
    });
  }
  updateMatricCardPortrait('male');
  dom.nameError.hidden = true;
  dom.playerNameInput.focus();
}

function openDevArchiveModal() {
  if (!dom.devArchiveModal) return;
  soundManager.unlock();
  soundManager.playSuccess();
  dom.devArchiveModal.hidden = false;
}

function closeDevArchiveModal(silent = false) {
  if (!dom.devArchiveModal) return;
  if (!dom.devArchiveModal.hidden && !silent) {
    soundManager.playClick();
  }
  dom.devArchiveModal.hidden = true;
}

function initEventListeners() {
  // 1. Pendaftaran Pemain & Pilihan Avatar Kad Matrik
  updateMatricCardPortrait(
    dom.playerAvatarInput && dom.playerAvatarInput.value === 'female' ? 'female' : 'male'
  );
  if (dom.btnQrEasterEgg) {
    dom.btnQrEasterEgg.addEventListener('click', (e) => {
      e.preventDefault();
      openDevArchiveModal();
    });
  }
  if (dom.btnCloseDevArchive) {
    dom.btnCloseDevArchive.addEventListener('click', () => closeDevArchiveModal());
  }
  if (dom.btnCloseDevArchiveFooter) {
    dom.btnCloseDevArchiveFooter.addEventListener('click', () => closeDevArchiveModal());
  }
  if (dom.devArchiveModal) {
    dom.devArchiveModal.addEventListener('click', (e) => {
      if (e.target === dom.devArchiveModal) {
        closeDevArchiveModal();
      }
    });
  }
  if (dom.avatarOptions && dom.avatarOptions.length > 0) {
    dom.avatarOptions.forEach((btn) => {
      btn.addEventListener('click', () => {
        playSFX('click');
        const chosen = btn.dataset.avatar === 'female' ? 'female' : 'male';
        if (dom.playerAvatarInput) dom.playerAvatarInput.value = chosen;
        updateMatricCardPortrait(chosen);
        dom.avatarOptions.forEach((opt) => {
          const isMatch = opt === btn;
          opt.classList.toggle('active', isMatch);
          opt.setAttribute('aria-checked', String(isMatch));
        });
      });
    });
  }

  dom.regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const trimmedName = dom.playerNameInput.value.trim();
    const trimmedMatric = dom.playerMatricInput.value.trim();
    const chosenAvatar =
      dom.playerAvatarInput && dom.playerAvatarInput.value === 'female' ? 'female' : 'male';
    const chosenGender = chosenAvatar === 'female' ? 'Perempuan' : 'Lelaki';

    if (!trimmedName) {
      dom.nameError.hidden = false;
      dom.playerNameInput.focus();
      playSFX('penalty');
      return;
    }

    dom.nameError.hidden = true;
    ensureAudioContext();
    playSFX('click');

    gameState = createInitialGameState();
    gameState.playerName = trimmedName;
    gameState.matricNo = trimmedMatric;
    gameState.avatar = chosenAvatar;
    gameState.playerGender = chosenGender;
    gameState.startTime = Date.now();
    gameState.startTimeISO = new Date(gameState.startTime).toISOString();

    const introPanels = buildIntroCutscene(gameState.playerName);
    triggerCutscene(introPanels, () => beginPlayableLabSession(true));
  });

  dom.playerNameInput.addEventListener('input', () => {
    if (dom.playerNameInput.value.trim()) {
      dom.nameError.hidden = true;
    }
  });

  // 2. Cutscene & Tutorial Interaktif 4-Langkah
  dom.cutsceneDialogueBox.addEventListener('click', (e) => {
    if (e.target === dom.btnNextCutscene) return;
    advanceCutscene();
  });

  dom.cutsceneDialogueBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advanceCutscene();
    }
  });

  dom.btnNextCutscene.addEventListener('click', () => advanceCutscene(true));
  dom.btnSkipCutscene.addEventListener('click', () => {
    playSFX('click');
    finishCutscene();
  });

  if (dom.btnNextTutorial) {
    dom.btnNextTutorial.addEventListener('click', () => {
      if (activeTutorialStep < TUTORIAL_STEPS.length - 1) {
        playSFX('click');
        activeTutorialStep += 1;
        renderTutorialStep();
      } else {
        playSFX('pickup');
        finishInteractiveTutorial();
      }
    });
  }

  if (dom.btnSkipTutorial) {
    dom.btnSkipTutorial.addEventListener('click', () => {
      playSFX('click');
      finishInteractiveTutorial();
    });
  }

  // 3. Navigasi Bilik
  dom.btnNavLeft.addEventListener('click', () => cycleRoom(-1));
  dom.btnNavRight.addEventListener('click', () => cycleRoom(1));

  // Buka kunci enjin audio & mulakan muzik latar tenang secara patuh dasar pelayar
  const startInitialAudio = (e) => {
    if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('.js-sound-toggle')) {
      return;
    }
    soundManager.unlock();
    if (!soundManager.isMuted() && !soundManager.getCurrentBGM()) {
      const onStartScreen =
        dom.registrationScreen && !dom.registrationScreen.hidden && dom.registrationScreen.classList.contains('active');
      if (onStartScreen) {
        soundManager.playBGM('calm');
      }
    }
  };
  document.addEventListener('pointerdown', startInitialAudio, { once: true });
  document.addEventListener('keydown', startInitialAudio, { once: true });

  // 4. Bunyi & Buku Nota Kuliah
  const syncSoundButtons = (isMuted) => {
    const label = isMuted ? '🔇 Senyap' : '🔊 Muzik';
    const title = isMuted ? 'Muzik & Bunyi Dimatikan' : 'Muzik & Bunyi Aktif';
    const buttons =
      dom.soundToggleButtons && dom.soundToggleButtons.length > 0
        ? dom.soundToggleButtons
        : [dom.btnSoundToggle].filter(Boolean);
    buttons.forEach((btn) => {
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute('aria-pressed', String(isMuted));
      btn.classList.toggle('is-muted', isMuted);
    });
  };
  syncSoundButtons(soundManager.isMuted());

  const handleToggleMuteClick = () => {
    const isMuted = soundManager.toggleMute();
    syncSoundButtons(isMuted);
    if (!isMuted && !soundManager.getCurrentBGM()) {
      const onStartScreen =
        dom.registrationScreen && !dom.registrationScreen.hidden && dom.registrationScreen.classList.contains('active');
      if (onStartScreen) {
        soundManager.playBGM('calm');
      }
    }
  };

  if (dom.soundToggleButtons && dom.soundToggleButtons.length > 0) {
    dom.soundToggleButtons.forEach((btn) => {
      btn.addEventListener('click', handleToggleMuteClick);
    });
  } else if (dom.btnSoundToggle) {
    dom.btnSoundToggle.addEventListener('click', handleToggleMuteClick);
  }

  dom.btnOpenNotebook.addEventListener('click', openNotebookModal);
  dom.btnCloseNotebook.addEventListener('click', () => closeNotebookModal());
  if (dom.btnCloseNotebookFooter) {
    dom.btnCloseNotebookFooter.addEventListener('click', () => closeNotebookModal());
  }
  dom.notebookModal.addEventListener('click', (e) => {
    if (e.target === dom.notebookModal) {
      closeNotebookModal();
    }
  });

  dom.notebookTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      playSFX('page');
      renderNotebookTab(tab.dataset.tab);
    });
  });

  dom.btnCloseInspect.addEventListener('click', () => {
    playSFX('click');
    closeInspectModal();
  });

  // 5. Panel Admin
  dom.btnOpenAdmin.addEventListener('click', () => {
    playSFX('click');
    dom.adminPinInput.value = '';
    dom.adminPinError.hidden = true;
    dom.adminPinModal.hidden = false;
    dom.adminPinInput.focus();
  });

  const closePinModal = () => {
    playSFX('click');
    dom.adminPinModal.hidden = true;
  };
  dom.btnClosePin.addEventListener('click', closePinModal);
  dom.btnCancelPin.addEventListener('click', closePinModal);

  dom.adminPinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPin = dom.adminPinInput.value.trim();
    if (enteredPin === ADMIN_PIN) {
      playSFX('pickup');
      dom.adminPinModal.hidden = true;
      dom.adminDashboard.hidden = false;
      refreshAdminDashboard();
    } else {
      playSFX('penalty');
      dom.adminPinError.hidden = false;
      dom.adminPinInput.select();
    }
  });

  if (dom.btnPlayTrailer) {
    dom.btnPlayTrailer.addEventListener('click', () => {
      playSFX('click');
      dom.adminDashboard.hidden = true;
      startCinematicTrailer();
    });
  }

  if (dom.btnRefreshAdmin) {
    dom.btnRefreshAdmin.addEventListener('click', () => {
      playSFX('click');
      refreshAdminDashboard();
    });
  }

  dom.btnCloseAdmin.addEventListener('click', () => {
    playSFX('click');
    dom.adminDashboard.hidden = true;
  });

  dom.btnExportCsv.addEventListener('click', () => {
    playSFX('click');
    exportRecordsToCSV();
  });

  dom.btnClearRecords.addEventListener('click', () => {
    playSFX('click');
    dom.confirmClearModal.hidden = false;
  });

  dom.btnCancelClear.addEventListener('click', () => {
    playSFX('click');
    dom.confirmClearModal.hidden = true;
  });

  dom.btnConfirmClear.addEventListener('click', () => {
    playSFX('clang');
    localStorage.removeItem(STORAGE_KEY);
    dom.confirmClearModal.hidden = true;
    refreshAdminDashboard();
  });

  // 6. Skrin Tamat Permainan & Muat Turun Sijil
  if (dom.btnDownloadCert) {
    dom.btnDownloadCert.addEventListener('click', () => {
      playSFX('click');
      downloadVictoryCertificate(lastCompletedRecord);
    });
  }

  dom.btnRetryGame.addEventListener('click', () => {
    playSFX('click');
    const prevName = gameState.playerName;
    const prevMatric = gameState.matricNo;
    const prevAvatar = gameState.avatar || 'male';
    const prevGender = gameState.playerGender || (prevAvatar === 'female' ? 'Perempuan' : 'Lelaki');
    dom.endScreen.hidden = true;

    gameState = createInitialGameState();
    gameState.playerName = prevName;
    gameState.matricNo = prevMatric;
    gameState.avatar = prevAvatar;
    gameState.playerGender = prevGender;
    gameState.startTime = Date.now();
    gameState.startTimeISO = new Date(gameState.startTime).toISOString();

    beginPlayableLabSession(false);
  });

  dom.btnBackToStart.addEventListener('click', () => {
    playSFX('click');
    resetToRegistrationScreen();
  });

  // Tutup modal menggunakan kekunci Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dom.trailerOverlay && !dom.trailerOverlay.hidden) {
      stopCinematicTrailer(true);
    } else if (dom.tutorialOverlay && !dom.tutorialOverlay.hidden) {
      playSFX('click');
      finishInteractiveTutorial();
    } else if (dom.devArchiveModal && !dom.devArchiveModal.hidden) {
      closeDevArchiveModal();
    } else if (!dom.confirmClearModal.hidden) {
      dom.confirmClearModal.hidden = true;
    } else if (!dom.notebookModal.hidden) {
      closeNotebookModal();
    } else if (!dom.inspectModal.hidden) {
      closeInspectModal();
    } else if (!dom.adminPinModal.hidden) {
      dom.adminPinModal.hidden = true;
    } else if (!dom.adminDashboard.hidden) {
      dom.adminDashboard.hidden = true;
    }
  });

  if (dom.btnCloseTrailer) {
    dom.btnCloseTrailer.addEventListener('click', () => {
      playSFX('click');
      stopCinematicTrailer(true);
    });
  }
}

// ============================================================================
// 11. MOD TRELER SINEMATIK 11-SEGMEN (37 SAAT AUTO-MAIN · ADMIN / ?trailer=1)
// ============================================================================

const trailerState = {
  isPlaying: false,
  isFinished: false,
  timers: [],
  hideCloseTimer: null,
  prevBgmTrack: null,
  activityHandler: null,
  audioUnlockHandler: null,
};

function renderTrailerTitleCardMarkup(headlineHtml) {
  return `
    <div class="trailer-title-card-screen">
      <h2 class="trailer-card-headline">${headlineHtml}</h2>
    </div>
  `;
}

function getTrailerVisualMarkup(sceneKey) {
  switch (sceneKey) {
    case 'card_1':
      return renderTrailerTitleCardMarkup('TERPERANGKAP DI DALAM MAKMAL AGRO.');

    case 'visual_1_lockdown':
      return `
        <div class="trailer-motion-wrap is-trap-fade">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="trTrapGlow" cx="50%" cy="22%" r="64%">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.78"/>
                <stop offset="50%" stop-color="#991b1b" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#04080b" stop-opacity="0"/>
              </radialGradient>
              <clipPath id="trDoorFrameClip">
                <rect x="330" y="158" width="620" height="444"/>
              </clipPath>
            </defs>
            <rect width="1280" height="720" fill="#070e12"/>
            <rect width="1280" height="720" fill="url(#trTrapGlow)"/>
            <!-- Dinding Sisi Koridor Makmal -->
            <rect x="0" y="54" width="1280" height="18" fill="#172b35" stroke="#030608" stroke-width="3"/>
            <rect x="44" y="140" width="210" height="460" rx="8" fill="#0d1b22" stroke="#040709" stroke-width="4"/>
            <rect x="1026" y="140" width="210" height="460" rx="8" fill="#0d1b22" stroke="#040709" stroke-width="4"/>
            <line x1="68" y1="220" x2="230" y2="220" stroke="#1d3542" stroke-width="4"/>
            <line x1="68" y1="300" x2="230" y2="300" stroke="#1d3542" stroke-width="4"/>
            <line x1="1050" y1="220" x2="1212" y2="220" stroke="#1d3542" stroke-width="4"/>
            <line x1="1050" y1="300" x2="1212" y2="300" stroke="#1d3542" stroke-width="4"/>
            <!-- Lantai -->
            <polygon points="0,602 1280,602 1280,720 0,720" fill="#091318" stroke="#030608" stroke-width="4"/>
            <!-- Lampu Kecemasan Merah Kiri, Tengah & Kanan -->
            <g class="anim-alarm-pulse">
              <rect x="122" y="84" width="56" height="36" rx="8" fill="#dc2626" stroke="#040709" stroke-width="3.5"/>
              <rect x="600" y="76" width="80" height="42" rx="10" fill="#dc2626" stroke="#040709" stroke-width="4"/>
              <rect x="1102" y="84" width="56" height="36" rx="8" fill="#dc2626" stroke="#040709" stroke-width="3.5"/>
              <path d="M578 96 L516 78 M702 96 L764 78 M586 118 L536 144 M694 118 L744 144" stroke="#fca5a5" stroke-width="4" stroke-linecap="round"/>
            </g>
            <!-- Papan Status Pintu -->
            <rect x="448" y="102" width="384" height="44" rx="6" fill="#7f1d1d" stroke="#040709" stroke-width="4"/>
            <text x="640" y="131" text-anchor="middle" fill="#fecaca" font-family="JetBrains Mono, monospace" font-size="18" font-weight="700" letter-spacing="1">MAKMAL AGRO · DIKUNCI</text>
            <!-- Bingkai Pintu Keluli Berat -->
            <rect x="314" y="148" width="652" height="454" rx="8" fill="#091318" stroke="#040709" stroke-width="6"/>
            <g clip-path="url(#trDoorFrameClip)">
              <!-- Daun Pintu Kiri Menghentam Masuk -->
              <g class="anim-trailer-door-left">
                <rect x="330" y="158" width="310" height="444" fill="#172832" stroke="#040709" stroke-width="4.5"/>
                <rect x="364" y="192" width="242" height="148" rx="6" fill="#0c181f" stroke="#040709" stroke-width="3.5"/>
                <rect x="364" y="366" width="242" height="204" rx="6" fill="#122129" stroke="#040709" stroke-width="3.5"/>
              </g>
              <!-- Daun Pintu Kanan Menghentam Masuk -->
              <g class="anim-trailer-door-right">
                <rect x="640" y="158" width="310" height="444" fill="#172832" stroke="#040709" stroke-width="4.5"/>
                <rect x="674" y="192" width="242" height="148" rx="6" fill="#0c181f" stroke="#040709" stroke-width="3.5"/>
                <rect x="674" y="366" width="242" height="204" rx="6" fill="#122129" stroke="#040709" stroke-width="3.5"/>
              </g>
            </g>
            <!-- Palang Kunci Keluli Menghentam Tutup -->
            <g class="anim-trailer-slam-bar">
              <rect x="284" y="352" width="712" height="48" rx="6" fill="#3a4c56" stroke="#040709" stroke-width="4.5"/>
              <rect x="582" y="336" width="116" height="80" rx="8" fill="#21313a" stroke="#040709" stroke-width="4.5"/>
              <circle cx="640" cy="376" r="16" fill="#ef4444" stroke="#040709" stroke-width="3"/>
            </g>
            <text x="116" y="316" fill="#f2b749" font-family="Fraunces, serif" font-size="54" font-weight="700" stroke="#040709" stroke-width="2.5" transform="rotate(-10 116 316)">KLANG!!</text>
            <text x="992" y="458" fill="#f2b749" font-family="Fraunces, serif" font-size="44" font-weight="700" stroke="#040709" stroke-width="2.5" transform="rotate(8 992 458)">ZAP!!</text>
          </svg>
        </div>
      `;

    case 'card_2':
      return renderTrailerTitleCardMarkup(
        'MASA SEMAKIN SUNTUK.<span class="is-red-accent">GAS BERACUN BAKAL DILEPASKAN.</span>'
      );

    case 'visual_2_gas':
      return `
        <div class="trailer-motion-wrap is-timer-zoom">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="trGasVentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ccfbf1" stop-opacity="0.82"/>
                <stop offset="60%" stop-color="#2dd4bf" stop-opacity="0.38"/>
                <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
              </linearGradient>
              <radialGradient id="trThreatRed" cx="50%" cy="18%" r="58%">
                <stop offset="0%" stop-color="#dc2626" stop-opacity="0.68"/>
                <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <rect width="1280" height="720" fill="#060d11"/>
            <rect width="1280" height="720" fill="url(#trThreatRed)"/>
            <!-- Corong Gas Beracun Berkembar Atas Siling -->
            <rect x="92" y="40" width="320" height="62" rx="6" fill="#182933" stroke="#040709" stroke-width="5"/>
            <line x1="120" y1="62" x2="384" y2="62" stroke="#040709" stroke-width="5"/>
            <line x1="120" y1="82" x2="384" y2="82" stroke="#040709" stroke-width="5"/>
            <rect x="868" y="40" width="320" height="62" rx="6" fill="#182933" stroke="#040709" stroke-width="5"/>
            <line x1="896" y1="62" x2="1160" y2="62" stroke="#040709" stroke-width="5"/>
            <line x1="896" y1="82" x2="1160" y2="82" stroke="#040709" stroke-width="5"/>
            <!-- Pancutan Gas & Awan Gas Turun dari Siling -->
            <g class="anim-vapor-jet">
              <path d="M132 102 L48 470 L328 470 L282 102 Z" fill="url(#trGasVentGrad)"/>
              <path d="M998 102 L952 470 L1232 470 L1148 102 Z" fill="url(#trGasVentGrad)"/>
            </g>
            <g class="anim-gas-drift-down">
              <ellipse cx="220" cy="240" rx="185" ry="74" fill="#99f6e4" opacity="0.28"/>
              <ellipse cx="1060" cy="250" rx="185" ry="74" fill="#5eead4" opacity="0.26"/>
            </g>
            <g class="anim-gas-drift-down-slow">
              <ellipse cx="640" cy="180" rx="280" ry="72" fill="#ccfbf1" opacity="0.18"/>
            </g>
            <g class="anim-hiss-burst">
              <text x="88" y="256" fill="#99f6e4" font-family="Fraunces, serif" font-size="44" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-10 88 256)">HSSSSS!!</text>
              <text x="960" y="246" fill="#5eead4" font-family="Fraunces, serif" font-size="42" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(9 960 246)">HSSSSS!!</text>
            </g>
            <!-- Panel Pemasa HUD Skrin Lebar Berdetik -->
            <rect x="310" y="204" width="660" height="312" rx="18" fill="#13222a" stroke="#040709" stroke-width="6"/>
            <rect x="334" y="228" width="612" height="264" rx="10" fill="#1c090e" stroke="#dc3545" stroke-width="3.5"/>
            <text x="640" y="284" text-anchor="middle" fill="#fca5a5" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700" letter-spacing="2">GAS BERACUN DILEPASKAN</text>
            <text id="trailer-live-countdown" class="anim-alarm-timer" x="640" y="408" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="122" font-weight="700">10:00</text>
            <text x="640" y="462" text-anchor="middle" fill="#ff7b89" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="700" letter-spacing="1">PROTOKOL PENSTERILAN MAKMAL AGRO AKTIF</text>
            <!-- Kabus Bawah -->
            <g class="anim-mist-rise">
              <ellipse cx="280" cy="635" rx="280" ry="74" fill="#5eead4" opacity="0.22"/>
              <ellipse cx="640" cy="655" rx="340" ry="78" fill="#99f6e4" opacity="0.2"/>
              <ellipse cx="1000" cy="635" rx="280" ry="74" fill="#5eead4" opacity="0.22"/>
            </g>
          </svg>
        </div>
      `;

    case 'card_3':
      return renderTrailerTitleCardMarkup(
        'UJI ILMU SAINS PERTANIAN ANDA UNTUK MENCARI JALAN KELUAR.'
      );

    case 'visual_3_npk':
      return `
        <div class="trailer-motion-wrap trailer-beat-npk">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="trGrowLight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.34"/>
                <stop offset="55%" stop-color="#1e6b7b" stop-opacity="0.16"/>
                <stop offset="100%" stop-color="#081217" stop-opacity="0"/>
              </linearGradient>
              <radialGradient id="trNpkSpot" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#f2b749" stop-opacity="0.36"/>
                <stop offset="100%" stop-color="#f2b749" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <rect width="1280" height="720" fill="#09151b"/>
            <rect width="1280" height="720" fill="url(#trGrowLight)"/>

            <!-- Dinding & Rak Makmal B1/B2 -->
            <rect x="64" y="106" width="248" height="240" rx="8" fill="#0d1e26" stroke="#040709" stroke-width="4"/>
            <line x1="64" y1="186" x2="312" y2="186" stroke="#18323f" stroke-width="4"/>
            <line x1="64" y1="266" x2="312" y2="266" stroke="#18323f" stroke-width="4"/>
            <rect x="968" y="106" width="248" height="240" rx="8" fill="#0d1e26" stroke="#040709" stroke-width="4"/>
            <line x1="968" y1="186" x2="1216" y2="186" stroke="#18323f" stroke-width="4"/>
            <line x1="968" y1="266" x2="1216" y2="266" stroke="#18323f" stroke-width="4"/>

            <!-- Lampu Rumah Hijau -->
            <rect x="220" y="34" width="840" height="28" rx="6" fill="#233742" stroke="#040709" stroke-width="4"/>
            <rect x="246" y="54" width="788" height="10" rx="3" fill="#c084fc" stroke="#040709" stroke-width="2"/>

            <!-- Meja Makmal & Rak Baja -->
            <rect x="0" y="424" width="1280" height="176" fill="#14262f" stroke="#040709" stroke-width="5"/>
            <rect x="0" y="424" width="1280" height="18" fill="#1d3845" stroke="#040709" stroke-width="3"/>

            <!-- Prop Latar: Pasu Semaian Kiri & Peralatan Kanan (Redup) -->
            <g opacity="0.65">
              <polygon points="150,368 242,368 228,424 164,424" fill="#8b4d2b" stroke="#040709" stroke-width="3.5"/>
              <path d="M196 368 L196 276" stroke="#6f9c3d" stroke-width="6" stroke-linecap="round"/>
              <path d="M196 322 Q152 302 138 320 Q164 338 196 328 Z" fill="#a8c256" stroke="#040709" stroke-width="2.5"/>
              <path d="M196 314 Q240 294 254 312 Q228 330 196 320 Z" fill="#2ea877" stroke="#040709" stroke-width="2.5"/>

              <rect x="960" y="330" width="96" height="94" rx="8" fill="#1b3340" stroke="#040709" stroke-width="3.5"/>
              <rect x="976" y="352" width="64" height="36" rx="4" fill="#e7dcc3"/>
              <rect x="1084" y="348" width="72" height="76" rx="6" fill="#21404e" stroke="#040709" stroke-width="3.5"/>
            </g>

            <!-- Sorotan Meja Di Bawah Beg Baja NPK -->
            <ellipse cx="640" cy="436" rx="140" ry="26" fill="url(#trNpkSpot)"/>

            <!-- Bar Inventori Bawah -->
            <g>
              <rect x="176" y="572" width="928" height="128" rx="14" fill="#091318" stroke="#2a7f8e" stroke-width="3"/>
              <text x="206" y="598" fill="#9bb3bd" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700" letter-spacing="1.4">INVENTORI MAKMAL</text>

              <!-- 5 Slot Inventori -->
              <rect x="292" y="608" width="118" height="78" rx="10" fill="#0e1e26" stroke="#1e3c4a" stroke-width="2.5"/>
              <rect x="434" y="608" width="118" height="78" rx="10" fill="#0e1e26" stroke="#1e3c4a" stroke-width="2.5"/>
              <!-- Slot Aktif Tengah (Sasaran Baja NPK): center (640, 647) -->
              <rect class="anim-inv-slot-activate" x="576" y="604" width="128" height="84" rx="12" fill="#0f252b" stroke="#34d399" stroke-width="3"/>
              <rect x="728" y="608" width="118" height="78" rx="10" fill="#0e1e26" stroke="#1e3c4a" stroke-width="2.5"/>
              <rect x="870" y="608" width="118" height="78" rx="10" fill="#0e1e26" stroke="#1e3c4a" stroke-width="2.5"/>

              <!-- Ikon Mini Buku Nota dalam Slot 1 -->
              <rect x="331" y="622" width="40" height="48" rx="4" fill="#3a2a1d" stroke="#040709" stroke-width="2"/>
              <rect x="338" y="630" width="26" height="12" rx="2" fill="#e7dcc3"/>
            </g>

            <!-- Beg Baja NPK (Terangkat & Terbang Masuk ke Slot Tengah: 640,322 -> 640,647) -->
            <g transform="translate(640, 322)">
              <g class="anim-npk-bag-pickup">
                <!-- Badan Beg Baja -->
                <path d="M-66 -62 L-50 -86 L50 -86 L66 -62 L76 74 Q76 92 56 92 L-56 92 Q-76 92 -76 74 Z" fill="#195c48" stroke="#040709" stroke-width="5"/>
                <!-- Bahagian Atas Beg Berkedut -->
                <path d="M-54 -86 L-44 -104 L44 -104 L54 -86 Z" fill="#2ea877" stroke="#040709" stroke-width="4"/>
                <line x1="-42" y1="-86" x2="42" y2="-86" stroke="#f2b749" stroke-width="4"/>
                <!-- Label Beg -->
                <rect x="-56" y="-44" width="112" height="106" rx="8" fill="#e7dcc3" stroke="#040709" stroke-width="3.5"/>
                <rect x="-56" y="-44" width="112" height="28" rx="6" fill="#d99b38" stroke="#040709" stroke-width="2.5"/>
                <text x="0" y="-24" text-anchor="middle" fill="#040709" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700" letter-spacing="1">BAJA</text>
                <text x="0" y="20" text-anchor="middle" fill="#071a14" font-family="Fraunces, serif" font-size="38" font-weight="700">NPK</text>
                <rect x="-40" y="34" width="80" height="18" rx="4" fill="#122b23"/>
                <text x="0" y="47" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">N · P · K</text>
              </g>
            </g>

            <!-- Kesan Gelombang Ketikan & Kursor pada Beg BAJA NPK -->
            <g transform="translate(648, 336)">
              <circle class="anim-npk-tap-ring" cx="0" cy="0" r="24" fill="none" stroke="#f2b749" stroke-width="4"/>
              <circle class="anim-npk-tap-ring-delay" cx="0" cy="0" r="24" fill="none" stroke="#6ee7b7" stroke-width="3"/>
              <g class="anim-npk-tap-cursor">
                <polygon points="0,0 8,42 18,30 34,44 41,37 25,23 39,17" fill="#ffffff" stroke="#040709" stroke-width="3" stroke-linejoin="round"/>
              </g>
            </g>

            <!-- Lencana Toast "Item Diperoleh: Baja NPK" -->
            <g transform="translate(640, 108)">
              <g class="anim-npk-toast">
                <rect x="-252" y="-28" width="504" height="56" rx="12" fill="#072821" stroke="#34d399" stroke-width="3"/>
                <circle cx="-214" cy="0" r="15" fill="#2ea877" stroke="#040709" stroke-width="2"/>
                <path d="M-221 0 L-216 5 L-207 -5" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                <text x="16" y="7" text-anchor="middle" fill="#ecfdf5" font-family="JetBrains Mono, monospace" font-size="21" font-weight="700" letter-spacing="0.8">Item Diperoleh: Baja NPK</text>
              </g>
            </g>
          </svg>
        </div>
      `;

    case 'visual_3_ph':
      return `
        <div class="trailer-motion-wrap is-puzzle-pop">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="trPhConfirmAura" cx="50%" cy="42%" r="54%">
                <stop offset="0%" stop-color="#22c55e" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#0d1a21" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <rect width="1280" height="720" fill="#0d1a21"/>
            <rect class="anim-ph-confirm-glow" width="1280" height="720" fill="url(#trPhConfirmAura)"/>
            <rect x="340" y="48" width="600" height="48" rx="8" fill="#071217" stroke="#67e8f9" stroke-width="2.5"/>
            <text x="640" y="80" text-anchor="middle" fill="#7ee0eb" font-family="JetBrains Mono, monospace" font-size="21" font-weight="700" letter-spacing="1.5">ANALISIS METER pH TANAH</text>
            <!-- Meja Makmal -->
            <rect x="0" y="516" width="1280" height="204" fill="#13242c" stroke="#040709" stroke-width="5"/>
            <!-- Meter pH Sebelah Kiri (Besar) -->
            <g transform="translate(110, 146)">
              <rect x="0" y="0" width="380" height="410" rx="18" fill="#213a46" stroke="#040709" stroke-width="6"/>
              <rect class="anim-ph-confirm-glow" x="-6" y="-6" width="392" height="422" rx="22" fill="none" stroke="#34d399" stroke-width="4"/>
              <rect x="28" y="28" width="324" height="194" rx="10" fill="#071419" stroke="#040709" stroke-width="4"/>
              <path d="M68 182 A122 122 0 0 1 312 182" fill="none" stroke="#334155" stroke-width="16" stroke-linecap="round"/>
              <path d="M68 182 A122 122 0 0 1 142 74" fill="none" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
              <path d="M148 72 A122 122 0 0 1 232 72" fill="none" stroke="#22c55e" stroke-width="12" stroke-linecap="round"/>
              <path d="M238 74 A122 122 0 0 1 312 182" fill="none" stroke="#38bdf8" stroke-width="12" stroke-linecap="round"/>
              <path class="anim-ph-confirm-glow" d="M148 72 A122 122 0 0 1 232 72" fill="none" stroke="#86efac" stroke-width="18" stroke-linecap="round" opacity="0.55"/>
              <polygon class="anim-ph-needle" points="184,182 196,182 190,68" fill="#f2b749" stroke="#040709" stroke-width="2"/>
              <circle cx="190" cy="182" r="13" fill="#e7dcc3" stroke="#040709" stroke-width="3"/>
              <text x="190" y="274" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="38" font-weight="700">pH 4.2 → 6.2</text>
              <rect x="44" y="302" width="292" height="42" rx="6" fill="#083329" stroke="#34d399" stroke-width="2.5"/>
              <text x="190" y="329" text-anchor="middle" fill="#a7f3d0" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">SASARAN OPTIMUM TERKUNCI</text>
              <circle cx="110" cy="378" r="13" fill="#2ea877" stroke="#040709" stroke-width="3"/>
              <circle cx="190" cy="378" r="13" fill="#d99b38" stroke="#040709" stroke-width="3"/>
              <circle cx="270" cy="378" r="13" fill="#2a7f8e" stroke="#040709" stroke-width="3"/>
            </g>
            <!-- 3 Bikar Tanah Besar Sebelah Kanan -->
            <g transform="translate(560, 290) scale(1.42)">
              <rect width="112" height="140" rx="8" fill="rgba(126,224,235,0.16)" stroke="#040709" stroke-width="4"/>
              <path d="M5 72 Q56 62 107 72 L107 136 L5 136 Z" fill="#2c1d16" stroke="#040709" stroke-width="2"/>
              <text x="56" y="166" text-anchor="middle" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">S1 GAMBUT</text>
            </g>
            <g transform="translate(780, 290) scale(1.42)">
              <rect width="112" height="140" rx="8" fill="rgba(126,224,235,0.16)" stroke="#34d399" stroke-width="4"/>
              <path d="M5 70 Q56 60 107 70 L107 136 L5 136 Z" fill="#6d4c34" stroke="#040709" stroke-width="2"/>
              <text x="56" y="166" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">S2 ALUVIUM</text>
            </g>
            <g transform="translate(1000, 290) scale(1.42)">
              <rect width="112" height="140" rx="8" fill="rgba(126,224,235,0.16)" stroke="#040709" stroke-width="4"/>
              <path d="M5 72 Q56 62 107 72 L107 136 L5 136 Z" fill="#cec5ae" stroke="#040709" stroke-width="2"/>
              <text x="56" y="166" text-anchor="middle" fill="#f2b749" font-family="JetBrains Mono, monospace" font-size="12.5" font-weight="700">S3 BERKAPUR</text>
            </g>
          </svg>
        </div>
      `;

    case 'visual_3_usda': {
      const polyClay = triPoly([[100,0,0],[55,0,45],[40,15,45],[40,40,20],[60,40,0]]);
      const polySiltyClay = triPoly([[60,40,0],[40,40,20],[40,60,0]]);
      const polySandyClay = triPoly([[55,0,45],[35,0,65],[35,20,45],[40,15,45]]);
      const polyClayLoam = triPoly([[40,15,45],[27,28,45],[27,53,20],[40,40,20]]);
      const polySiltyClayLoam = triPoly([[40,40,20],[27,53,20],[27,73,0],[40,60,0]]);
      const polySandyClayLoam = triPoly([[35,0,65],[20,0,80],[20,28,52],[27,28,45],[35,20,45]]);
      const polyLoam = triPoly([[27,28,45],[27,50,23],[7,50,43],[7,41,52],[20,28,52]]);
      const polySiltLoam = triPoly([[27,50,23],[27,73,0],[12,88,0],[12,80,8],[0,80,20],[0,50,50],[12,50,38]]);
      const polySilt = triPoly([[12,88,0],[0,100,0],[0,80,20],[12,80,8]]);
      const polySandyLoam = triPoly([[20,0,80],[20,28,52],[7,41,52],[7,50,43],[0,50,50],[0,30,70],[15,0,85]]);
      const polyLoamySand = triPoly([[15,0,85],[0,30,70],[0,15,85],[10,0,90]]);
      const polySand = triPoly([[10,0,90],[0,15,85],[0,0,100]]);
      const cA = triPointXY(20, 0);
      const cB = triPointXY(20, 80);
      const sA = triPointXY(60, 40);
      const sB = triPointXY(0, 40);
      const pA = triPointXY(60, 0);
      const pB = triPointXY(0, 60);
      const inter = triPointXY(20, 40);
      return `
        <div class="trailer-motion-wrap trailer-usda-scene">
          <!-- Latar Dalaman Makmal Agro (B1/B2) Dikaburkan Secara Lembut -->
          <div class="trailer-usda-bg-blur" aria-hidden="true">
            <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
              <rect width="1280" height="720" fill="#09151b"/>
              <rect x="0" y="0" width="1280" height="120" fill="#0d1e26"/>
              <rect x="200" y="34" width="880" height="28" rx="6" fill="#233742" stroke="#040709" stroke-width="4"/>
              <rect x="230" y="54" width="820" height="10" rx="3" fill="#c084fc"/>
              <!-- Tingkap Rumah Hijau & Rak Spesimen B1/B2 -->
              <rect x="70" y="130" width="320" height="310" rx="10" fill="#0c2029" stroke="#1d3c4a" stroke-width="5"/>
              <line x1="230" y1="130" x2="230" y2="440" stroke="#1d3c4a" stroke-width="4"/>
              <line x1="70" y1="285" x2="390" y2="285" stroke="#1d3c4a" stroke-width="4"/>
              <rect x="890" y="130" width="320" height="310" rx="10" fill="#0c2029" stroke="#1d3c4a" stroke-width="5"/>
              <line x1="890" y1="230" x2="1210" y2="230" stroke="#1d3c4a" stroke-width="4"/>
              <line x1="890" y1="330" x2="1210" y2="330" stroke="#1d3c4a" stroke-width="4"/>
              <!-- Meja Analisis Tanah -->
              <rect x="0" y="472" width="1280" height="248" fill="#13252e" stroke="#040709" stroke-width="5"/>
              <rect x="140" y="368" width="90" height="104" rx="8" fill="#1d6fa5"/>
              <rect x="260" y="384" width="76" height="88" rx="8" fill="#2ea877"/>
              <rect x="960" y="364" width="120" height="108" rx="8" fill="#213a46"/>
              <rect x="1106" y="388" width="80" height="84" rx="8" fill="#d99b38"/>
            </svg>
          </div>
          <div class="trailer-usda-backdrop-dim" aria-hidden="true"></div>

          <!-- Helaian Kertas Petunjuk Terbuka Di Tengah Skrin -->
          <div class="trailer-usda-paper-wrap">
            <div class="trailer-usda-paper-sheet">
              <svg viewBox="0 0 980 580" preserveAspectRatio="xMidYMid meet">
                <rect x="8" y="8" width="964" height="564" rx="16" fill="#ece0c6" stroke="#040709" stroke-width="6"/>
                <rect x="24" y="24" width="932" height="532" rx="10" fill="#f3ead4" stroke="#8a7248" stroke-width="2" stroke-dasharray="8 6"/>
                <!-- Garisan Lipatan Kertas Halus -->
                <line x1="24" y1="290" x2="956" y2="290" stroke="#bfa87d" stroke-opacity="0.45" stroke-width="2"/>
                <line x1="490" y1="24" x2="490" y2="556" stroke="#bfa87d" stroke-opacity="0.32" stroke-width="1.5"/>

                <!-- Tajuk Nota Kertas -->
                <rect x="190" y="34" width="600" height="44" rx="8" fill="#102128" stroke="#040709" stroke-width="3"/>
                <text x="490" y="63" text-anchor="middle" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700" letter-spacing="1.2">SEGITIGA TEKSTUR TANAH USDA</text>

                <!-- Rajah Segi Tiga USDA Di Dalam Kertas (Kiri) -->
                <g transform="translate(52, 92) scale(0.95)">
                  <rect x="8" y="8" width="504" height="436" rx="14" fill="#0d181e" stroke="#040709" stroke-width="4"/>
                  <g stroke="#040709" stroke-width="1.8">
                    <polygon points="${polyClay}" fill="#9b4d4d"/>
                    <polygon points="${polySiltyClay}" fill="#7c566d"/>
                    <polygon points="${polySandyClay}" fill="#a85c48"/>
                    <polygon points="${polyClayLoam}" fill="#8e774f"/>
                    <polygon points="${polySiltyClayLoam}" fill="#5e7874"/>
                    <polygon points="${polySandyClayLoam}" fill="#9c7e47"/>
                    <polygon class="anim-usda-highlight" points="${polyLoam}" fill="#22c55e" stroke="#fef08a"/>
                    <polygon points="${polySiltLoam}" fill="#487c82"/>
                    <polygon points="${polySilt}" fill="#3a6b73"/>
                    <polygon points="${polySandyLoam}" fill="#8a8b53"/>
                    <polygon points="${polyLoamySand}" fill="#b59d54"/>
                    <polygon points="${polySand}" fill="#ceb05a"/>
                  </g>
                  <polygon points="${triPoint(100,0,0)} ${triPoint(0,0,100)} ${triPoint(0,100,0)}" fill="none" stroke="#e7dcc3" stroke-width="2.5"/>
                  <line x1="${cA.x.toFixed(1)}" y1="${cA.y.toFixed(1)}" x2="${cB.x.toFixed(1)}" y2="${cB.y.toFixed(1)}" stroke="#f87171" stroke-width="3" stroke-dasharray="6 4"/>
                  <line x1="${sA.x.toFixed(1)}" y1="${sA.y.toFixed(1)}" x2="${sB.x.toFixed(1)}" y2="${sB.y.toFixed(1)}" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6 4"/>
                  <line x1="${pA.x.toFixed(1)}" y1="${pA.y.toFixed(1)}" x2="${pB.x.toFixed(1)}" y2="${pB.y.toFixed(1)}" stroke="#fbbf24" stroke-width="3" stroke-dasharray="6 4"/>
                  <circle cx="${inter.x.toFixed(1)}" cy="${inter.y.toFixed(1)}" r="14" fill="#f2b749" fill-opacity="0.45" stroke="#040709" stroke-width="2" class="anim-npk-pulse"/>
                  <circle cx="${inter.x.toFixed(1)}" cy="${inter.y.toFixed(1)}" r="6" fill="#fef08a" stroke="#040709" stroke-width="2"/>
                  <text x="115" y="206" text-anchor="middle" fill="#fca5a5" font-size="11.5" font-weight="700" transform="rotate(-60 115 206)">% LIAT</text>
                  <text x="408" y="206" text-anchor="middle" fill="#7dd3fc" font-size="11.5" font-weight="700" transform="rotate(60 408 206)">% KELODAK</text>
                  <text x="260" y="424" text-anchor="middle" fill="#fde68a" font-size="11.5" font-weight="700">← % PASIR</text>
                </g>

                <!-- Catatan Analisis Sampel Di Kanan Kertas -->
                <g transform="translate(574, 118)">
                  <rect x="0" y="0" width="352" height="390" rx="14" fill="#0d1e25" stroke="#040709" stroke-width="4"/>
                  <text x="176" y="48" text-anchor="middle" fill="#9bb3bd" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700" letter-spacing="1.2">REKOD SAMPEL TANAH</text>
                  <rect x="26" y="76" width="300" height="54" rx="8" fill="#132a33" stroke="#f2b749" stroke-width="2"/>
                  <text x="176" y="110" text-anchor="middle" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700">40% PASIR</text>
                  <rect x="26" y="148" width="300" height="54" rx="8" fill="#132a33" stroke="#38bdf8" stroke-width="2"/>
                  <text x="176" y="182" text-anchor="middle" fill="#7dd3fc" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700">40% KELODAK</text>
                  <rect x="26" y="220" width="300" height="54" rx="8" fill="#132a33" stroke="#f87171" stroke-width="2"/>
                  <text x="176" y="254" text-anchor="middle" fill="#fca5a5" font-family="JetBrains Mono, monospace" font-size="22" font-weight="700">20% LIAT</text>
                  <rect x="26" y="302" width="300" height="56" rx="8" fill="#083329" stroke="#34d399" stroke-width="2.5"/>
                  <text x="176" y="337" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="21" font-weight="700">KELAS: TANAH LOM</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      `;
    }

    case 'card_4':
      return renderTrailerTitleCardMarkup('BONGKAR RAHSIA BILIK KEBAL MAKMAL AGRO.');

    case 'visual_4_bookshelf':
      return `
        <div class="trailer-motion-wrap">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="trSecretGlow" cx="38%" cy="48%" r="54%">
                <stop offset="0%" stop-color="#34d399" stop-opacity="0.9"/>
                <stop offset="56%" stop-color="#1d615c" stop-opacity="0.34"/>
                <stop offset="100%" stop-color="#050b0e" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <rect width="1280" height="720" fill="#081217"/>
            <rect class="anim-trailer-emerald-spill" width="1280" height="720" fill="url(#trSecretGlow)"/>
            <!-- Lantai & Panel Dinding Sisi -->
            <rect x="0" y="584" width="1280" height="136" fill="#091115" stroke="#040709" stroke-width="4"/>
            <rect x="58" y="132" width="220" height="410" rx="8" fill="#0d1a21" stroke="#040709" stroke-width="4"/>
            <rect x="1002" y="132" width="220" height="410" rx="8" fill="#0d1a21" stroke="#040709" stroke-width="4"/>
            <!-- Pintu Rahsia Terdedah Di Belakang Rak -->
            <rect x="330" y="96" width="330" height="488" fill="#051312" stroke="#040709" stroke-width="6"/>
            <rect x="358" y="122" width="274" height="462" fill="#082823" stroke="#34d399" stroke-width="3"/>
            <polygon points="384,584 606,584 562,402 428,402" fill="#134e44" opacity="0.72"/>
            <circle cx="495" cy="272" r="78" fill="#34d399" opacity="0.22"/>
            <rect x="380" y="152" width="230" height="42" rx="6" fill="#071a17" stroke="#6ee7b7" stroke-width="2.5"/>
            <text x="495" y="179" text-anchor="middle" fill="#6ee7b7" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">BILIK RAHSIA MAKMAL AGRO</text>
            <!-- Rak Buku Keluli Berat Bergeser Ke Kanan -->
            <g class="anim-trailer-bookshelf-slide">
              <rect x="322" y="88" width="346" height="496" rx="6" fill="#1c323c" stroke="#040709" stroke-width="6"/>
              <rect x="346" y="116" width="298" height="118" fill="#0e1b22" stroke="#040709" stroke-width="3.5"/>
              <rect x="346" y="256" width="298" height="118" fill="#0e1b22" stroke="#040709" stroke-width="3.5"/>
              <rect x="346" y="396" width="298" height="148" fill="#0e1b22" stroke="#040709" stroke-width="3.5"/>
              <rect x="368" y="142" width="32" height="78" fill="#8b4d2b" stroke="#040709" stroke-width="2.5"/>
              <rect x="408" y="132" width="38" height="88" fill="#2a7f8e" stroke="#040709" stroke-width="2.5"/>
              <rect x="454" y="150" width="28" height="70" fill="#d99b38" stroke="#040709" stroke-width="2.5"/>
              <rect x="374" y="282" width="44" height="82" fill="#7f1d1d" stroke="#040709" stroke-width="2.5"/>
              <rect x="428" y="290" width="34" height="74" fill="#1e544a" stroke="#040709" stroke-width="2.5"/>
            </g>
            <text x="108" y="122" fill="#f2b749" font-family="Fraunces, serif" font-size="46" font-weight="700" stroke="#040709" stroke-width="2" transform="rotate(-8 108 122)">GRRKKK...</text>
          </svg>
        </div>
      `;

    case 'card_5':
      return renderTrailerTitleCardMarkup('ADAKAH ANDA SEMPAT MELARIKAN DIRI...');

    case 'visual_5_collapse': {
      const portraitSVG = getPlayerPortraitSVG(gameState.avatar || 'male', 'dizzy');
      return `
        <div class="trailer-motion-wrap is-collapse-pulse">
          <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="trGoAlarmGlow" cx="50%" cy="22%" r="64%">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.88"/>
                <stop offset="56%" stop-color="#991b1b" stop-opacity="0.34"/>
                <stop offset="100%" stop-color="#05080a" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="trGoJetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ccfbf1" stop-opacity="0.72"/>
                <stop offset="100%" stop-color="#5eead4" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <rect width="1280" height="720" fill="#070a0d"/>
            <rect class="anim-alarm-pulse" width="1280" height="720" fill="url(#trGoAlarmGlow)"/>
            <!-- Corong Gas Kiri & Kanan -->
            <rect x="120" y="34" width="280" height="48" rx="6" fill="#18242b" stroke="#040709" stroke-width="5"/>
            <rect x="880" y="34" width="280" height="48" rx="6" fill="#18242b" stroke="#040709" stroke-width="5"/>
            <g class="anim-vapor-jet">
              <path d="M160 82 L84 360 L330 360 L290 82 Z" fill="url(#trGoJetGrad)"/>
              <path d="M990 82 L950 360 L1196 360 L1120 82 Z" fill="url(#trGoJetGrad)"/>
            </g>
            <!-- Panel Penggera 00:00 di Kiri -->
            <rect x="116" y="182" width="520" height="270" rx="16" fill="#141e24" stroke="#040709" stroke-width="6"/>
            <rect x="138" y="204" width="476" height="226" rx="10" fill="#23080d" stroke="#ef4444" stroke-width="3.5"/>
            <text x="376" y="256" text-anchor="middle" fill="#fca5a5" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">BAHAYA: GAS BERACUN DILEPASKAN</text>
            <text class="anim-alarm-timer" x="376" y="382" text-anchor="middle" fill="#ff4d5a" font-family="JetBrains Mono, monospace" font-size="112" font-weight="700">00:00</text>
            <!-- Potret Pelajar Rebah Kabur di Kanan -->
            <g transform="translate(766, 152)">
              <rect x="0" y="0" width="290" height="290" rx="145" fill="#131c24" stroke="#dc3545" stroke-width="6"/>
              <svg x="20" y="20" width="250" height="250" viewBox="0 0 64 64">${portraitSVG}</svg>
            </g>
            <text x="911" y="502" text-anchor="middle" fill="#fecaca" font-family="Fraunces, serif" font-size="28" font-style="italic" font-weight="700">"Pandangan aku mula kabur..."</text>
            <ellipse cx="320" cy="610" rx="340" ry="76" fill="#5eead4" opacity="0.18"/>
            <ellipse cx="940" cy="630" rx="340" ry="82" fill="#99f6e4" opacity="0.16"/>
          </svg>
        </div>
      `;
    }

    case 'visual_6_title':
    default:
      return `
        <div class="trailer-motion-wrap is-title-glow trailer-final-scene">
          <svg class="trailer-final-backdrop-svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <radialGradient id="trTitleAura" cx="50%" cy="44%" r="60%">
                <stop offset="0%" stop-color="#2ea877" stop-opacity="0.46"/>
                <stop offset="48%" stop-color="#f2b749" stop-opacity="0.22"/>
                <stop offset="100%" stop-color="#04080b" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <rect width="1280" height="720" fill="#050b0e"/>
            <rect width="1280" height="720" fill="url(#trTitleAura)"/>
            <!-- Bingkai Emas & Zamrud Skrin Lebar -->
            <rect x="34" y="30" width="1212" height="660" rx="20" fill="none" stroke="#f2b749" stroke-opacity="0.48" stroke-width="3"/>
            <rect x="48" y="44" width="1184" height="632" rx="14" fill="none" stroke="#2ea877" stroke-opacity="0.38" stroke-width="1.5"/>
          </svg>

          <div class="trailer-final-foreground">
            <div class="trailer-final-emblem-wrap" aria-hidden="true">
              <svg class="trailer-final-emblem" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="64" fill="#0d2229" stroke="#f2b749" stroke-width="3.5"/>
                <circle cx="70" cy="70" r="52" fill="none" stroke="#34d399" stroke-opacity="0.45" stroke-width="1.5"/>
                <path d="M70 110 L70 42" stroke="#6ee7b7" stroke-width="5" stroke-linecap="round"/>
                <path d="M70 76 Q28 56 20 30 Q54 34 70 62 Z" fill="#2ea877" stroke="#040709" stroke-width="2.5"/>
                <path d="M70 66 Q112 46 120 20 Q86 24 70 52 Z" fill="#f2b749" stroke="#040709" stroke-width="2.5"/>
              </svg>
            </div>

            <h2 class="trailer-final-title">ESCAPE: MAKMAL AGRO</h2>
            <div class="trailer-final-divider" aria-hidden="true"></div>
            <p class="trailer-final-subtitle">Permainan Escape Room 2D · Sains Pertanian</p>

            <div class="trailer-final-qr-banner">
              <img
                class="trailer-final-qr-img"
                src="./Escape-Makmal-Agro.png"
                alt="Imbas Kod QR untuk bermain Escape: Makmal Agro"
                onerror="this.onerror=null;this.src='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://effastudent.github.io/misteri-makmal-agro/';"
              />
              <div class="trailer-final-qr-copy">
                <span class="trailer-final-qr-eyebrow">IMBAS KOD QR &amp;</span>
                <span class="trailer-final-qr-cta">MAIN SEKARANG!</span>
              </div>
            </div>
          </div>
        </div>
      `;
  }
}

function clearTrailerTimers() {
  while (trailerState.timers.length > 0) {
    clearTimeout(trailerState.timers.pop());
  }
  if (trailerState.hideCloseTimer) {
    clearTimeout(trailerState.hideCloseTimer);
    trailerState.hideCloseTimer = null;
  }
}

function scheduleTrailerStep(delayMs, fn) {
  const id = setTimeout(() => {
    if (!trailerState.isPlaying) return;
    fn();
  }, delayMs);
  trailerState.timers.push(id);
}

function setTrailerStrobeMode(mode = '') {
  if (!dom.trailerStrobeLayer) return;
  dom.trailerStrobeLayer.className = 'trailer-strobe-layer';
  if (!mode) return;
  void dom.trailerStrobeLayer.offsetWidth;
  dom.trailerStrobeLayer.classList.add(mode);
}

function setTrailerOverlayPhrase(htmlText = '') {
  if (!dom.trailerOverlayText) return;
  if (!htmlText) {
    dom.trailerOverlayText.hidden = true;
    dom.trailerOverlayText.innerHTML = '';
    return;
  }
  dom.trailerOverlayText.hidden = false;
  dom.trailerOverlayText.innerHTML = `<p class="trailer-overlay-phrase">${htmlText}</p>`;
}

function revealCloseTrailerTemporarily(autoHide = true) {
  if (!dom.btnCloseTrailer) return;
  dom.btnCloseTrailer.classList.remove('is-autohidden');
  if (trailerState.hideCloseTimer) {
    clearTimeout(trailerState.hideCloseTimer);
    trailerState.hideCloseTimer = null;
  }
  if (autoHide && trailerState.isPlaying && !trailerState.isFinished) {
    trailerState.hideCloseTimer = setTimeout(() => {
      if (trailerState.isPlaying && !trailerState.isFinished && dom.btnCloseTrailer) {
        dom.btnCloseTrailer.classList.add('is-autohidden');
      }
    }, 2000);
  }
}

function startCinematicTrailer() {
  if (!dom.trailerOverlay || !dom.trailerVisualLayer) return;

  stopCinematicTrailer(false);
  trailerState.isPlaying = true;
  trailerState.isFinished = false;
  trailerState.prevBgmTrack = soundManager.getCurrentBGM();

  dom.trailerOverlay.hidden = false;
  setTrailerOverlayPhrase('');

  soundManager.unlock();
  soundManager.playBGM('tense');

  // Jika dibuka terus melalui ?trailer=1 dan pelayar menyekat audio tanpa sentuhan awal, buka kunci pada klik pertama
  const resumeAudioIfNeeded = () => {
    if (!trailerState.isPlaying) return;
    soundManager.unlock();
    if (!soundManager.isMuted() && !soundManager.getCurrentBGM() && !trailerState.isFinished) {
      soundManager.playBGM('tense');
    }
  };
  trailerState.audioUnlockHandler = resumeAudioIfNeeded;
  document.addEventListener('pointerdown', resumeAudioIfNeeded, { once: true });
  document.addEventListener('keydown', resumeAudioIfNeeded, { once: true });

  // Tunjukkan butang Tutup buat seketika dan sembunyikan secara automatik selepas 2 saat
  revealCloseTrailerTemporarily(true);
  const handleActivity = () => {
    if (!trailerState.isPlaying || trailerState.isFinished) return;
    revealCloseTrailerTemporarily(true);
  };
  trailerState.activityHandler = handleActivity;
  dom.trailerOverlay.addEventListener('mousemove', handleActivity);
  dom.trailerOverlay.addEventListener('touchstart', handleActivity, { passive: true });

  const renderVisual = (key, strobeMode = '', { impactShake = false, overlayPhrase = '' } = {}) => {
    if (dom.trailerStage) {
      dom.trailerStage.classList.toggle('is-impact-shake', Boolean(impactShake));
    }
    dom.trailerVisualLayer.innerHTML = getTrailerVisualMarkup(key);
    setTrailerStrobeMode(strobeMode);
    setTrailerOverlayPhrase(overlayPhrase);
  };

  // SEGMEN 1 (0–2.5s): Kad Tajuk 1 (Hitam Tulen — tepat 2.5 saat)
  renderVisual('card_1', '');

  // SEGMEN 2 (2.5–4.6s): Visual 1 — Pintu keluli berat menghentam tutup pantas (2.1s) + gegaran skrin + strob merah
  scheduleTrailerStep(2500, () => {
    renderVisual('visual_1_lockdown', 'is-red-strobe', { impactShake: true });
  });
  scheduleTrailerStep(2740, () => soundManager.playDoorSlamLock());
  scheduleTrailerStep(3120, () => soundManager.playAlarm());

  // SEGMEN 3 (4.6–7.6s): Kad Tajuk 2 (Hitam Tulen)
  scheduleTrailerStep(4600, () => {
    renderVisual('card_2', '');
    soundManager.playTick(true);
  });

  // SEGMEN 4 (7.6–11.1s): Visual 2 — Pemasa merah berdetik (10:00 -> 09:57) & gas beracun turun dari siling
  scheduleTrailerStep(7600, () => {
    renderVisual('visual_2_gas', '');
    soundManager.playAlarm();
    soundManager.playGasHiss();
  });
  scheduleTrailerStep(8350, () => {
    const el = document.getElementById('trailer-live-countdown');
    if (el) el.textContent = '09:59';
    soundManager.playTick(true);
  });
  scheduleTrailerStep(9250, () => {
    const el = document.getElementById('trailer-live-countdown');
    if (el) el.textContent = '09:58';
    soundManager.playTick(true);
  });
  scheduleTrailerStep(10150, () => {
    const el = document.getElementById('trailer-live-countdown');
    if (el) el.textContent = '09:57';
    soundManager.playTick(true);
  });

  // SEGMEN 5 (11.1–14.1s): Kad Tajuk 3 (Hitam Tulen)
  scheduleTrailerStep(11100, () => {
    renderVisual('card_3', '');
  });

  // SEGMEN 6 (14.1–19.0s): Visual 3 — 3 aksi permainan pantas (1.6s Baja NPK -> 1.6s Meter pH -> 1.7s Kertas Segi Tiga USDA)
  scheduleTrailerStep(14100, () => {
    renderVisual('visual_3_npk', 'is-flash-cut');
    soundManager.playClick();
  });
  scheduleTrailerStep(14820, () => {
    soundManager.playSuccess();
  });
  scheduleTrailerStep(15700, () => {
    renderVisual('visual_3_ph', 'is-flash-cut');
    soundManager.playClick();
  });
  scheduleTrailerStep(16720, () => {
    soundManager.playSuccess();
  });
  scheduleTrailerStep(17300, () => {
    renderVisual('visual_3_usda', 'is-flash-cut');
    soundManager.playPage();
  });

  // SEGMEN 7 (19.0–21.5s): Kad Tajuk 4 (Hitam Tulen)
  scheduleTrailerStep(19000, () => {
    renderVisual('card_4', '');
  });

  // SEGMEN 8 (21.5–25.0s): Visual 4 — Rak buku rahsia bergeser mendedahkan Bilik Rahsia Makmal Agro
  scheduleTrailerStep(21500, () => {
    renderVisual('visual_4_bookshelf', 'is-flash-cut');
    soundManager.playHeavyDoor();
  });
  scheduleTrailerStep(23200, () => soundManager.playSuccess());

  // SEGMEN 9 (25.0–28.0s): Kad Tajuk 5 (Hitam Tulen)
  scheduleTrailerStep(25000, () => {
    renderVisual('card_5', '');
  });

  // SEGMEN 10 (28.0–31.5s): Visual 5 — Penggera 00:00 + kabur rebah + "ATAU TERKORBAN?" -> potong hitam tajam
  scheduleTrailerStep(28000, () => {
    renderVisual('visual_5_collapse', 'is-red-strobe', {
      overlayPhrase: 'ATAU <span>TERKORBAN?</span>',
    });
    soundManager.playAlarm();
    soundManager.playGasHiss();
    soundManager.playLoseSound();
  });
  scheduleTrailerStep(31320, () => {
    setTrailerOverlayPhrase('');
    setTrailerStrobeMode('is-blackout-cut');
  });

  // SEGMEN 11 (31.5–36.0s): Kad Tajuk Akhir — Lambang zamrud-emas + ESCAPE: MAKMAL AGRO
  scheduleTrailerStep(31500, () => {
    renderVisual('visual_6_title', 'is-flash-cut');
    soundManager.playTimeBonus();
  });

  scheduleTrailerStep(36000, () => {
    trailerState.isFinished = true;
    trailerState.isPlaying = false;
    setTrailerStrobeMode('');
    soundManager.stopBGM(0.55, true);
    revealCloseTrailerTemporarily(false);
  });
}

function stopCinematicTrailer(restoreBgm = true) {
  const wasOpen = dom.trailerOverlay && !dom.trailerOverlay.hidden;
  trailerState.isPlaying = false;
  trailerState.isFinished = false;
  clearTrailerTimers();

  if (dom.trailerOverlay) {
    if (trailerState.activityHandler) {
      dom.trailerOverlay.removeEventListener('mousemove', trailerState.activityHandler);
      dom.trailerOverlay.removeEventListener('touchstart', trailerState.activityHandler);
      trailerState.activityHandler = null;
    }
    dom.trailerOverlay.hidden = true;
  }
  if (trailerState.audioUnlockHandler) {
    document.removeEventListener('pointerdown', trailerState.audioUnlockHandler);
    document.removeEventListener('keydown', trailerState.audioUnlockHandler);
    trailerState.audioUnlockHandler = null;
  }
  if (dom.trailerStage) {
    dom.trailerStage.classList.remove('is-impact-shake');
  }
  if (dom.trailerVisualLayer) {
    dom.trailerVisualLayer.innerHTML = '';
  }
  setTrailerOverlayPhrase('');
  setTrailerStrobeMode('');
  if (dom.btnCloseTrailer) {
    dom.btnCloseTrailer.classList.remove('is-autohidden');
  }

  if (restoreBgm && wasOpen) {
    const fallbackTrack = trailerState.prevBgmTrack || 'calm';
    if (!soundManager.isMuted()) {
      soundManager.playBGM(fallbackTrack);
    }
  }
}

function launchTrailerFromUrlIfRequested() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('trailer') === '1') {
      startCinematicTrailer();
    }
  } catch {
    // Abaikan jika URLSearchParams tidak tersedia
  }
}

// Eksport fungsi teras pada window agar mudah diuji dan disambung
window.agroGame = {
  getState: () => gameState,
  soundManager,
  getPlayerPortraitSVG,
  triggerCutscene,
  applyTimePenalty,
  addTimeBonus,
  addItemToInventory,
  navigateToRoom,
  unlockSecretRoom,
  completeGame,
  triggerGameOver,
  showDialogue,
  generateCertificateCanvas,
  downloadVictoryCertificate,
  startCinematicTrailer,
  stopCinematicTrailer,
};

window.soundManager = soundManager;
window.getPlayerPortraitSVG = getPlayerPortraitSVG;
window.triggerCutscene = triggerCutscene;
window.applyTimePenalty = applyTimePenalty;
window.addTimeBonus = addTimeBonus;

// Mulakan aplikasi apabila DOM sedia
initEventListeners();
renderInventory();
launchTrailerFromUrlIfRequested();
