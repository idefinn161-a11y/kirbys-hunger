import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Entity, Particle, FloatingText } from '../types';
import { 
  FOOD_EMOJIS, 
  BOMB_EMOJI, 
  KIRBY_RADIUS_BASE, 
  CURSOR_RADIUS, 
  COLOR_KIRBY_BODY, 
  COLOR_KIRBY_BLUSH, 
  COLOR_KIRBY_FEET, 
  COLOR_SHIELD,
  COLOR_SHIELD_BORDER,
  SPAWN_RATE_MIN,
  MAX_HEALTH
} from '../constants';
import { Heart, Trophy, RefreshCw, Zap, Crown } from 'lucide-react';

// Helper to get random range
const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

const DIFFICULTY_SETTINGS = {
  EASY: {
    spawnRateBase: 90,
    bombChanceBase: 0.1,
    speedMultiplier: 0.7,
    rampRate: 0.1,
    label: 'Easy',
    color: 'from-green-400 to-green-500',
    ring: 'ring-green-300',
    text: 'text-green-500',
    description: 'Chill Snacking'
  },
  MEDIUM: {
    spawnRateBase: 60,
    bombChanceBase: 0.15,
    speedMultiplier: 1.0,
    rampRate: 0.25,
    label: 'Medium',
    color: 'from-yellow-400 to-orange-500',
    ring: 'ring-orange-300',
    text: 'text-orange-500',
    description: 'Balanced Diet'
  },
  HARD: {
    spawnRateBase: 40,
    bombChanceBase: 0.25,
    speedMultiplier: 1.4,
    rampRate: 0.4,
    label: 'Hard',
    color: 'from-red-500 to-red-600',
    ring: 'ring-red-400',
    text: 'text-red-500',
    description: 'Hunger Panic!'
  }
};

