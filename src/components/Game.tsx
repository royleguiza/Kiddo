import React, { useEffect, useRef, useState } from 'react';
import { Entity, GameState } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, User } from 'lucide-react';

const WORLD_SIZE = 2500;
const INITIAL_SIZE = 20;
const BOT_COUNT = 15;
const FOOD_COUNT = 150;
const CANDY_TYPES = ['chocolate', 'lollipop', 'soda', 'gum', 'sweet', 'rabbit', 'cookie', 'red_lollipop'] as const;

const COLORS = [
  '#FFADAD', // Soft Red
  '#FFD6A5', // Soft Orange
  '#FDFFB6', // Soft Yellow
  '#CAFFBF', // Soft Green
  '#9BF6FF', // Soft Blue
  '#A0C4FF', // Soft Indigo
  '#BDB2FF', // Soft Purple
  '#FFC6FF', // Soft Pink
];

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [playerName, setPlayerName] = useState('Kiddo');
  const [isGlitchMode, setIsGlitchMode] = useState(false);
  const [glitchTimer, setGlitchTimer] = useState(0);
  const [sugarRush, setSugarRush] = useState(0); // 0 to 100

  // Game state stored in refs for performance (no re-renders during loop)
  const playerRef = useRef<Entity & { boost: boolean }>({
    id: 'player',
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    size: INITIAL_SIZE,
    color: '#FFADAD',
    type: 'player',
    name: 'You',
    boost: false
  });

  const entitiesRef = useRef<Entity[]>([]);
  const decorationsRef = useRef<{x: number, y: number, type: string, size: number, color: string}[]>([]);
  const particlesRef = useRef<{x: number, y: number, color: string, life: number, vx: number, vy: number, type?: string}[]>([]);
  const trailRef = useRef<{x: number, y: number, size: number, color: string, life: number}[]>([]);
  const cloudsRef = useRef<{x: number, y: number, size: number, speed: number}[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const mousePos = useRef({ x: 0, y: 0 });
  const viewport = useRef({ width: 0, height: 0 });
  const requestRef = useRef<number>(0);

  const createParticles = (x: number, y: number, color: string, count: number = 8, type: string = 'pixel') => {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        particlesRef.current.push({
            x, y, 
            color, 
            life: 1.0, 
            vx: Math.cos(angle) * speed, 
            vy: Math.sin(angle) * speed,
            type
        });
    }
  };

  const initGame = () => {
    playerRef.current = {
      id: 'player',
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      size: INITIAL_SIZE,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      type: 'player',
      name: playerName || 'Kiddo'
    };

    const newEntities: Entity[] = [];

    // Add Food
    for (let i = 0; i < FOOD_COUNT; i++) {
      newEntities.push(createFood());
    }

    // Add Bots
    for (let i = 0; i < BOT_COUNT; i++) {
      newEntities.push(createBot());
    }

    entitiesRef.current = newEntities;

    // Add Decorations (Candy Trees, etc)
    const newDecorations = [];
    for (let i = 0; i < 80; i++) {
        newDecorations.push({
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            type: Math.random() > 0.6 ? 'tree' : (Math.random() > 0.5 ? 'flower' : 'rock'),
            size: 20 + Math.random() * 50,
            color: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
    }
    decorationsRef.current = newDecorations;

    const newClouds = [];
    for (let i = 0; i < 15; i++) {
      newClouds.push({
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        size: 100 + Math.random() * 150,
        speed: 0.2 + Math.random() * 0.5
      });
    }
    cloudsRef.current = newClouds;

    particlesRef.current = [];
    trailRef.current = [];
    keysRef.current.clear();
    setScore(0);
    setGameState('playing');
  };

  const createFood = (): Entity => {
    // Randomly select across all types
    const candyType = CANDY_TYPES[Math.floor(Math.random() * CANDY_TYPES.length)];
    const isSpecial = candyType === 'rabbit';
    
    return {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      size: isSpecial ? 15 : 8,
      color: isSpecial ? '#6D4C41' : COLORS[Math.floor(Math.random() * COLORS.length)],
      type: 'food',
      candyType: candyType as any
    };
  };

  const createBot = (): Entity => {
    let x, y;
    const centerX = WORLD_SIZE / 2;
    const centerY = WORLD_SIZE / 2;
    const minSpawnDist = 600;

    // Ensure bots don't spawn right on top of the player's start position
    do {
      x = Math.random() * WORLD_SIZE;
      y = Math.random() * WORLD_SIZE;
    } while (Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) < minSpawnDist);

    return {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      size: INITIAL_SIZE + Math.random() * 20,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      type: 'bot',
      name: `Bot ${Math.floor(Math.random() * 100)}`,
      targetX: Math.random() * WORLD_SIZE,
      targetY: Math.random() * WORLD_SIZE
    };
  };

  const update = (delta: number) => {
    if (gameState !== 'playing') return;

    const player = playerRef.current;
    
    // Player movement
    let moveDX = 0;
    let moveDY = 0;

    // Keyboard support
    const keys = keysRef.current;
    if (keys.has('w') || keys.has('arrowup')) moveDY -= 1;
    if (keys.has('s') || keys.has('arrowdown')) moveDY += 1;
    if (keys.has('a') || keys.has('arrowleft')) moveDX -= 1;
    if (keys.has('d') || keys.has('arrowright')) moveDX += 1;

    // Boost with Space
    player.boost = keys.has(' ') && sugarRush > 0;
    if (player.boost) {
        setSugarRush(s => Math.max(0, s - 0.5));
    } else {
        setSugarRush(s => Math.min(100, s + 0.05));
    }

    // Mouse support (only if no keys are pressed)
    if (moveDX === 0 && moveDY === 0) {
      const mouseDX = mousePos.current.x - (viewport.current.width / 2);
      const mouseDY = mousePos.current.y - (viewport.current.height / 2);
      const dist = Math.sqrt(mouseDX * mouseDX + mouseDY * mouseDY);
      
      if (dist > 5) {
        moveDX = mouseDX / dist;
        moveDY = mouseDY / dist;
      }
    } else {
      // Normalize keyboard movement
      const dist = Math.sqrt(moveDX * moveDX + moveDY * moveDY);
      moveDX /= dist;
      moveDY /= dist;
    }
    
    if (moveDX !== 0 || moveDY !== 0) {
      let speed = Math.max(1, 4.5 - (player.size / 150)) * (delta / 16);
      if (player.boost) speed *= 1.8;

      player.x += moveDX * speed;
      player.y += moveDY * speed;
      
      // Add to trail
      if (Math.random() < (player.boost ? 0.8 : 0.3)) {
        trailRef.current.push({
          x: player.x,
          y: player.y,
          size: player.size * (player.boost ? 0.6 : 0.3),
          color: player.boost ? '#FFEB3B' : player.color, // Rainbow-ish gold if boosting
          life: 1.0
        });
      }
    }

    // Keep player in bounds
    player.x = Math.max(player.size, Math.min(WORLD_SIZE - player.size, player.x));
    player.y = Math.max(player.size, Math.min(WORLD_SIZE - player.size, player.y));

    // Update trail
    trailRef.current = trailRef.current
      .map(t => ({ ...t, life: t.life - 0.015, size: t.size * 0.98 }))
      .filter(t => t.life > 0);

    // Update Clouds
    cloudsRef.current.forEach(cloud => {
      cloud.x += cloud.speed;
      if (cloud.x > WORLD_SIZE + 200) cloud.x = -200;
    });

    // Update entities (Bots and Food)
    const newEntities = [...entitiesRef.current];
    
    for (let i = 0; i < newEntities.length; i++) {
      const entity = newEntities[i];

      if (entity.type === 'bot') {
        // Bot AI: Move towards target, change target occasionally
        if (!entity.targetX || Math.abs(entity.x - entity.targetX) < 10) {
          entity.targetX = Math.random() * WORLD_SIZE;
          entity.targetY = Math.random() * WORLD_SIZE;
        }
        const bdx = entity.targetX - entity.x;
        const bdy = entity.targetY - entity.y;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        const bspeed = Math.max(1, 3 - (entity.size / 100)) * (delta / 16);
        entity.x += (bdx / bdist) * bspeed;
        entity.y += (bdy / bdist) * bspeed;
        
        // Keep bot in bounds
        entity.x = Math.max(entity.size, Math.min(WORLD_SIZE - entity.size, entity.x));
        entity.y = Math.max(entity.size, Math.min(WORLD_SIZE - entity.size, entity.y));

        // Interaction between player and bot
        const distToPlayer = Math.sqrt(Math.pow(player.x - entity.x, 2) + Math.pow(player.y - entity.y, 2));
        if (distToPlayer < (player.size + entity.size) * 0.8) {
          if (player.size > entity.size * 1.15) {
            // Player eats bot
            player.size += entity.size * 0.2;
            setScore(s => s + Math.floor(entity.size));
            createParticles(entity.x, entity.y, '#FFD700', 20, 'star'); // Gold stars on bot eat
            newEntities[i] = createBot(); // Respawn bot
          } else if (entity.size > player.size * 1.15) {
            // Bot eats player
            setGameState('gameover');
          }
        }
      } else if (entity.type === 'food') {
         // Interaction between player and food
         const distToPlayer = Math.sqrt(Math.pow(player.x - entity.x, 2) + Math.pow(player.y - entity.y, 2));
         if (distToPlayer < player.size + entity.size) {
           const growth = entity.candyType === 'rabbit' ? 5 : 1;
           player.size += growth;
           setScore(s => s + (entity.candyType === 'rabbit' ? 50 : 10));
           createParticles(entity.x, entity.y, entity.color, 12, 'confetti');
           newEntities[i] = createFood(); // Respawn food
         }

         // Interaction between bots and food
         for (let j = 0; j < newEntities.length; j++) {
           const bot = newEntities[j];
           if (bot.type === 'bot') {
             const distToBot = Math.sqrt(Math.pow(bot.x - entity.x, 2) + Math.pow(bot.y - entity.y, 2));
             if (distToBot < bot.size + entity.size) {
               bot.size += 0.5;
               newEntities[i] = createFood();
               break;
             }
           }
         }
      }
    }
    
    entitiesRef.current = newEntities;

    // Update Particles
    particlesRef.current = particlesRef.current
      .map(p => ({ 
          ...p, 
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + (p.type === 'confetti' ? 0.1 : 0), // Gravity for confetti
          life: p.life - 0.02 
      }))
      .filter(p => p.life > 0);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { width, height } = viewport.current;
    ctx.clearRect(0, 0, width, height);

    const player = playerRef.current;
    
    // Calculate zoom based on player size: smaller zoom (zoomed out) as player grows
    const zoom = Math.max(0.3, 1.2 - (player.size / 400));
    const time = Date.now() / 1000;

    // Glitch effect logic
    if (isGlitchMode && Math.random() < 0.1) {
      ctx.translate(Math.random() * 20 - 10, Math.random() * 20 - 10);
      ctx.fillStyle = 'rgba(255,0,0,0.1)';
      ctx.fillRect(0, 0, width, height);
    }

    // Camera transform
    ctx.save();
    
    // Smooth Camera Sway
    const swayX = Math.sin(time * 0.5) * 10;
    const swayY = Math.cos(time * 0.4) * 10;

    // Scale and translate so player is centered
    ctx.scale(zoom, zoom);
    ctx.translate(width / (2 * zoom) - player.x + swayX, height / (2 * zoom) - player.y + swayY);

    // Draw Grid / Background
    ctx.strokeStyle = 'rgba(255,105,180,0.1)';
    ctx.lineWidth = 2;
    const gridSize = 150;
    for (let x = 0; x <= WORLD_SIZE; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_SIZE);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD_SIZE; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_SIZE, y);
      ctx.stroke();
    }

    // Draw Flowers on floor
    ctx.globalAlpha = 0.3;
    decorationsRef.current.forEach(dec => {
      if (dec.type === 'flower') {
        ctx.fillStyle = dec.color;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const ang = (Math.PI * 2 / 5) * i;
          ctx.arc(dec.x + Math.cos(ang) * 10, dec.y + Math.sin(ang) * 10, 8, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(dec.x, dec.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1.0;

    // Draw Trail
    trailRef.current.forEach(t => {
      ctx.globalAlpha = t.life * 0.5;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Decorations
    decorationsRef.current.forEach(dec => {
        // Culling
        const distToPlayer = Math.sqrt(Math.pow(player.x - dec.x, 2) + Math.pow(player.y - dec.y, 2));
        if (distToPlayer > Math.max(width, height) / (zoom * 0.8)) return;

        ctx.save();
        if (dec.type === 'tree') {
            // Lollipop Tree
            ctx.strokeStyle = '#8D6E63';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(dec.x, dec.y);
            ctx.lineTo(dec.x, dec.y - dec.size * 1.5);
            ctx.stroke();
            
            ctx.fillStyle = dec.color;
            ctx.beginPath();
            ctx.arc(dec.x, dec.y - dec.size * 1.5, dec.size, 0, Math.PI * 2);
            ctx.fill();
            // Swirl on tree
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(dec.x, dec.y - dec.size * 1.5, dec.size * 0.5, 0, Math.PI * 1.5);
            ctx.stroke();
        } else if (dec.type === 'rock') {
            // Chocolate Rock
            ctx.fillStyle = '#5D4037';
            ctx.beginPath();
            ctx.roundRect(dec.x - dec.size, dec.y - dec.size, dec.size * 2, dec.size, 10);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(dec.x - dec.size, dec.y - dec.size, dec.size * 2, 5);
        }
        ctx.restore();
    });

    // Draw Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    cloudsRef.current.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
      ctx.arc(c.x + c.size * 0.5, c.y + 20, c.size * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x - c.size * 0.5, c.y + 20, c.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });

    // World border (Candy Cane)
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.setLineDash([20, 20]);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.setLineDash([]);

    // Draw Entities
    entitiesRef.current.forEach(entity => {
      // Adjusted culling based on zoom
      const distToPlayer = Math.sqrt(Math.pow(player.x - entity.x, 2) + Math.pow(player.y - entity.y, 2));
      if (distToPlayer > Math.max(width, height) / (zoom * 0.8)) return;

      drawEntity(ctx, entity);
    });

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      if (p.type === 'star') {
          // Draw a tiny star
          const sz = 5 * p.life;
          for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI * 2 / 5);
            ctx.lineTo(p.x, p.y - sz);
            ctx.lineTo(p.x + sz/2, p.y + sz/2);
          }
      } else if (p.type === 'confetti') {
          ctx.fillRect(p.x, p.y, 4, 4);
      } else {
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Player
    drawEntity(ctx, player);

    ctx.restore();
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, entity: Entity) => {
    ctx.save();
    
    if (entity.type === 'food') {
      // Draw various candy shapes
      ctx.fillStyle = entity.color;
      if (entity.candyType === 'rabbit') {
         // Draw a simple chocolate rabbit shape
         ctx.translate(entity.x, entity.y);
         ctx.beginPath();
         // Body (Egg shape)
         ctx.ellipse(0, 5, entity.size, entity.size * 1.2, 0, 0, Math.PI * 2);
         ctx.fill();
         // Ears
         ctx.beginPath();
         ctx.ellipse(-entity.size / 2.5, -entity.size * 0.8, entity.size / 3.5, entity.size, Math.PI * 0.1, 0, Math.PI * 2);
         ctx.ellipse(entity.size / 2.5, -entity.size * 0.8, entity.size / 3.5, entity.size, -Math.PI * 0.1, 0, Math.PI * 2);
         ctx.fill();
         // Small nose
         ctx.fillStyle = '#ff80ab';
         ctx.beginPath();
         ctx.arc(0, 2, entity.size * 0.15, 0, Math.PI * 2);
         ctx.fill();
      } else if (entity.candyType === 'soda') {
         // Draw a soda can
         ctx.fillStyle = entity.color;
         ctx.roundRect(entity.x - entity.size * 0.7, entity.y - entity.size, entity.size * 1.4, entity.size * 2, 4);
         ctx.fill();
         // Can tab detail
         ctx.fillStyle = 'rgba(255,255,255,0.4)';
         ctx.fillRect(entity.x - entity.size * 0.3, entity.y - entity.size + 2, entity.size * 0.6, 2);
      } else if (entity.candyType === 'gum') {
         // Draw a shiny gumball
         const grad = ctx.createRadialGradient(entity.x - entity.size*0.3, entity.y - entity.size*0.3, 1, entity.x, entity.y, entity.size);
         grad.addColorStop(0, '#ffffff');
         grad.addColorStop(0.2, entity.color);
         grad.addColorStop(1, entity.color);
         ctx.fillStyle = grad;
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
         ctx.fill();
      } else if (entity.candyType === 'lollipop') {
         // Stick
         ctx.strokeStyle = '#e0e0e0';
         ctx.lineWidth = 2;
         ctx.beginPath();
         ctx.moveTo(entity.x, entity.y);
         ctx.lineTo(entity.x, entity.y + entity.size * 2);
         ctx.stroke();
         // Swirl
         ctx.fillStyle = entity.color;
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
         ctx.fill();
         ctx.strokeStyle = 'rgba(255,255,255,0.5)';
         ctx.lineWidth = 1.5;
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size * 0.6, 0, Math.PI * 1.5);
         ctx.stroke();
      } else if (entity.candyType === 'chocolate') {
         ctx.fillStyle = '#5D4037'; // Chocolate Brown
         ctx.roundRect(entity.x - entity.size, entity.y - entity.size/1.5, entity.size*2, entity.size*1.3, 4);
         ctx.fill();
         // Grid on chocolate
         ctx.strokeStyle = 'rgba(0,0,0,0.2)';
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(entity.x, entity.y - entity.size/1.5);
         ctx.lineTo(entity.x, entity.y + entity.size*0.6);
         ctx.stroke();
      } else if (entity.candyType === 'cookie') {
         // Cookie with chips
         ctx.fillStyle = '#D7B19D';
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
         ctx.fill();
         ctx.fillStyle = '#6D4C41';
         for(let i=0; i<4; i++) {
           const ang = (i * Math.PI * 2) / 4;
           ctx.beginPath();
           ctx.arc(entity.x + Math.cos(ang) * entity.size * 0.4, entity.y + Math.sin(ang) * entity.size * 0.4, entity.size * 0.2, 0, Math.PI * 2);
           ctx.fill();
         }
      } else if (entity.candyType === 'red_lollipop') {
         // Red "Tinto" Lollipop
         ctx.strokeStyle = '#e0e0e0';
         ctx.lineWidth = 2;
         ctx.beginPath();
         ctx.moveTo(entity.x, entity.y);
         ctx.lineTo(entity.x, entity.y + entity.size * 2);
         ctx.stroke();
         const tintoGrad = ctx.createRadialGradient(entity.x - entity.size*0.3, entity.y - entity.size*0.3, 1, entity.x, entity.y, entity.size);
         tintoGrad.addColorStop(0, '#ff1744');
         tintoGrad.addColorStop(1, '#880e4f');
         ctx.fillStyle = tintoGrad;
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
         ctx.fill();
      } else {
         // Generic sweet
         ctx.fillStyle = entity.color;
         ctx.beginPath();
         ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
         ctx.fill();
         // Wrappers
         ctx.beginPath();
         ctx.moveTo(entity.x - entity.size, entity.y);
         ctx.lineTo(entity.x - entity.size * 1.5, entity.y - entity.size/2);
         ctx.lineTo(entity.x - entity.size * 1.5, entity.y + entity.size/2);
         ctx.fill();
         ctx.beginPath();
         ctx.moveTo(entity.x + entity.size, entity.y);
         ctx.lineTo(entity.x + entity.size * 1.5, entity.y - entity.size/2);
         ctx.lineTo(entity.x + entity.size * 1.5, entity.y + entity.size/2);
         ctx.fill();
      }
    } else {
      // Player/Bot - Advanced Flower Design
      ctx.translate(entity.x, entity.y);
      
      // Animated Rotate for petals
      const time = Date.now() / 1000;
      const rotationSpeed = entity.type === 'player' ? 0.5 : 0.3;
      ctx.rotate(time * rotationSpeed);

      // Outer Glow
      ctx.shadowBlur = entity.size * 0.5;
      ctx.shadowColor = entity.color;
      
      // Petals (layered)
      const petalCount = 8;
      for (let j = 0; j < 2; j++) {
        const layerScale = j === 0 ? 1 : 0.7;
        const layerColor = j === 0 ? entity.color : 'white';
        ctx.fillStyle = layerColor;
        ctx.globalAlpha = j === 0 ? 1 : 0.5;
        
        for (let i = 0; i < petalCount; i++) {
          ctx.save();
          ctx.rotate((Math.PI * 2 / petalCount) * i + (j * 0.2));
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(
            entity.size * 1.5 * layerScale, -entity.size * 0.8 * layerScale,
            entity.size * 1.5 * layerScale, entity.size * 0.8 * layerScale,
            0, 0
          );
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1.0;

      // Center of the flower
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.size);
      grad.addColorStop(0, '#FFF9C4'); // Light yellow
      grad.addColorStop(1, '#FBC02D'); // Golden yellow
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, entity.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0; // Reset shadow for face

      // Face (Static rotation - keep eyes level)
      ctx.save();
      ctx.rotate(-(time * rotationSpeed)); // Counter-rotate face
      
      // Cheeks
      ctx.fillStyle = '#ff80ab';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(-entity.size * 0.5, 0, entity.size * 0.2, 0, Math.PI * 2);
      ctx.arc(entity.size * 0.5, 0, entity.size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Eyes
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(-entity.size * 0.3, -entity.size * 0.2, entity.size * 0.25, 0, Math.PI * 2);
      ctx.arc(entity.size * 0.3, -entity.size * 0.2, entity.size * 0.25, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'black';
      const blink = Math.sin(time * 2) > 0.98 ? 0.1 : 1;
      ctx.beginPath();
      ctx.ellipse(-entity.size * 0.3, -entity.size * 0.2, entity.size * 0.12, entity.size * 0.12 * blink, 0, 0, Math.PI * 2);
      ctx.ellipse(entity.size * 0.3, -entity.size * 0.2, entity.size * 0.12, entity.size * 0.12 * blink, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.strokeStyle = '#5D4037';
      ctx.lineWidth = Math.max(2, entity.size / 10);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, entity.size * 0.2, entity.size * 0.3, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // Name tag (Floating)
      if (entity.name) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.max(14, entity.size / 1.5)}px sans-serif`;
        ctx.textAlign = 'center';
        
        const textWidth = ctx.measureText(entity.name).width;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.roundRect(-textWidth/2 - 10, entity.size + 15, textWidth + 20, 25, 10);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.fillText(entity.name, 0, entity.size + 33);
      }
    }
    
    ctx.restore();
  };

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        viewport.current = {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        };
        if (canvasRef.current) {
          canvasRef.current.width = viewport.current.width;
          canvasRef.current.height = viewport.current.height;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);
      
      // Toggle Glitch Mode
      if (key === 'e') {
        setIsGlitchMode(prev => {
          if (!prev) {
            setScore(3000000);
            setGlitchTimer(15);
          } else {
            setGlitchTimer(0);
          }
          return !prev;
        });
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    handleResize();

    let lastTime = 0;
    let frameCount = 0;
    const loop = (time: number) => {
      // Artificially throttle framerate if in Glitch Mode
      // User requested 3 FPS, so we process every ~333ms
      if (isGlitchMode) {
        if (time - lastTime < 333) {
          requestRef.current = requestAnimationFrame(loop);
          return;
        }
      }

      // Use time - lastTime for the first frame if needed, but cap it
      const delta = lastTime === 0 ? 16 : Math.min(64, time - lastTime);
      lastTime = time;

      if (gameState === 'playing') {
        update(delta);
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) draw(ctx);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(requestRef.current);
    };
  }, [gameState]);

  useEffect(() => {
    if (!isGlitchMode || glitchTimer <= 0) return;

    const timer = setInterval(() => {
      setGlitchTimer(prev => {
        if (prev <= 1) {
          setIsGlitchMode(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isGlitchMode, glitchTimer]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && e.touches[0]) {
      mousePos.current = {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#fdf2f8] font-sans flex flex-col">
      {/* Background Pattern */}
      <div className="vibrant-pattern" />

      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        className="absolute inset-0 block cursor-none z-0"
      />

      {/* Theme Header */}
      <header className="h-20 bg-white/80 backdrop-blur-md border-b-4 border-pink-200 flex items-center justify-between px-10 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-pink-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg border-2 border-white">🌸</div>
          <h1 className="text-3xl font-black text-pink-600 tracking-tight italic">Flowercool.io <span className="text-orange-400">Kids</span></h1>
        </div>
        
        <div className="flex items-center gap-6">
          {gameState === 'playing' && (
            <button 
              onClick={() => setGameState('menu')}
              className="bg-white border-2 border-pink-200 text-pink-500 rounded-2xl px-5 py-2 font-black shadow-sm hover:bg-pink-50 transition-all active:scale-95 pointer-events-auto flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              MENÚ
            </button>
          )}
          <div className="bg-white rounded-full px-6 py-2 border-2 border-pink-100 shadow-sm flex items-center gap-3">
            <span className="text-xl">🍭</span>
            <span className="text-2xl font-black text-pink-500 tracking-tighter">{score.toLocaleString()}</span>
          </div>
          <div className="hidden sm:flex bg-orange-400 text-white rounded-full px-6 py-2 shadow-lg items-center gap-3">
            <span className="text-xl">⭐</span>
            <span className="text-2xl font-black">LVL {Math.floor(score / 500) + 1}</span>
          </div>
        </div>
      </header>

      {/* Main Game UI Layout */}
      <main className="flex-1 relative flex overflow-hidden p-6 gap-6 z-10 pointer-events-none">
        
        {/* Simulated Errors Overlay */}
        {isGlitchMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-24 left-10 p-4 bg-red-600/90 text-white font-mono text-xs rounded-xl border-2 border-red-400 shadow-2xl pointer-events-auto z-50 flex flex-col gap-1"
          >
            <div className="flex justify-between gap-4 font-black">
              <span>LATENCY:</span> <span className="text-yellow-300">675 ms</span>
            </div>
            <div className="flex justify-between gap-4 font-black">
              <span>FRAMERATE:</span> <span className="text-red-300">3 FPS</span>
            </div>
            <div className="flex justify-between gap-4 font-black text-blue-300">
              <span>PERF:</span> <span>480 mspt</span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 animate-pulse text-red-100 font-bold">
              CRITICAL SYSTEM ERROR ({glitchTimer}s)
            </div>
          </motion.div>
        )}

        {/* Left Side: Game Space (Invisible, but provides layout) */}
        <div className="flex-1" />

        {/* Right Side: Sidebar */}
        <aside className="w-72 flex flex-col gap-6 pointer-events-auto">
          {/* Leaderboard Card */}
          <div className="bg-white/90 rounded-[32px] p-6 shadow-xl border-2 border-pink-100 flex-1 flex flex-col">
            <h3 className="text-xl font-black text-pink-600 mb-4 flex items-center gap-2">🏆 LEADERBOARD</h3>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {[
                { name: 'KingCandy', score: '54.2k', rank: 1 },
                { name: 'SodaPop', score: '42.1k', rank: 2 },
                { name: 'Gumdrop', score: '38.9k', rank: 3 },
                { name: 'PaletaFan', score: '33.5k', rank: 4 },
                { name: playerName || 'You', score: `${(score/1000).toFixed(1)}k`, rank: 9, self: true }
              ].map((entry, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-2xl border-2 transition-all ${entry.self ? 'bg-pink-500 text-white border-pink-400 shadow-md' : 'border-transparent hover:bg-pink-50'}`}>
                  <span className={`font-bold ${!entry.self && entry.rank === 1 ? 'text-yellow-700' : ''}`}>
                    {entry.rank}. {entry.name}
                  </span>
                  <span className="font-mono font-bold opacity-80">{entry.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Quest Card */}
          <div className="bg-indigo-600 rounded-[32px] p-6 shadow-xl text-white">
            <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest mb-2">Misión Diaria</h3>
            <p className="text-lg font-black leading-tight mb-4">¡Come 10 Conejos! 🍫🐰</p>
            <div className="w-full bg-indigo-900/50 h-4 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (score / 1000) * 100)}%` }}
                className="bg-yellow-400 h-full" 
              />
            </div>
            <div className="mt-2 text-right text-xs font-bold opacity-80">PROGRESO</div>
          </div>
        </aside>
      </main>

      {/* Theme Footer */}
      <footer className="h-24 bg-white/60 backdrop-blur-md px-10 flex items-center gap-6 border-t-2 border-pink-100 z-10 shrink-0">
        <div className="flex-1 flex gap-4">
          <button className="w-16 h-16 bg-white rounded-2xl border-4 border-orange-400 shadow-md flex items-center justify-center text-3xl hover:scale-110 transition-transform active:scale-95">⚡</button>
          <button className="w-16 h-16 bg-white rounded-2xl border-4 border-blue-400 shadow-md flex items-center justify-center text-3xl hover:scale-110 transition-transform active:scale-95">🛡️</button>
          <button className="w-16 h-16 bg-white rounded-2xl border-4 border-purple-400 shadow-md flex items-center justify-center text-3xl opacity-50 cursor-not-allowed">💎</button>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 border-white shadow-sm ${i <= 3 ? 'bg-red-500' : 'bg-gray-200'}`}></div>
            ))}
            <div className="w-4 h-4 rounded-full bg-gray-200 border-2 border-white shadow-sm"></div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-pink-400 tracking-widest uppercase">Energía (Sugar Rush - ESPACIO)</span>
            <div className="w-48 h-3 bg-gray-100 rounded-full border-2 border-white shadow-sm overflow-hidden mt-1">
                <motion.div 
                    animate={{ width: `${sugarRush}%`, backgroundColor: sugarRush > 30 ? '#ff4081' : '#f44336' }}
                    className="h-full"
                />
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>        {gameState === 'menu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-pink-50/60 backdrop-blur-xl z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-10 rounded-[50px] shadow-[0_32px_64px_-12px_rgba(244,114,182,0.3)] border-8 border-pink-100 max-w-lg w-full text-center relative overflow-hidden"
            >
              {/* Pattern inside modal */}
              <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-pink-50 to-white -z-10" />
              
              <div className="mb-10">
                 <div className="w-32 h-32 bg-yellow-100 rounded-[40px] border-8 border-yellow-300 flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3 relative">
                    <span className="text-7xl">🐰</span>
                    <div className="absolute -top-4 -right-4 bg-pink-500 text-white text-xs font-bold px-4 py-2 rounded-full border-4 border-white shadow-lg animate-bounce">
                      NEW!
                    </div>
                 </div>
                 <h2 className="text-5xl font-black text-gray-800 mb-3 tracking-tight">¡Hola! 🌸</h2>
                 <p className="text-xl text-gray-400 font-medium px-4">¡Domina el jardín de dulces y conviértete en el rey de las golosinas!</p>
              </div>

              <div className="relative mb-8 group">
                 <div className="absolute inset-0 bg-pink-200 rounded-3xl blur-md opacity-20 group-focus-within:opacity-40 transition-opacity" />
                 <div className="relative bg-gray-50 rounded-3xl border-4 border-white shadow-inner p-2">
                   <div className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl opacity-40">👤</div>
                   <input
                     type="text"
                     value={playerName}
                     onChange={(e) => setPlayerName(e.target.value)}
                     className="w-full py-5 pl-16 pr-8 rounded-2xl bg-transparent focus:outline-none text-center text-2xl font-black text-pink-600 placeholder:text-gray-300"
                     placeholder="Tu nombre aquí..."
                   />
                 </div>
              </div>

              <button
                onClick={initGame}
                className="w-full py-6 bg-gradient-to-br from-pink-500 via-pink-600 to-orange-400 text-white rounded-[32px] font-black text-3xl shadow-[0_20px_40px_-5px_rgba(236,72,153,0.4)] hover:shadow-[0_25px_50px_-5px_rgba(236,72,153,0.5)] transition-all hover:-translate-y-1 active:translate-y-1 flex items-center justify-center gap-4 border-t-4 border-pink-400"
              >
                <div className="bg-white/20 p-2 rounded-xl">
                  <Play className="fill-current w-8 h-8" />
                </div>
                ¡VAMOS!
              </button>

              <button
                onClick={() => {
                  const newState = !isGlitchMode;
                  setIsGlitchMode(newState);
                  if (newState) {
                    setScore(3000000);
                    setGlitchTimer(15);
                  } else {
                    setGlitchTimer(0);
                  }
                }}
                className={`mt-4 w-full py-3 rounded-2xl font-bold transition-all ${isGlitchMode ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
              >
                {isGlitchMode ? `⚠️ ERROR: ${glitchTimer}s` : 'Activar Errores (Glitch)'}
              </button>

              <div className="mt-12 flex justify-center gap-6">
                {['🥤', '🍫', '🍭', '🍬', '🐰'].map((emoji, idx) => (
                  <motion.div
                    key={idx}
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 2, delay: idx * 0.2 }}
                    className="text-3xl grayscale hover:grayscale-0 transition-all cursor-help"
                  >
                    {emoji}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-indigo-950/40 backdrop-blur-md z-50 px-4"
          >
             <motion.div 
               initial={{ scale: 0.9, rotate: -2 }}
               animate={{ scale: 1, rotate: 0 }}
               className="bg-white p-12 rounded-[60px] shadow-[0_45px_100px_-20px_rgba(0,0,0,0.5)] border-[12px] border-white text-center max-w-md w-full relative"
             >
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-32 bg-red-100 rounded-full border-8 border-white shadow-2xl flex items-center justify-center text-7xl">
                  😵
                </div>
                
                <h2 className="text-6xl font-black text-gray-900 mb-6 mt-8 tracking-tighter">FIN DEL JUEGO</h2>
                
                <div className="bg-pink-50 rounded-[40px] p-8 mb-10 border-4 border-pink-100 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Trophy className="w-20 h-20 rotate-12" />
                  </div>
                  <p className="text-xs uppercase font-black text-pink-400 tracking-[0.2em] mb-2">Puntuación Final</p>
                  <p className="text-7xl font-black text-pink-600 drop-shadow-sm">{score.toLocaleString()}</p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={initGame}
                    className="w-full py-6 bg-indigo-600 text-white rounded-[32px] font-black text-2xl shadow-xl hover:shadow-2xl transition-all hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-4 border-b-8 border-indigo-800"
                  >
                    <RotateCcw className="w-8 h-8" />
                    REINTENTAR
                  </button>
                  
                  <button
                    onClick={() => setGameState('menu')}
                    className="w-full py-4 text-gray-400 font-black text-lg hover:text-gray-600 transition-colors"
                  >
                    VOLVER AL MENÚ
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini-map or something else fun could go here */}
    </div>
  );
}
