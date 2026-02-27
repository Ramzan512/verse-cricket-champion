import React, { useEffect, useRef, useState, useCallback } from 'react';

type LeaderboardEntry = { name: string; score: number };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'username' | 'start' | 'playing' | 'gameover'>('username');
  const [username, setUsername] = useState('');
  const [score, setScore] = useState(0);
  const [outs, setOuts] = useState(0);
  const [ballsPlayed, setBallsPlayed] = useState(0);
  const [lastShot, setLastShot] = useState<string>('-');
  const [ballHistory, setBallHistory] = useState<string[]>([]);
  const [centerResult, setCenterResult] = useState<{text: string, color: string, id: number} | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const stateRef = useRef({
    score: 0,
    outs: 0,
    ballsFaced: 0,
    gameState: 'username',
    lastShot: '-',
    ballHistory: [] as string[],
    ball: {
      z: 0,
      active: false,
      speed: 0.008,
      hit: false,
      vx: 0,
      vy: 0,
      x: 0.5,
      y: 0.35,
      startX: 0.5,
      direction: 'left' as 'left' | 'right',
      curveAmount: 0
    },
    bat: {
      swinging: false,
      direction: 'left' as 'left' | 'right',
      angle: 0
    },
    floatingText: {
      text: '',
      color: '',
      y: 0,
      opacity: 0,
      active: false
    }
  });

  useEffect(() => {
    const savedName = localStorage.getItem('verseUsername');
    if (savedName) {    setUsername(savedName);
      setGameState('start');
      stateRef.current.gameState = 'start';
    }
    const savedLeaderboard = localStorage.getItem('verseLeaderboard');
    if (savedLeaderboard) {
      try {
        setLeaderboard(JSON.parse(savedLeaderboard));
      } catch (e) { console.error(e); }
    }
  }, []);

  const saveScore = useCallback((finalScore: number) => {
    const currentName = username || 'Player';
    setLeaderboard(prev => {
      const newBoard = [...prev];
      const existingIndex = newBoard.findIndex(entry => entry.name === currentName);
      
      if (existingIndex !== -1) {
        // Update score if higher
        if (finalScore > newBoard[existingIndex].score) {
          newBoard[existingIndex].score = finalScore;
        }
      } else {
        // Add new entry
        newBoard.push({ name: currentName, score: finalScore });
      }
      
      // Sort all players
      const sortedBoard = newBoard
        .sort((a, b) => b.score - a.score);
        
      localStorage.setItem('verseLeaderboard', JSON.stringify(sortedBoard));
      return sortedBoard;
    });
  }, [username]);

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      localStorage.setItem('verseUsername', username.trim());
      setGameState('start');
      stateRef.current.gameState = 'start';
    }
  };

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const playHitSound = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { console.error(e); }
  }, [getAudioCtx]);

  const playCheerSound = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.5);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch (e) { console.error(e); }
  }, [getAudioCtx]);

  const playOutSound = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) { console.error(e); }
  }, [getAudioCtx]);

  const updateHistory = useCallback((result: string) => {
    const st = stateRef.current;
    st.ballHistory.push(result);
    if (st.ballHistory.length > 10) {
      st.ballHistory.shift();
    }
    setBallHistory([...st.ballHistory]);
  }, []);

  const nextBall = useCallback(() => {
    const st = stateRef.current;
    if (st.gameState !== 'playing') return;
    
    st.ballsFaced += 1;
    setBallsPlayed(st.ballsFaced);
    
    const speedMultiplier = 1 + Math.floor(st.ballsFaced / 5) * 0.15;
    const baseSpeed = 0.008;
    
    // Ball comes from straight line (center)
    const startX = 0.5;
    // Slight random swing near batsman
    const isLeftSwing = Math.random() > 0.5;
    const curveAmount = isLeftSwing ? 0.04 : -0.04;
    
    st.ball = {
      z: 0,
      active: true,
      speed: (baseSpeed + Math.random() * 0.002) * speedMultiplier,
      hit: false,
      vx: 0,
      vy: 0,
      x: startX,
      y: 0.35,
      startX: startX,
      direction: isLeftSwing ? 'left' : 'right',
      curveAmount: curveAmount
    };
    st.floatingText.active = false;
  }, []);

  const scheduleNextBall = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      nextBall();
    }, 1000);
  }, [nextBall]);

  const handleHit = useCallback((direction: 'left' | 'right') => {
    const st = stateRef.current;
    if (st.gameState !== 'playing') return;
    
    st.bat.swinging = true;
    st.bat.direction = direction;
    st.bat.angle = 0;

    if (!st.ball.active) return;

    // Check timing and direction
    const goodTiming = st.ball.z >= 0.75 && st.ball.z <= 0.98;
    // Since ball comes from center, any button press at right time is a hit
    // But we still track direction for the hit animation
    const correctDirection = true; 

    if (goodTiming && correctDirection) {
      // HIT
      const runsList = [1, 2, 3, 4, 6];
      const runs = runsList[Math.floor(Math.random() * runsList.length)];
      
      st.score += runs;
      setScore(st.score);
      st.lastShot = `${runs} RUNS`;
      setLastShot(st.lastShot);
      
      updateHistory(runs.toString());
      
      st.ball.active = false;
      st.ball.hit = true;
      st.ball.vx = direction === 'left' ? -0.02 - Math.random()*0.01 : 0.02 + Math.random()*0.01;
      st.ball.vy = -0.02 - Math.random()*0.02;
      
      const colors: Record<number, string> = {
        1: '#ffffff',
        2: '#3b82f6',
        3: '#a855f7',
        4: '#22c55e',
        6: '#eab308'
      };
      
      setCenterResult({
        text: `BALL ${st.ballsFaced}: ${runs} RUNS`,
        color: colors[runs],
        id: Date.now()
      });
      
      st.floatingText = {
        text: `+${runs}`,
        color: colors[runs],
        y: 0.7,
        opacity: 1,
        active: true
      };
      
      playHitSound();
      if (runs === 4 || runs === 6) {
        playCheerSound();
      }
      
      scheduleNextBall();
    } else {
      // OUT or MISS
      st.ball.active = false;
      st.outs += 1;
      setOuts(st.outs);
      
      updateHistory('W');
      
      const reason = 'MISSED';
      st.lastShot = `OUT (${reason})`;
      setLastShot(st.lastShot);
      
      setCenterResult({
        text: `BALL ${st.ballsFaced}: OUT`,
        color: '#ef4444',
        id: Date.now()
      });
      
      st.floatingText = {
        text: 'OUT!',
        color: '#ef4444',
        y: 0.7,
        opacity: 1,
        active: true
      };
      
      playOutSound();
      
      if (st.outs >= 3) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          st.gameState = 'gameover';
          setGameState('gameover');
          saveScore(st.score);
        }, 1000);
      } else {
        scheduleNextBall();
      }
    }
  }, [playHitSound, playCheerSound, playOutSound, scheduleNextBall, saveScore, updateHistory]);

  const startGame = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    } else if (!audioCtxRef.current) {
      getAudioCtx();
    }
    
    const st = stateRef.current;
    st.gameState = 'playing';
    st.score = 0;
    st.outs = 0;
    st.ballsFaced = 0;
    st.lastShot = '-';
    st.ballHistory = [];
    st.floatingText.active = false;
    st.ball.active = false;
    st.ball.hit = false;
    
    setGameState('playing');
    setScore(0);
    setOuts(0);
    setBallsPlayed(0);
    setLastShot('-');
    setBallHistory([]);
    setCenterResult(null);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    nextBall();
  }, [getAudioCtx, nextBall]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationFrameId: number;
    
    const drawBatsman = (x: number, y: number, scale: number, swingAngle: number, direction: 'left' | 'right') => {
      ctx.save();
      ctx.translate(x, y);
      
      // Ground Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, scale * 85, scale * 45, scale * 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shoes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-scale * 14, scale * 80, scale * 8, scale * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(scale * 10, scale * 80, scale * 8, scale * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Shoe details
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(-scale * 18, scale * 78, scale * 8, scale * 3);
      ctx.fillRect(scale * 6, scale * 78, scale * 8, scale * 3);

      // Legs (Pants)
      const pantsGrad = ctx.createLinearGradient(-scale*20, 0, scale*20, 0);
      pantsGrad.addColorStop(0, '#e2e8f0');
      pantsGrad.addColorStop(0.5, '#ffffff');
      pantsGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = pantsGrad;
      
      // Left Leg
      ctx.beginPath();
      ctx.moveTo(-scale * 20, scale * 25);
      ctx.lineTo(-scale * 8, scale * 25);
      ctx.lineTo(-scale * 10, scale * 75);
      ctx.lineTo(-scale * 22, scale * 75);
      ctx.fill();
      
      // Right Leg
      ctx.beginPath();
      ctx.moveTo(scale * 2, scale * 25);
      ctx.lineTo(scale * 14, scale * 25);
      ctx.lineTo(scale * 16, scale * 75);
      ctx.lineTo(scale * 4, scale * 75);
      ctx.fill();

      // Pads
      const padGrad = ctx.createLinearGradient(-scale*20, 0, scale*20, 0);
      padGrad.addColorStop(0, '#f8fafc');
      padGrad.addColorStop(0.8, '#cbd5e1');
      padGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = padGrad;
      
      // Left Pad
      ctx.beginPath();
      ctx.roundRect(-scale * 22, scale * 35, scale * 16, scale * 42, scale * 5);
      ctx.fill();
      // Right Pad
      ctx.beginPath();
      ctx.roundRect(scale * 2, scale * 35, scale * 16, scale * 42, scale * 5);
      ctx.fill();
      
      // Knee rolls
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-scale * 21, scale * 45, scale * 14, scale * 4);
      ctx.fillRect(-scale * 21, scale * 52, scale * 14, scale * 4);
      ctx.fillRect(-scale * 21, scale * 59, scale * 14, scale * 4);
      ctx.fillRect(scale * 3, scale * 45, scale * 14, scale * 4);
      ctx.fillRect(scale * 3, scale * 52, scale * 14, scale * 4);
      ctx.fillRect(scale * 3, scale * 59, scale * 14, scale * 4);
      ctx.globalAlpha = 1.0;

      // Torso (Jersey)
      const bodyGrad = ctx.createLinearGradient(-scale*25, 0, scale*25, 0);
      bodyGrad.addColorStop(0, '#1e3a8a'); // dark blue
      bodyGrad.addColorStop(0.4, '#3b82f6'); // mid blue
      bodyGrad.addColorStop(0.7, '#2563eb'); // blue
      bodyGrad.addColorStop(1, '#1e3a8a'); // dark blue
      ctx.fillStyle = bodyGrad;
      
      // Chest/Shoulders
      ctx.beginPath();
      ctx.moveTo(-scale * 22, -scale * 15); // left shoulder
      ctx.quadraticCurveTo(0, -scale * 18, scale * 22, -scale * 15); // right shoulder
      ctx.lineTo(scale * 18, scale * 10); // right waist
      ctx.quadraticCurveTo(0, scale * 15, -scale * 18, scale * 10); // left waist
      ctx.fill();
      
      // Lower Torso
      ctx.beginPath();
      ctx.moveTo(-scale * 18, scale * 8);
      ctx.lineTo(scale * 18, scale * 8);
      ctx.lineTo(scale * 16, scale * 28);
      ctx.quadraticCurveTo(0, scale * 32, -scale * 16, scale * 28);
      ctx.fill();
      
      // Jersey Details (Chest Band)
      ctx.fillStyle = '#facc15'; // yellow trim
      ctx.beginPath();
      ctx.moveTo(-scale * 20, -scale * 2);
      ctx.quadraticCurveTo(0, scale * 2, scale * 20, -scale * 2);
      ctx.lineTo(scale * 19, scale * 4);
      ctx.quadraticCurveTo(0, scale * 8, -scale * 19, scale * 4);
      ctx.fill();

      // Head/Neck
      const skinGrad = ctx.createLinearGradient(-scale*10, 0, scale*10, 0);
      skinGrad.addColorStop(0, '#fca5a5');
      skinGrad.addColorStop(1, '#b91c1c');
      ctx.fillStyle = skinGrad;
      ctx.fillRect(-scale * 6, -scale * 22, scale * 12, scale * 10);

      // Helmet
      const helmetGrad = ctx.createRadialGradient(scale*5, -scale*35, scale*2, 0, -scale*28, scale*20);
      helmetGrad.addColorStop(0, '#60a5fa');
      helmetGrad.addColorStop(0.5, '#1e3a8a');
      helmetGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = helmetGrad;
      
      // Helmet Dome
      ctx.beginPath();
      ctx.arc(0, -scale * 30, scale * 16, Math.PI, Math.PI * 2);
      ctx.lineTo(scale * 16, -scale * 20);
      ctx.quadraticCurveTo(0, -scale * 15, -scale * 16, -scale * 20);
      ctx.fill();
      
      // Helmet Peak
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.ellipse(0, -scale * 24, scale * 18, scale * 6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      
      // Helmet Grill
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = scale * 1.5;
      ctx.beginPath();
      // Horizontal bars
      ctx.moveTo(-scale * 12, -scale * 18);
      ctx.lineTo(scale * 12, -scale * 18);
      ctx.moveTo(-scale * 10, -scale * 14);
      ctx.lineTo(scale * 10, -scale * 14);
      ctx.moveTo(-scale * 8, -scale * 10);
      ctx.lineTo(scale * 8, -scale * 10);
      // Vertical bars
      ctx.moveTo(-scale * 6, -scale * 22);
      ctx.lineTo(-scale * 6, -scale * 10);
      ctx.moveTo(0, -scale * 24);
      ctx.lineTo(0, -scale * 10);
      ctx.moveTo(scale * 6, -scale * 22);
      ctx.lineTo(scale * 6, -scale * 10);
      ctx.stroke();

      // Arms & Bat
      ctx.save();
      // Pivot point for swing (shoulder area)
      ctx.translate(0, -scale * 10);
      
      let currentAngle = Math.PI / 6; // default resting angle
      if (swingAngle > 0) {
        currentAngle = direction === 'left' ? -swingAngle : swingAngle;
      }
      ctx.rotate(currentAngle);
      
      // Bat Handle
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-scale * 3, 0, scale * 6, scale * 25);
      
      // Bat Blade
      const batGrad = ctx.createLinearGradient(-scale*7, 0, scale*7, 0);
      batGrad.addColorStop(0, '#fef3c7');
      batGrad.addColorStop(0.3, '#fcd34d');
      batGrad.addColorStop(0.8, '#d97706');
      batGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = batGrad;
      ctx.beginPath();
      ctx.moveTo(-scale * 6, scale * 20);
      ctx.lineTo(scale * 6, scale * 20);
      ctx.lineTo(scale * 8, scale * 65);
      ctx.quadraticCurveTo(0, scale * 75, -scale * 8, scale * 65);
      ctx.fill();
      
      // Bat Grip/Sticker details
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-scale * 6, scale * 30, scale * 12, scale * 8);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(-scale * 7, scale * 45, scale * 14, scale * 4);

      // Left Arm (holding bat)
      // Upper arm
      ctx.fillStyle = '#3b82f6'; // sleeve
      ctx.beginPath();
      ctx.ellipse(-scale * 18, scale * 2, scale * 6, scale * 12, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Forearm
      ctx.strokeStyle = skinGrad;
      ctx.lineWidth = scale * 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-scale * 22, scale * 10); // elbow
      ctx.lineTo(-scale * 5, scale * 12); // hand
      ctx.stroke();
      
      // Left Glove
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-scale * 4, scale * 12, scale * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e'; // glove detail
      ctx.fillRect(-scale * 6, scale * 10, scale * 4, scale * 4);

      // Right Arm (holding bat)
      // Upper arm
      ctx.fillStyle = '#3b82f6'; // sleeve
      ctx.beginPath();
      ctx.ellipse(scale * 18, scale * 2, scale * 6, scale * 12, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Forearm
      ctx.beginPath();
      ctx.moveTo(scale * 22, scale * 10); // elbow
      ctx.lineTo(scale * 5, scale * 18); // hand
      ctx.stroke();
      
      // Right Glove
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(scale * 4, scale * 18, scale * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e'; // glove detail
      ctx.fillRect(scale * 2, scale * 16, scale * 4, scale * 4);

      ctx.restore();
      ctx.restore();
    };
    
    const draw = (width: number, height: number) => {
      const st = stateRef.current;
      
      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.35);
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height * 0.35);
      
      // Grass
      const grassGrad = ctx.createLinearGradient(0, height * 0.35, 0, height);
      grassGrad.addColorStop(0, '#22c55e');
      grassGrad.addColorStop(1, '#14532d');
      ctx.fillStyle = grassGrad;
      ctx.fillRect(0, height * 0.35, width, height * 0.65);
      
      // Pitch
      const pitchGrad = ctx.createLinearGradient(0, height * 0.35, 0, height);
      pitchGrad.addColorStop(0, '#e7e5e4');
      pitchGrad.addColorStop(1, '#a8a29e');
      ctx.fillStyle = pitchGrad;
      ctx.beginPath();
      ctx.moveTo(width * 0.45, height * 0.35);
      ctx.lineTo(width * 0.55, height * 0.35);
      ctx.lineTo(width * 0.85, height * 1.0);
      ctx.lineTo(width * 0.15, height * 1.0);
      ctx.fill();
      
      // Crease lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width * 0.46, height * 0.38);
      ctx.lineTo(width * 0.54, height * 0.38);
      ctx.stroke();
      
      // Batting crease (moved slightly down to bring batsman closer to stumps)
      ctx.beginPath();
      ctx.moveTo(width * 0.2, height * 0.83);
      ctx.lineTo(width * 0.8, height * 0.83);
      ctx.stroke();
      
      // Bowler stumps
      ctx.fillStyle = '#facc15';
      const stumpW = width * 0.005;
      const stumpH = height * 0.05;
      ctx.fillRect(width * 0.485, height * 0.28, stumpW, stumpH);
      ctx.fillRect(width * 0.4975, height * 0.28, stumpW, stumpH);
      ctx.fillRect(width * 0.51, height * 0.28, stumpW, stumpH);
      
      // 3D Batsman (drawn BEFORE stumps so he is further away / in front of them toward bowler)
      // Moved even closer to stumps (y: 0.79)
      const batsmanScale = width * 0.0028;
      drawBatsman(width * 0.58, height * 0.79, batsmanScale, st.bat.swinging ? st.bat.angle : 0, st.bat.direction);

      // Batsman stumps (drawn AFTER batsman so they are closer to camera / bottom of screen)
      // Kept at bottom of screen (y: 0.85)
      ctx.fillStyle = '#facc15';
      const bStumpW = width * 0.012;
      const bStumpH = height * 0.12;
      ctx.fillRect(width * 0.47, height * 0.85, bStumpW, bStumpH);
      ctx.fillRect(width * 0.50, height * 0.85, bStumpW, bStumpH);
      ctx.fillRect(width * 0.53, height * 0.85, bStumpW, bStumpH);
      
      // Bails on batsman stumps
      ctx.fillRect(width * 0.47, height * 0.85, width * 0.03, height * 0.01);
      ctx.fillRect(width * 0.50, height * 0.85, width * 0.03, height * 0.01);

      // Ball
      if (st.ball.active || st.ball.hit) {
        const ballRadius = (width * 0.004) + (Math.pow(st.ball.z, 1.5) * width * 0.035);
        const ballX = st.ball.x * width;
        const ballY = st.ball.y * height;
        
        // Ball Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(ballX, ballY + ballRadius, ballRadius, ballRadius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        const ballGrad = ctx.createRadialGradient(
          ballX - ballRadius*0.3, ballY - ballRadius*0.3, ballRadius*0.1, 
          ballX, ballY, ballRadius
        );
        ballGrad.addColorStop(0, '#ff8a8a');
        ballGrad.addColorStop(0.7, '#dc2626');
        ballGrad.addColorStop(1, '#7f1d1d');
        
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Seam
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, ballRadius * 0.1);
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius, -Math.PI/4, Math.PI/4);
        ctx.stroke();
      }
      
      // Floating Text
      if (st.floatingText.active) {
        ctx.fillStyle = st.floatingText.color;
        ctx.globalAlpha = st.floatingText.opacity;
        ctx.font = `900 ${width * 0.15}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(st.floatingText.text, width * 0.5, st.floatingText.y * height);
        ctx.fillText(st.floatingText.text, width * 0.5, st.floatingText.y * height);
        ctx.globalAlpha = 1.0;
        
        st.floatingText.y -= 0.005;
        st.floatingText.opacity -= 0.02;
        if (st.floatingText.opacity <= 0) {
          st.floatingText.active = false;
        }
      }
    };
    
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      
      const st = stateRef.current;
      
      if (st.gameState === 'playing') {
        if (st.bat.swinging) {
          st.bat.angle += 0.4; // faster swing
          if (st.bat.angle > Math.PI * 0.8) {
            st.bat.swinging = false;
          }
        }

        if (st.ball.active) {
          st.ball.z += st.ball.speed;
          st.ball.y = 0.35 + (0.47 * Math.pow(st.ball.z, 0.8));
          
          // Apply curve and horizontal movement
          // Ball starts at center (0.5) and swings slightly towards target
          const targetX = st.ball.direction === 'left' ? 0.46 : 0.54;
          const progress = st.ball.z;
          const linearX = st.ball.startX + (targetX - st.ball.startX) * progress;
          // Swing happens more towards the end of the pitch
          const curveOffset = Math.pow(progress, 2) * st.ball.curveAmount;
          st.ball.x = linearX + curveOffset;
          
          if (st.ball.z > 1.0) {
            st.ball.active = false;
            st.outs += 1;
            setOuts(st.outs);
            
            updateHistory('W');
            
            setCenterResult({
              text: `BALL ${st.ballsFaced}: OUT`,
              color: '#ef4444',
              id: Date.now()
            });
            
            st.lastShot = 'OUT (MISSED)';
            setLastShot(st.lastShot);
            
            st.floatingText = {
              text: 'OUT!',
              color: '#ef4444',
              y: 0.7,
              opacity: 1,
              active: true
            };
            
            playOutSound();
            
            if (st.outs >= 3) {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              timeoutRef.current = setTimeout(() => {
                st.gameState = 'gameover';
                setGameState('gameover');
                saveScore(st.score);
              }, 1000);
            } else {
              scheduleNextBall();
            }
          }
        } else if (st.ball.hit) {
          st.ball.x += st.ball.vx;
          st.ball.y += st.ball.vy;
          st.ball.z -= 0.01;
        }
      }
      
      draw(canvas.width, canvas.height);
      animationFrameId = requestAnimationFrame(render);
    };
    
    animationFrameId = requestAnimationFrame(render);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [scheduleNextBall, playOutSound, saveScore]);

  const getHistoryColor = (res: string) => {
    switch(res) {
      case '1': return 'bg-white text-black';
      case '2': return 'bg-blue-500 text-white';
      case '3': return 'bg-purple-500 text-white';
      case '4': return 'bg-green-500 text-white';
      case '6': return 'bg-yellow-500 text-black';
      case 'W': return 'bg-red-600 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden touch-none select-none font-sans">
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.5) translateY(-20px); opacity: 0; }
          50% { transform: scale(1.1) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-pop {
          animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* UI Overlay */}
      {gameState === 'playing' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
          {/* Top Bar */}
          <div className="flex flex-col gap-3 w-full max-w-2xl mx-auto">
            <div className="flex justify-between items-start">
              <div className="bg-black/60 text-white px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md shadow-xl">
                <div className="text-[10px] text-gray-400 font-bold tracking-widest mb-1">SCORE</div>
                <div className="text-3xl font-black font-mono leading-none">{score}</div>
                <div className="text-xs text-gray-300 mt-1">Balls: {ballsPlayed}</div>
              </div>
              
              {/* Animated Center Result */}
              <div className="flex flex-col items-center justify-start h-16 mt-2">
                {centerResult && (
                  <div 
                    key={centerResult.id}
                    className="animate-pop px-6 py-2 rounded-full border-2 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
                    style={{ borderColor: centerResult.color, backgroundColor: 'rgba(0,0,0,0.8)' }}
                  >
                    <span className="text-2xl font-black tracking-wider" style={{ color: centerResult.color }}>
                      {centerResult.text}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="bg-black/60 text-white px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md shadow-xl flex flex-col items-end">
                <div className="text-[10px] text-gray-400 font-bold tracking-widest mb-2">OUTS</div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div 
                      key={i} 
                      className={`w-4 h-4 rounded-full border-2 ${i < outs ? 'bg-red-500 border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-black/50 border-gray-500'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Last 10 Balls History */}
            <div className="bg-black/60 rounded-xl border border-white/10 backdrop-blur-md p-2 flex items-center gap-2 overflow-hidden">
              <span className="text-[10px] text-gray-400 font-bold tracking-widest whitespace-nowrap">HISTORY:</span>
              <div className="flex gap-1.5 flex-1 justify-end">
                {ballHistory.map((res, idx) => (
                  <div 
                    key={idx} 
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${getHistoryColor(res)}`}
                  >
                    {res}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Bottom Controls */}
          <div className="flex justify-between gap-4 pb-8 px-4 pointer-events-auto w-full max-w-md mx-auto">
            <button 
              className="flex-1 bg-blue-600 active:bg-blue-700 text-white h-24 rounded-2xl font-black text-lg shadow-[0_6px_0_#1e40af] active:shadow-[0_0px_0_#1e40af] active:translate-y-1.5 transition-all select-none"
              onPointerDown={(e) => { e.preventDefault(); handleHit('left'); }}
            >
              LEFT SHOT
            </button>
            <button 
              className="flex-1 bg-blue-600 active:bg-blue-700 text-white h-24 rounded-2xl font-black text-lg shadow-[0_6px_0_#1e40af] active:shadow-[0_0px_0_#1e40af] active:translate-y-1.5 transition-all select-none"
              onPointerDown={(e) => { e.preventDefault(); handleHit('right'); }}
            >
              RIGHT SHOT
            </button>
          </div>
        </div>
      )}
      
      {/* Username Screen */}
      {gameState === 'username' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 z-20 backdrop-blur-md pointer-events-auto">
          {/* Verse Logo */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 mb-6 shadow-[0_0_30px_rgba(99,102,241,0.6)] flex items-center justify-center border-2 border-white/20">
            <span className="text-white font-black text-3xl italic tracking-tighter">V</span>
          </div>
          
          <h1 className="text-4xl font-black text-white text-center mb-8 italic tracking-tight">
            Verse Cricket<br/><span className="text-green-400">Champion</span>
          </h1>
          <form onSubmit={handleUsernameSubmit} className="w-full max-w-xs flex flex-col gap-4">
            <label className="text-gray-300 text-sm font-bold tracking-widest text-center">ENTER YOUR USERNAME</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-gray-800 border-2 border-gray-600 rounded-xl px-4 py-3 text-white text-center font-bold text-xl focus:border-green-500 focus:outline-none transition-colors"
              placeholder="Player123"
              maxLength={12}
              required
            />
            <button 
              type="submit"
              className="bg-green-500 text-white px-8 py-4 rounded-xl font-black text-xl shadow-[0_4px_0_#166534] active:translate-y-1 active:shadow-none transition-all mt-4"
            >
              CONTINUE
            </button>
          </form>
        </div>
      )}

      {/* Start Screen */}
      {gameState === 'start' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 z-10 backdrop-blur-sm pointer-events-auto">
          {/* Verse Logo */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 mb-6 shadow-[0_0_40px_rgba(99,102,241,0.7)] flex items-center justify-center border-2 border-white/20">
            <span className="text-white font-black text-4xl italic tracking-tighter">V</span>
          </div>
          
          <h1 className="text-5xl font-black text-white text-center mb-2 italic tracking-tight">
            Verse Cricket<br/><span className="text-green-400">Champion</span>
          </h1>
          <p className="text-gray-400 mb-2 font-mono text-sm">Welcome, {username}!</p>
          <p className="text-gray-500 mb-6 font-mono text-xs">Created by @legend832</p>
          
          {/* Leaderboard on Start Screen */}
          {leaderboard.length > 0 && (
            <div className="w-full max-w-xs bg-gray-800/80 rounded-2xl p-3 mb-6 border border-gray-700">
              <h3 className="text-white text-center font-bold tracking-widest mb-2 text-sm">ALL-TIME LEADERBOARD</h3>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                {leaderboard.map((entry, idx) => (
                  <div key={idx} className={`flex justify-between items-center p-1.5 rounded-lg ${entry.name === username ? 'bg-green-900/50 border border-green-500/50' : 'bg-gray-900/50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-mono text-xs">#{idx + 1}</span>
                      <span className="text-white font-bold text-sm truncate max-w-[100px]">{entry.name}</span>
                    </div>
                    <span className="text-yellow-400 font-mono font-bold text-sm">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <button 
            className="bg-green-500 text-white px-12 py-4 rounded-full font-black text-2xl shadow-[0_0_40px_rgba(34,197,94,0.4)] hover:scale-105 active:scale-95 transition-all"
            onClick={startGame}
          >
            PLAY NOW
          </button>
        </div>
      )}
      
      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 z-10 backdrop-blur-md pointer-events-auto">
          <h2 className="text-5xl font-black text-red-500 mb-2">GAME OVER</h2>
          <div className="text-white text-center mb-6">
            <div className="text-gray-400 text-sm font-bold tracking-widest mb-1">FINAL SCORE</div>
            <div className="text-7xl font-black font-mono text-yellow-400">{score}</div>
          </div>
          
          {/* Leaderboard */}
          <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-4 mb-6 border border-gray-700">
            <h3 className="text-white text-center font-bold tracking-widest mb-3">ALL-TIME LEADERBOARD</h3>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
              {leaderboard.map((entry, idx) => (
                <div key={idx} className={`flex justify-between items-center p-2 rounded-lg ${entry.name === username ? 'bg-green-900/50 border border-green-500/50' : 'bg-gray-900/50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-mono text-sm">#{idx + 1}</span>
                    <span className="text-white font-bold truncate max-w-[120px]">{entry.name}</span>
                  </div>
                  <span className="text-yellow-400 font-mono font-bold">{entry.score}</span>
                </div>
              ))}
            </div>
          </div>
          
          <button 
            className="bg-white text-black px-12 py-4 rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-all"
            onClick={startGame}
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