const GameCanvas: React.FC = () => {
  // UI State
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [wakeUpProgress, setWakeUpProgress] = useState(0); // 0 to 5
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>('MEDIUM');
  const [highScores, setHighScores] = useState<Record<DifficultyLevel, number>>({
    EASY: 0,
    MEDIUM: 0,
    HARD: 0
  });
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  
  // Refs for game loop to avoid re-renders
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const healthRef = useRef(MAX_HEALTH);
  const frameCountRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const shieldRef = useRef({ x: 0, y: 0 }); // The actual constrained position of the shield
  
  // Game Entities Refs
  const kirbyRef = useRef({ 
    x: 0, 
    y: 0, 
    radius: KIRBY_RADIUS_BASE, 
    state: 'sleep' as 'idle' | 'eat' | 'hurt' | 'sleep',
    stateTimer: 0,
    wakeUpHits: 0,
    lastHitFrame: 0
  });
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const difficultyRef = useRef(1);
  const currentSettingsRef = useRef(DIFFICULTY_SETTINGS['MEDIUM']);

  // Load High Scores
  useEffect(() => {
    const saved = localStorage.getItem('kirby_hunger_highscores');
    if (saved) {
      try {
        setHighScores(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load high scores", e);
      }
    }
  }, []);

  // Initialize Game
  const startGame = useCallback(() => {
    setGameState('PLAYING');
    setScore(0);
    setHealth(MAX_HEALTH);
    setIsNewHighScore(false);
    scoreRef.current = 0;
    healthRef.current = MAX_HEALTH;
    entitiesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    frameCountRef.current = 0;
    difficultyRef.current = 1;
    kirbyRef.current.state = 'idle';
    
    // Capture current difficulty settings for the game session
    currentSettingsRef.current = DIFFICULTY_SETTINGS[selectedDifficulty];
  }, [selectedDifficulty]);

  const resetToMenu = useCallback(() => {
    setGameState('START');
    setWakeUpProgress(0);
    kirbyRef.current.state = 'sleep';
    kirbyRef.current.wakeUpHits = 0;
    entitiesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
  }, []);

  // Update mouse position
  const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    mouseRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  const endGame = () => {
    // Check and update high score
    const currentDifficulty = selectedDifficulty;
    const currentScore = scoreRef.current;
    const oldHigh = highScores[currentDifficulty];
    
    if (currentScore > oldHigh) {
      setIsNewHighScore(true);
      const newScores = { ...highScores, [currentDifficulty]: currentScore };
      setHighScores(newScores);
      localStorage.setItem('kirby_hunger_highscores', JSON.stringify(newScores));
    } else {
      setIsNewHighScore(false);
    }
    
    setGameState('GAMEOVER');
  };

  // Main Game Loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    frameCountRef.current++;
    const settings = currentSettingsRef.current;

    // --- Shield Constraint Logic ---
    // Calculate vector from Kirby to Mouse
    const dx = mouseRef.current.x - kirbyRef.current.x;
    const dy = mouseRef.current.y - kirbyRef.current.y;
    const dist = Math.hypot(dx, dy);
    
    // Minimum distance allowed (touching but not overlapping)
    const minDist = kirbyRef.current.radius + CURSOR_RADIUS;

    if (dist < minDist && dist > 0) {
        // Clamp shield to the surface of Kirby
        const angle = Math.atan2(dy, dx);
        shieldRef.current = {
            x: kirbyRef.current.x + Math.cos(angle) * minDist,
            y: kirbyRef.current.y + Math.sin(angle) * minDist
        };

        // --- Wake Up Logic (Only in START state) ---
        if (gameState === 'START') {
             // Only register a hit if enough time passed since last hit (debounce)
             if (frameCountRef.current - kirbyRef.current.lastHitFrame > 20) {
                kirbyRef.current.lastHitFrame = frameCountRef.current;
                kirbyRef.current.wakeUpHits++;
                setWakeUpProgress(kirbyRef.current.wakeUpHits);
                
                // Visual feedback for hit
                createExplosion(shieldRef.current.x, shieldRef.current.y, '#ffffff', 5);
                kirbyRef.current.stateTimer = 10; // Use stateTimer for shake effect
                
                if (kirbyRef.current.wakeUpHits >= 5) {
                    addFloatingText(kirbyRef.current.x, kirbyRef.current.y - 80, "I'm Awake!", "#ec4899");
                    startGame();
                } else {
                    addFloatingText(shieldRef.current.x, shieldRef.current.y, "Nudge!", "#fbbf24");
                }
             }
        }
    } else {
        shieldRef.current = { ...mouseRef.current };
    }

    // --- Update Logic ---
    
    if (gameState === 'PLAYING') {
      
      // Increase difficulty over time
      if (frameCountRef.current % 240 === 0) {
        difficultyRef.current += settings.rampRate;
      }

      // Spawning Items
      // Base rate decreases (gets faster) as difficulty increases
      // We start with the difficulty setting's base rate
      const currentSpawnRate = Math.max(SPAWN_RATE_MIN, settings.spawnRateBase - (difficultyRef.current * 4));
      
      if (frameCountRef.current % Math.floor(currentSpawnRate) === 0) {
        const bombChance = Math.min(settings.bombChanceBase + (difficultyRef.current * 0.05), 0.70);
        const isBomb = Math.random() < bombChance;
        
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = Math.hypot(canvas.width / 2, canvas.height / 2) + 80;
        
        const startX = kirbyRef.current.x + Math.cos(angle) * spawnRadius;
        const startY = kirbyRef.current.y + Math.sin(angle) * spawnRadius;
        
        const dx = kirbyRef.current.x - startX;
        const dy = kirbyRef.current.y - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Speed formula based on difficulty settings
        const speed = randomRange(3, 6) * (settings.speedMultiplier + (difficultyRef.current * 0.1));

        entitiesRef.current.push({
          id: Date.now() + Math.random(),
          x: startX,
          y: startY,
          radius: isBomb ? 25 : 20,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          type: isBomb ? 'bomb' : 'food',
          visual: isBomb ? BOMB_EMOJI : FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
          rotation: 0,
          rotationSpeed: randomRange(-0.1, 0.1)
        });
      }

      // Update Entities
      for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
        const ent = entitiesRef.current[i];
        ent.x += ent.vx;
        ent.y += ent.vy;
        ent.rotation += ent.rotationSpeed;

        // Collision: Cursor Shield (Using Constrained shieldRef)
        const distToCursor = Math.hypot(ent.x - shieldRef.current.x, ent.y - shieldRef.current.y);
        
        if (distToCursor < CURSOR_RADIUS + ent.radius) {
            if (ent.type === 'bomb') {
                createExplosion(ent.x, ent.y, '#555', 15);
                addFloatingText(ent.x, ent.y, '+50', '#fbbf24');
                scoreRef.current += 50;
                setScore(scoreRef.current);
                entitiesRef.current.splice(i, 1);
                continue;
            } else {
                createExplosion(ent.x, ent.y, '#a8a29e', 10);
                addFloatingText(ent.x, ent.y, 'Oops!', '#9ca3af');
                entitiesRef.current.splice(i, 1);
                continue;
            }
        }

        // Collision: Kirby
        const distToKirby = Math.hypot(ent.x - kirbyRef.current.x, ent.y - kirbyRef.current.y);
        if (distToKirby < kirbyRef.current.radius * 0.8 + ent.radius) {
            if (ent.type === 'food') {
                createExplosion(ent.x, ent.y, '#f472b6', 8);
                addFloatingText(ent.x, ent.y, 'Yummy!', '#ec4899');
                scoreRef.current += 100;
                setScore(scoreRef.current);
                kirbyRef.current.state = 'eat';
                kirbyRef.current.stateTimer = 20;
            } else {
                createExplosion(ent.x, ent.y, '#ef4444', 30);
                healthRef.current -= 1;
                setHealth(healthRef.current);
                kirbyRef.current.state = 'hurt';
                kirbyRef.current.stateTimer = 30;
                
                if (healthRef.current <= 0) {
                    endGame();
                }
            }
            entitiesRef.current.splice(i, 1);
            continue;
        }

        const distFromCenter = Math.hypot(ent.x - kirbyRef.current.x, ent.y - kirbyRef.current.y);
        const maxDist = Math.hypot(canvas.width / 2, canvas.height / 2) + 200;
        if (distFromCenter > maxDist) {
            entitiesRef.current.splice(i, 1);
        }
      }

      // Kirby Animation State
      if (kirbyRef.current.stateTimer > 0) {
        kirbyRef.current.stateTimer--;
      } else {
        kirbyRef.current.state = 'idle';
      }
    } 
    else if (gameState === 'START') {
        // Sleep animation logic
        if (frameCountRef.current % 60 === 0) {
            addFloatingText(kirbyRef.current.x + 40, kirbyRef.current.y - 40, "Zzz...", "#ffffff");
        }
        
        // Shake logic when hit
        if (kirbyRef.current.stateTimer > 0) {
            kirbyRef.current.stateTimer--;
            // No state change, just timer for shake
        }
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.size *= 0.95; 
        if (p.life <= 0) particlesRef.current.splice(i, 1);
    }

    // Update Floating Texts
    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.life--;
        if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
    }

    // --- Render Logic ---

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Entities
    entitiesRef.current.forEach(ent => {
        ctx.save();
        ctx.translate(ent.x, ent.y);
        ctx.rotate(ent.rotation);
        // Explicitly set fillStyle to black to prevent inheritance from previous frames/draw calls
        ctx.fillStyle = '#000000';
        ctx.font = `${ent.radius * 2}px "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 5;
        ctx.fillText(ent.visual, 0, 0);
        ctx.restore();
    });

    // Draw Kirby
    let kirbyX = kirbyRef.current.x;
    let kirbyY = kirbyRef.current.y;
    
    // Shake effect
    if (gameState === 'START' && kirbyRef.current.stateTimer > 0) {
        kirbyX += (Math.random() - 0.5) * 5;
        kirbyY += (Math.random() - 0.5) * 5;
    }

    drawKirby(ctx, kirbyX, kirbyY, kirbyRef.current.radius, kirbyRef.current.state);

    // Draw Particles
    particlesRef.current.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
    });

    // Draw Floating Text
    floatingTextsRef.current.forEach(ft => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, ft.life / 20);
        ctx.font = 'bold 24px "Fredoka One", sans-serif';
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    });

    // Draw Cursor Shield (Use shieldRef instead of mouseRef)
    const { x, y } = shieldRef.current;
    
    ctx.beginPath();
    ctx.arc(x, y, CURSOR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_SHIELD;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR_SHIELD_BORDER;
    ctx.stroke();

    // Draw shield icon/glint
    ctx.beginPath();
    ctx.arc(x - 5, y - 5, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, startGame]); 

  // Effects
  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);

  useEffect(() => {
    const handleResize = () => {
        if (canvasRef.current) {
            const parent = canvasRef.current.parentElement;
            if(parent) {
                canvasRef.current.width = parent.clientWidth;
                canvasRef.current.height = parent.clientHeight;
                
                kirbyRef.current.x = parent.clientWidth / 2;
                kirbyRef.current.y = parent.clientHeight / 2;
            }
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const createExplosion = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
        particlesRef.current.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: randomRange(20, 40),
            color: color,
            size: randomRange(3, 8)
        });
    }
  };

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
      floatingTextsRef.current.push({
          x, y, text, color, life: 60, vy: -1
      });
  }

  const drawKirby = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, state: string) => {
      // Body
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_KIRBY_BODY;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.stroke();

      // Feet
      ctx.beginPath();
      ctx.ellipse(x - r*0.6, y + r*0.7, r*0.4, r*0.25, -0.2, 0, Math.PI*2);
      ctx.fillStyle = COLOR_KIRBY_FEET;
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(x + r*0.6, y + r*0.7, r*0.4, r*0.25, 0.2, 0, Math.PI*2);
      ctx.fillStyle = COLOR_KIRBY_FEET;
      ctx.fill();

      // Arms (Nubs)
      if (state === 'idle' || state === 'sleep') {
          ctx.beginPath();
          ctx.ellipse(x - r*0.9, y, r*0.2, r*0.25, -0.5, 0, Math.PI*2);
          ctx.fill(); // uses last fillstyle (feet red? No want body pink)
          ctx.fillStyle = COLOR_KIRBY_BODY;
          ctx.fill(); 
          
          ctx.beginPath();
          ctx.ellipse(x + r*0.9, y, r*0.2, r*0.25, 0.5, 0, Math.PI*2);
          ctx.fill();
      } else if (state === 'eat') {
          // Arms up
          ctx.fillStyle = COLOR_KIRBY_BODY;
          ctx.beginPath();
          ctx.ellipse(x - r*0.8, y - r*0.4, r*0.2, r*0.3, -2.5, 0, Math.PI*2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x + r*0.8, y - r*0.4, r*0.2, r*0.3, 2.5, 0, Math.PI*2);
          ctx.fill();
      } else {
        // Hurt arms flailing
        ctx.fillStyle = COLOR_KIRBY_BODY;
        ctx.beginPath();
        ctx.ellipse(x - r*0.9, y + r*0.2, r*0.2, r*0.3, 0.5, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + r*0.9, y - r*0.2, r*0.2, r*0.3, -0.5, 0, Math.PI*2);
        ctx.fill();
      }

      // Re-draw Body over feet/arms for correct layering
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_KIRBY_BODY;
      ctx.fill();

      // Face Features
      if (state === 'sleep') {
        // Sleeping Eyes (U shape upside down roughly)
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'black';
        ctx.lineCap = 'round';
        
        // Left eye
        ctx.beginPath();
        ctx.moveTo(x - 25, y - 5);
        ctx.lineTo(x - 5, y - 5);
        ctx.stroke();
        
        // Right eye
        ctx.beginPath();
        ctx.moveTo(x + 5, y - 5);
        ctx.lineTo(x + 25, y - 5);
        ctx.stroke();

        // Snot bubble
        const bubbleSize = (Math.sin(Date.now() / 500) * 5) + 10;
        ctx.beginPath();
        ctx.arc(x + 10, y + 5, bubbleSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

      } else {
        // Eyes
        ctx.fillStyle = 'black';
        if (state === 'hurt') {
            // > < eyes
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.moveTo(x - 25, y - 10); ctx.lineTo(x - 10, y + 5);
            ctx.moveTo(x - 10, y - 10); ctx.lineTo(x - 25, y + 5);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x + 10, y - 10); ctx.lineTo(x + 25, y + 5);
            ctx.moveTo(x + 25, y - 10); ctx.lineTo(x + 10, y + 5);
            ctx.stroke();
        } else {
            // Normal Eyes
            ctx.beginPath();
            ctx.ellipse(x - 15, y - 10, 6, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 15, y - 10, 6, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Eye Highlights
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(x - 15, y - 18, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 15, y - 18, 3, 0, Math.PI * 2);
            ctx.fill();
        }
      }

      // Blush
      ctx.fillStyle = COLOR_KIRBY_BLUSH;
      ctx.beginPath();
      ctx.ellipse(x - 35, y + 5, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 35, y + 5, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      if (state === 'idle') {
          ctx.beginPath();
          ctx.arc(x, y + 10, 5, 0, Math.PI, false); // Small smile
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'black';
          ctx.stroke();
      } else if (state === 'eat') {
          ctx.beginPath();
          ctx.arc(x, y + 10, 20, 0, Math.PI * 2); // Big open mouth
          ctx.fillStyle = '#991b1b'; // Dark red inside
          ctx.fill();
          // Tongue
          ctx.beginPath();
          ctx.arc(x, y + 20, 10, 0, Math.PI, false);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
      } else if (state === 'hurt') {
          // Hurt mouth
          ctx.beginPath();
          ctx.arc(x, y + 20, 8, 0, Math.PI * 2);
          ctx.fillStyle = 'black';
          ctx.fill();
      } else if (state === 'sleep') {
           // Sleep mouth (small o)
           ctx.beginPath();
           ctx.arc(x, y + 15, 3, 0, Math.PI * 2);
           ctx.fillStyle = 'black';
           ctx.fill();
      }
  };

  return (
    <div className="relative w-full h-full bg-mega-pink overflow-hidden cursor-none select-none">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
        className="block w-full h-full"
      />
      
      {/* HUD */}
      {gameState !== 'START' && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
              <div className="bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border-2 border-pink-200">
                  <div className="text-pink-600 font-bold text-xl font-display flex items-center gap-2">
                      <Trophy size={24} />
                      {score}
                      <span className="text-gray-400 text-sm ml-2">({selectedDifficulty})</span>
                  </div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border-2 border-pink-200 flex gap-2">
                  {[...Array(MAX_HEALTH)].map((_, i) => (
                      <Heart 
                        key={i} 
                        size={28} 
                        className={`${i < health ? 'fill-red-500 text-red-500' : 'text-gray-300'} transition-all`} 
                      />
                  ))}
              </div>
          </div>
      )}

      {/* Start Screen (Interactive) */}
      {gameState === 'START' && (
        <>
          {/* High Score Floating Text (Above Kirby) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[150px] pointer-events-none z-10 animate-float">
             <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border-2 border-yellow-300 flex flex-col items-center">
                <span className="text-xs font-bold text-yellow-600 uppercase tracking-wide flex items-center gap-1">
                  <Crown size={12} /> High Score
                </span>
                <span className="text-2xl font-black text-yellow-500 font-display">
                  {highScores[selectedDifficulty]}
                </span>
             </div>
          </div>

          {/* Main Wake Up Dialog (Center Bottom) */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-20 z-10 pointer-events-none">
              <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl shadow-xl text-center border-4 border-pink-300 animate-bounce-slow max-w-lg pointer-events-auto">
                  <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600 mb-2 font-display">
                      Wake Up Kirby!
                  </h1>
                  
                  <p className="text-gray-600 text-lg font-medium mb-4">
                      <span className="text-pink-600 font-bold">Nudge him with your shield</span> to wake him up!
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden border border-gray-300 relative">
                      <div 
                        className={`h-4 rounded-full transition-all duration-300 ease-out bg-gradient-to-r ${DIFFICULTY_SETTINGS[selectedDifficulty].color}`}
                        style={{ width: `${(wakeUpProgress / 5) * 100}%` }}
                      ></div>
                  </div>
                  <p className="text-xs text-gray-400 font-bold">{wakeUpProgress} / 5 Nudges</p>
              </div>
          </div>

          {/* Difficulty Selection (Left Side) */}
          <div className="absolute left-8 top-1/2 -translate-y-1/2 z-20 pointer-events-auto">
             <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border-4 border-pink-300 flex flex-col gap-3">
                <div className="text-center text-pink-500 font-bold font-display text-lg mb-1">Difficulty</div>
                {(Object.keys(DIFFICULTY_SETTINGS) as DifficultyLevel[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => setSelectedDifficulty(level)}
                        className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all transform hover:scale-105 active:scale-95 w-32
                          ${selectedDifficulty === level 
                            ? `bg-gradient-to-br ${DIFFICULTY_SETTINGS[level].color} text-white border-transparent shadow-md scale-105` 
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                          }
                        `}
                      >
                        <span className="font-display font-bold text-sm uppercase">{DIFFICULTY_SETTINGS[level].label}</span>
                        <span className={`text-[10px] leading-tight mt-1 ${selectedDifficulty === level ? 'text-white/90' : 'text-gray-400'}`}>
                           {DIFFICULTY_SETTINGS[level].description}
                        </span>
                      </button>
                    ))}
             </div>
          </div>
        </>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-20 pointer-events-auto">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border-4 border-red-200">
                  <div className="text-6xl mb-4 animate-pulse">😭</div>
                  <h2 className="text-4xl font-bold text-gray-800 mb-2 font-display">Oh no!</h2>
                  <p className="text-gray-500 mb-6">Kirby got a tummy ache.</p>
                  
                  <div className="bg-pink-50 rounded-xl p-6 mb-8 border border-pink-100 relative overflow-hidden">
                      {isNewHighScore && (
                        <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-bl-xl shadow-sm flex items-center gap-1">
                          <Crown size={12} fill="currentColor" /> NEW RECORD
                        </div>
                      )}
                      <div className="absolute top-2 left-2 opacity-10">
                        <Zap size={64} className="text-pink-900" />
                      </div>
                      
                      <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Final Score</div>
                      <div className="text-5xl font-extrabold text-pink-600 font-display mb-2">{score}</div>
                      
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-pink-200">
                        <div className="text-left">
                          <div className="text-xs text-gray-400 font-medium uppercase">Best Score</div>
                          <div className="text-lg font-bold text-gray-600 font-display">{highScores[selectedDifficulty]}</div>
                        </div>
                        <div className={`text-xs font-bold px-2 py-1 rounded text-white bg-gradient-to-r ${DIFFICULTY_SETTINGS[selectedDifficulty].color}`}>
                          {selectedDifficulty}
                        </div>
                      </div>
                  </div>

                  <button 
                    onClick={resetToMenu}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xl font-bold py-4 rounded-2xl shadow-lg transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
                  >
                      <RefreshCw /> Play Again
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default GameCanvas;