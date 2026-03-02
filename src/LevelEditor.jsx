import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, Plus, Minus, MousePointer2, Grid3x3, Layers, Route, Trash2, Map, Check, Clock, Wand2, Download, Gamepad2, Play, Users, Skull, ChevronDown, ChevronUp, Settings2, ZoomIn, ZoomOut } from 'lucide-react';

// ==========================================
// 1. 基础配置与默认字典
// ==========================================
const TILE_TYPES = { GROUND: 0, HIGH: 1, WALL: 2, SPAWN: 3, BASE: 4, PORTAL_IN: 5, PORTAL_OUT: 6 };
const CELL_SIZE = 80;

const TILE_STYLES = {
  [TILE_TYPES.GROUND]: "bg-stone-300 hover:bg-stone-400",
  [TILE_TYPES.HIGH]: "bg-stone-100 shadow-[inset_0_4px_4px_rgba(0,0,0,0.1)] hover:bg-stone-200 relative after:content-[''] after:absolute after:inset-1 after:border after:border-stone-200",
  [TILE_TYPES.WALL]: "bg-stone-800 hover:bg-stone-700 crosshatch",
  [TILE_TYPES.SPAWN]: "bg-red-500 text-white font-bold text-xs flex flex-col items-center justify-center",
  [TILE_TYPES.BASE]: "bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center",
  [TILE_TYPES.PORTAL_IN]: "bg-stone-300 border-2 border-dashed border-stone-500 hover:bg-stone-400",
  [TILE_TYPES.PORTAL_OUT]: "bg-stone-300 border-2 border-dashed border-stone-500 hover:bg-stone-400"
};

const TILE_NAMES = { 
  [TILE_TYPES.GROUND]: "地面(近战)", [TILE_TYPES.HIGH]: "高台(远程)", [TILE_TYPES.WALL]: "障碍物", 
  [TILE_TYPES.SPAWN]: "红门(起点)", [TILE_TYPES.BASE]: "蓝门(终点)",
  [TILE_TYPES.PORTAL_IN]: "进口 (IN)", [TILE_TYPES.PORTAL_OUT]: "出口 (OUT)"
};

const OPERATOR_CLASSES = ['先锋', '近卫', '重装', '狙击', '术师', '医疗', '辅助', '特种'];

const getPortalColor = (level, x, y, type) => {
  if (type === TILE_TYPES.PORTAL_IN) return level.portals?.[`${x},${y}`]?.color;
  if (type === TILE_TYPES.PORTAL_OUT) {
      const matchingIn = Object.values(level.portals || {}).find(p => p.outX === x && p.outY === y);
      return matchingIn?.color;
  }
  return null;
};

// 获取下一个可用 ID 的纯函数 (持久化先来后到，填补空缺)
const getNextPortalId = (prefix, idMap) => {
  const used = Object.values(idMap)
    .filter(id => id.startsWith(prefix))
    .map(id => parseInt(id.replace(prefix, '')))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  let next = 1;
  for (let n of used) {
    if (n === next) next++;
    else if (n > next) break;
  }
  return `${prefix}${next}`;
};

// ==========================================
// 2. 数据结构模型
// ==========================================
const DEFAULT_ENEMIES = [
  { id: 'basic_soldier', name: '源石虫', movementType: 'GROUND', blockCost: 1, specialMechanic: '', hp: 300, atk: 25, def: 0, attackSpeed: 1.0, speed: 1.0, color: '#ef4444' },
  { id: 'heavy_defender', name: '重装兵', movementType: 'GROUND', blockCost: 2, specialMechanic: '', hp: 1200, atk: 50, def: 200, attackSpeed: 0.5, speed: 0.5, color: '#7f1d1d' },
  { id: 'drone', name: '侦察机', movementType: 'FLYING', blockCost: 0, specialMechanic: '无法被阻挡', hp: 200, atk: 30, def: 0, attackSpeed: 1.2, speed: 1.2, color: '#38bdf8' }
];

const DEFAULT_OPERATORS = [
  { id: 'vanguard_1', name: '先锋', className: '先锋', combatType: 'MELEE', type: TILE_TYPES.GROUND, cost: 10, block: 2, hp: 1000, atk: 40, def: 150, attackSpeed: 1.0, range: 1, targetCount: 1, color: '#eab308' },
  { id: 'guard_1', name: '群攻近卫', className: '近卫', combatType: 'MELEE', type: TILE_TYPES.GROUND, cost: 20, block: 2, hp: 1800, atk: 70, def: 200, attackSpeed: 1.2, range: 1, targetCount: 2, color: '#f97316' },
  { id: 'defender_1', name: '重装', className: '重装', combatType: 'MELEE', type: TILE_TYPES.GROUND, cost: 18, block: 3, hp: 3000, atk: 15, def: 400, attackSpeed: 0.8, range: 0, targetCount: 1, color: '#64748b' },
  { id: 'sniper_1', name: '速射狙击', className: '狙击', combatType: 'RANGED', type: TILE_TYPES.HIGH, cost: 12, block: 0, hp: 500, atk: 50, def: 20, attackSpeed: 1.0, range: 3, targetCount: 1, color: '#3b82f6' },
  { id: 'caster_1', name: '群攻术师', className: '术师', combatType: 'RANGED', type: TILE_TYPES.HIGH, cost: 30, block: 0, hp: 600, atk: 90, def: 20, attackSpeed: 0.5, range: 2, targetCount: 3, color: '#a855f7' }
];

const INITIAL_LEVEL = {
  version: "1.8", levelId: "level_01", name: "虫洞攻防 LV1.8",
  gridWidth: 10, gridHeight: 6, baseHealth: 3, initialDp: 20, 
  dpRecoveryInterval: 1.0, dpRecoveryAmount: 1, 
  portals: { "3,1": { outX: 5, outY: 1, delay: 1.0, color: '#a855f7' } }, 
  portalIdMap: { "3,1": "IN1", "5,1": "OUT1" },
  mapData: [
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 0, 0, 5, 2, 6, 0, 0, 0, 4],
    [2, 1, 1, 1, 0, 1, 1, 1, 1, 2],
    [2, 2, 2, 2, 0, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 0, 0, 0, 0, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
  ],
  waves: [{ waveId: "w_1", time: 3.0, enemyType: "basic_soldier", count: 3, interval: 2.0, spawnId: "R1", targetId: "B1", path: [] }],
  enemies: DEFAULT_ENEMIES, operators: DEFAULT_OPERATORS
};

// ==========================================
// 3. 核心游戏引擎 (PlayMode)
// ==========================================
const PlayMode = ({ level, onExit }) => {
  const engine = useRef({
    state: 'PLAYING', time: 0, dp: level?.initialDp ?? 0, baseHp: level?.baseHealth ?? 3,
    dpTimer: 0, enemies: [], towers: [], projectiles: [],
    waveProgress: (level?.waves || []).map(() => ({ count: 0, lastSpawnTime: -999 }))
  });

  const [tick, setTick] = useState(0);
  const operators = level?.operators || DEFAULT_OPERATORS;
  const enemyDefs = level?.enemies || DEFAULT_ENEMIES;
  const [selectedOp, setSelectedOp] = useState(operators[0]);
  const [zoom, setZoom] = useState(1);

  const calcDamage = (atk, def) => Math.max(atk * 0.05, atk - def);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId;

    const gameLoop = (currentTime) => {
      const state = engine.current;
      if (state.state !== 'PLAYING') return;

      let dt = (currentTime - lastTime) / 1000;
      if (dt > 0.1) dt = 0.1; 
      lastTime = currentTime;

      state.time += dt;
      
      const interval = level.dpRecoveryInterval ?? 1;
      const amount = level.dpRecoveryAmount ?? 1;
      if (interval > 0) {
        state.dpTimer += dt;
        if (state.dpTimer >= interval) {
          const ticks = Math.floor(state.dpTimer / interval);
          state.dp = Math.min(99, state.dp + ticks * amount);
          state.dpTimer -= ticks * interval; 
        }
      }
      
      (level.waves || []).forEach((wave, wIdx) => {
        const progress = state.waveProgress[wIdx];
        if (state.time >= wave.time && progress.count < wave.count) {
          if (state.time - progress.lastSpawnTime >= wave.interval) {
            progress.count++; progress.lastSpawnTime = state.time;
            const def = enemyDefs.find(e => e.id === wave.enemyType) || enemyDefs[0];
            if (wave.path && wave.path.length > 0) {
              state.enemies.push({
                ...def, id: `e_${Date.now()}_${Math.random()}`,
                maxHp: def.hp, hp: def.hp, x: wave.path[0].x, y: wave.path[0].y,
                path: wave.path, pathIndex: 0, waitTimer: 0, blockedBy: null, attackCooldown: 0,
                isTeleporting: false, teleportTimer: 0, teleportTargetX: 0, teleportTargetY: 0
              });
            }
          }
        }
      });

      state.enemies.forEach(e => { if (e.blockedBy && !state.towers.find(t => t.id === e.blockedBy)) e.blockedBy = null; });

      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (e.hp <= 0) {
          state.enemies.splice(i, 1);
          state.towers.forEach(t => t.blocking = t.blocking.filter(id => id !== e.id));
          continue;
        }

        // 核心：在传送期间，时间流逝且免疫一切交互，并且【留在原地】
        if (e.isTeleporting) {
          e.teleportTimer -= dt;
          if (e.teleportTimer <= 0) {
            e.isTeleporting = false;
            e.x = e.teleportTargetX; // 倒计时结束瞬间，坐标才真正赋予出口
            e.y = e.teleportTargetY;
            e.pathIndex++; // 完成跳跃，逻辑上步入下一格
          }
          continue;
        }

        if (e.pathIndex < e.path.length - 1) {
          const currGridX = Math.round(e.x); const currGridY = Math.round(e.y);

          if (!e.blockedBy && e.movementType !== 'FLYING') {
            const blockingTower = state.towers.find(t => {
              if (t.x !== currGridX || t.y !== currGridY || t.block <= 0) return false;
              const currentWeight = t.blocking.reduce((sum, id) => sum + (state.enemies.find(en => en.id === id)?.blockCost || 1), 0);
              return currentWeight + (e.blockCost || 1) <= t.block;
            });
            if (blockingTower) {
              e.blockedBy = blockingTower.id; blockingTower.blocking.push(e.id);
              e.x = currGridX + (blockingTower.blocking.length - 1) * 0.1; e.y = currGridY + (blockingTower.blocking.length - 1) * 0.1;
            }
          }

          if (!e.blockedBy) {
            const target = e.path[e.pathIndex + 1];
            if (e.waitTimer > 0) e.waitTimer -= dt; 
            else {
              const dx = target.x - e.x; const dy = target.y - e.y; const dist = Math.hypot(dx, dy);
              if (dist < 0.05) { 
                e.x = target.x; e.y = target.y; e.pathIndex++; 
                if (target.wait > 0) e.waitTimer = target.wait; 

                // 核心：精准对齐传送判定节点
                const currTileType = level.mapData[Math.round(e.y)]?.[Math.round(e.x)];
                if (currTileType === TILE_TYPES.PORTAL_IN && e.pathIndex < e.path.length - 1) {
                    const nextTarget = e.path[e.pathIndex + 1]; // 下一步的目标
                    const pCfg = level.portals?.[`${Math.round(e.x)},${Math.round(e.y)}`];
                    
                    if (pCfg && nextTarget && pCfg.outX === nextTarget.x && pCfg.outY === nextTarget.y) {
                        e.isTeleporting = true; 
                        e.teleportTimer = pCfg.delay || 0;
                        e.teleportTargetX = pCfg.outX;
                        e.teleportTargetY = pCfg.outY;
                    }
                }
              } 
              else { 
                const move = Math.min(dist, Math.max(0.1, e.speed) * dt); 
                e.x += (dx / dist) * move; 
                e.y += (dy / dist) * move; 
              }
            }
          } else {
            e.attackCooldown -= dt;
            if (e.attackCooldown <= 0) {
              const targetTower = state.towers.find(t => t.id === e.blockedBy);
              if (targetTower) {
                targetTower.hp -= calcDamage(e.atk, targetTower.def); e.attackCooldown = 1 / e.attackSpeed;
                state.projectiles.push({ id: `p_${Math.random()}`, x1: e.x, y1: e.y, x2: targetTower.x, y2: targetTower.y, color: e.color, age: 0, duration: 0.1, type: 'HIT' });
              }
            }
          }
        } else {
          state.baseHp -= 1; state.enemies.splice(i, 1);
          state.towers.forEach(t => t.blocking = t.blocking.filter(id => id !== e.id));
          if (state.baseHp <= 0) state.state = 'LOSE';
        }
      }

      for (let i = state.towers.length - 1; i >= 0; i--) {
        const t = state.towers[i];
        if (t.hp <= 0) {
          state.enemies.forEach(e => { if (e.blockedBy === t.id) e.blockedBy = null; });
          state.towers.splice(i, 1); continue;
        }

        if (t.cooldown > 0) t.cooldown -= dt;
        if (t.cooldown <= 0) {
          let targets = [];
          if (t.blocking.length > 0) targets.push(...state.enemies.filter(e => t.blocking.includes(e.id)));

          if (targets.length < (t.targetCount || 1)) {
            for (const e of state.enemies) {
              if (e.isTeleporting) continue; 
              if (targets.find(x => x.id === e.id)) continue;
              if (t.combatType === 'MELEE' && e.movementType === 'FLYING') continue; 
              
              const enemyGridX = Math.round(e.x); const enemyGridY = Math.round(e.y);
              const manhattanDist = Math.abs(enemyGridX - t.x) + Math.abs(enemyGridY - t.y);
              
              if (manhattanDist <= (t.range || 0)) {
                targets.push(e);
                if (targets.length >= (t.targetCount || 1)) break;
              }
            }
          }

          targets = targets.slice(0, t.targetCount || 1);

          if (targets.length > 0) {
            targets.forEach(target => {
              target.hp -= calcDamage(t.atk, target.def);
              const isRanged = t.combatType === 'RANGED';
              state.projectiles.push({ 
                id: `p_${Math.random()}`, x1: t.x, y1: t.y, x2: target.x, y2: target.y, 
                color: isRanged ? '#38bdf8' : t.color, age: 0, duration: isRanged ? 0.25 : 0.1, type: isRanged ? 'LASER' : 'SLASH' 
              });
            });
            t.cooldown = 1 / t.attackSpeed;
            if (t.className === '先锋') state.dp += 1; 
          }
        }
      }

      state.projectiles.forEach(p => p.age += dt);
      state.projectiles = state.projectiles.filter(p => p.age < p.duration);

      if (state.state === 'PLAYING') {
        const allSpawned = state.waveProgress.every((p, i) => p.count >= ((level?.waves || [])[i]?.count || 0));
        if (allSpawned && state.enemies.length === 0) state.state = 'WIN';
      }

      setTick(t => (t + 1) % 60); 
      frameId = requestAnimationFrame(gameLoop);
    };

    frameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameId);
  }, [level, enemyDefs]);

  const handleGridClick = (x, y) => {
    const state = engine.current; if (state.state !== 'PLAYING') return;
    const cellType = level.mapData[y][x]; if (cellType !== selectedOp.type) return;
    if (state.towers.some(t => t.x === x && t.y === y)) return;
    if (state.dp >= selectedOp.cost) {
      state.dp -= selectedOp.cost;
      state.towers.push({ ...selectedOp, id: `t_${Date.now()}`, x, y, cooldown: 0, maxHp: selectedOp.hp, hp: selectedOp.hp, blocking: [] });
    }
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(2, z + (e.deltaY > 0 ? -0.1 : 0.1)))); }
  };

  const st = engine.current; const gridW = level?.gridWidth || 10; const gridH = level?.gridHeight || 6;

  return (
    <div className="flex flex-col items-center animate-in fade-in duration-300 w-full h-full overflow-hidden" onWheel={handleWheel}>
      <div className="w-full max-w-4xl bg-neutral-900 border border-neutral-700 rounded-xl p-4 shadow-xl mb-4 flex justify-between items-center flex-shrink-0 z-20">
        <div className="flex gap-8">
          <div className="text-center"><div className="text-xs text-neutral-400 font-bold mb-1">部署费用 (DP)</div><div className="text-3xl font-black text-blue-400 font-mono">{Math.floor(st.dp)}</div></div>
          <div className="text-center"><div className="text-xs text-neutral-400 font-bold mb-1">基地生命 (HP)</div><div className={`text-3xl font-black font-mono ${st.baseHp > 0 ? 'text-red-500' : 'text-neutral-600'}`}>{"♥".repeat(Math.max(0, st.baseHp))}</div></div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {operators.map(op => (
            <button key={op.id} onClick={() => setSelectedOp(op)} className={`relative p-2 rounded-lg border-2 transition-all flex flex-col items-center min-w-[72px] flex-shrink-0 ${selectedOp.id === op.id ? 'border-yellow-400 bg-neutral-800 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : 'border-neutral-700 bg-neutral-950 hover:border-neutral-500'} ${st.dp < op.cost ? 'opacity-50 grayscale' : ''}`}>
              <div className="absolute -top-3 -right-2 bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-md border border-blue-400">{op.cost}</div>
              <div className="w-5 h-5 rounded-full mb-1 border border-white/20" style={{backgroundColor: op.color}} />
              <div className="text-[10px] font-bold text-neutral-200">{op.name.substring(0,4)}</div>
              <div className="text-[9px] text-neutral-500 mt-0.5">{op.className} | {op.combatType === 'RANGED' ? '远' : '近'}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full bg-neutral-950 relative overflow-hidden rounded-xl border-4 border-neutral-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="absolute top-4 right-4 z-40 flex items-center gap-1 bg-neutral-800/90 backdrop-blur border border-neutral-700 rounded-lg p-1 shadow-lg">
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="放大"><ZoomIn size={16}/></button>
          <span className="text-xs font-mono text-neutral-400 w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="缩小"><ZoomOut size={16}/></button>
          <button onClick={() => setZoom(1)} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white text-[10px] font-bold transition-colors" title="恢复 1:1">1:1</button>
        </div>

        <div className="absolute bottom-4 left-4 z-40 flex flex-col gap-1.5 items-start pointer-events-none opacity-70 hover:opacity-100 transition-opacity">
           <div className={`bg-neutral-900/60 backdrop-blur-sm border border-neutral-700/50 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[10px] transition-colors shadow-sm text-neutral-400`}>
             <span>🖱️ 试玩中 | 按住 Ctrl/Cmd + 滚轮缩放</span>
           </div>
        </div>

        {st.state !== 'PLAYING' && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in zoom-in-95">
            <h2 className={`text-4xl md:text-6xl font-black tracking-widest mb-6 ${st.state === 'WIN' ? 'text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'text-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]'}`}>{st.state === 'WIN' ? 'OPERATION CLEAR' : 'OPERATION FAILED'}</h2>
            <button onClick={onExit} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform text-lg shadow-xl pointer-events-auto">返回大厅</button>
          </div>
        )}

        <div className="w-full h-full overflow-auto custom-scrollbar bg-neutral-950">
          <div className="w-max h-max min-w-full min-h-full p-16 md:p-32 grid place-items-center">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.1s ease-out' }}>
                <div className="relative bg-neutral-700 shadow-2xl select-none" style={{ width: `${gridW * CELL_SIZE}px`, height: `${gridH * CELL_SIZE}px` }}>
                  
                  <div className="grid absolute inset-0" style={{ gridTemplateColumns: `repeat(${gridW}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${gridH}, ${CELL_SIZE}px)` }}>
                    {(level?.mapData || []).map((row, y) => row.map((cellType, x) => {
                      const customColor = getPortalColor(level, x, y, cellType);
                      const portalStyle = customColor ? { borderColor: customColor, boxShadow: `inset 0 0 15px ${customColor}80` } : {};
                      return (
                      <div key={`${x}-${y}`} onClick={() => handleGridClick(x, y)} className={`relative cursor-crosshair border border-black/20 transition-all hover:brightness-125 hover:border-white/30 ${TILE_STYLES[cellType]} ${selectedOp.type === cellType ? 'hover:shadow-[inset_0_0_15px_rgba(255,255,255,0.4)]' : ''}`} style={customColor ? portalStyle : undefined}>
                        {cellType === TILE_TYPES.SPAWN && <span className="absolute inset-0 flex items-center justify-center opacity-30 text-xs font-bold pointer-events-none">出怪</span>}
                        {cellType === TILE_TYPES.BASE && <span className="absolute inset-0 flex items-center justify-center opacity-30 text-xs font-bold pointer-events-none">终点</span>}
                        
                        {(cellType === TILE_TYPES.PORTAL_IN || cellType === TILE_TYPES.PORTAL_OUT) && (
                          <span className="absolute flex items-center justify-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-md pointer-events-none" style={{backgroundColor: customColor || '#a855f7'}}>
                            {level.portalIdMap?.[`${x},${y}`]}
                          </span>
                        )}
                      </div>
                    )}))}
                  </div>

                  <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                    {st.towers.map(t => (
                      <div key={t.id} className="absolute flex flex-col items-center justify-center" style={{ left: `${t.x * CELL_SIZE}px`, top: `${t.y * CELL_SIZE}px`, width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px` }}>
                        <div className="absolute top-1 w-10 h-1.5 bg-neutral-900 rounded-full border border-neutral-700 overflow-hidden z-20"><div className="h-full bg-green-500 transition-all" style={{ width: `${Math.max(0, (t.hp / t.maxHp) * 100)}%` }} /></div>
                        {t.block > 0 && <div className="absolute bottom-1 text-[9px] font-bold bg-black/80 px-1.5 py-0.5 rounded text-neutral-300 z-20">挡 {t.blocking.reduce((s, id)=>s+(st.enemies.find(e=>e.id===id)?.blockCost||1),0)}/{t.block}</div>}
                        
                        <div className="w-2/3 h-2/3 rounded-md shadow-lg border-2 border-white flex items-center justify-center relative" style={{ backgroundColor: t.color }}>
                          <div className="absolute border border-dashed rounded-full opacity-10 animate-[spin_10s_linear_infinite]" style={{ borderColor: t.color, width: `${((t.range||0) * 2 + 1) * 100}%`, height: `${((t.range||0) * 2 + 1) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    {st.enemies.map(e => (
                      // 核心修复：彻底移除 left/top 的 transition 动画干涉，只保留透明度和缩放的渐变！
                      <div key={e.id} className={`absolute flex items-center justify-center transition-[opacity,transform] duration-300 ${e.isTeleporting ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`} style={{ left: `${e.x * CELL_SIZE}px`, top: `${e.y * CELL_SIZE}px`, width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px` }}>
                        <div className={`relative flex flex-col items-center ${e.movementType === 'FLYING' ? 'drop-shadow-2xl -translate-y-2' : ''}`}>
                          <span className="absolute -top-7 text-[10px] font-bold text-white whitespace-nowrap bg-black/60 px-1.5 py-0.5 rounded shadow-sm z-20">{e.name.split(' ')[0]}</span>
                          <div className="w-10 h-1.5 bg-neutral-900 rounded-full mb-1 border border-neutral-700 overflow-hidden z-10"><div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%` }} /></div>
                          <div className={`w-8 h-8 rounded-full shadow-lg border-2 ${e.blockedBy ? 'border-yellow-400' : 'border-white animate-bounce'}`} style={{ backgroundColor: e.color, animationDuration: `${0.5 / e.speed}s` }}>
                            {e.movementType === 'FLYING' && <div className="absolute inset-0 flex items-center justify-center text-[10px]">✈️</div>}
                          </div>
                          {e.blockedBy && <span className="absolute -bottom-5 text-[10px] font-black text-red-500 drop-shadow-md">交战!</span>}
                        </div>
                      </div>
                    ))}
                    
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                      {st.projectiles.map(p => {
                        const x1 = (p.x1 + 0.5) * CELL_SIZE; const y1 = (p.y1 + 0.5) * CELL_SIZE;
                        const x2 = (p.x2 + 0.5) * CELL_SIZE; const y2 = (p.y2 + 0.5) * CELL_SIZE;
                        const opac = Math.max(0, 1 - (p.age / p.duration));
                        if (p.type === 'LASER') return <line key={p.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.color} strokeWidth="4" strokeLinecap="round" className="opacity-80" style={{ opacity: opac }} />;
                        else return <line key={p.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.color} strokeWidth="6" strokeLinecap="round" className="opacity-90 mix-blend-screen" style={{ opacity: opac * 2 }} />;
                      })}
                    </svg>
                  </div>
                </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2"><button onClick={onExit} className="text-neutral-400 hover:text-white underline underline-offset-4 text-sm">强制退出</button></div>
    </div>
  );
};


// ==========================================
// 4. 编辑器主体
// ==========================================
export default function LevelEditor() {
  const [level, setLevel] = useState(INITIAL_LEVEL);
  const [selectedTool, setSelectedTool] = useState(TILE_TYPES.GROUND);
  const [isDrawing, setIsDrawing] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [viewMode, setViewMode] = useState('EDITOR'); 
  const [activeTab, setActiveTab] = useState('MAP'); 
  const [spawns, setSpawns] = useState([]);
  const [bases, setBases] = useState([]);
  const [editingWaveIndex, setEditingWaveIndex] = useState(null);
  const [pathError, setPathError] = useState("");
  const [savedLevels, setSavedLevels] = useState([]);
  const [selectedLevelToPlay, setSelectedLevelToPlay] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [expandedStats, setExpandedStats] = useState({});
  const [editorZoom, setEditorZoom] = useState(1);
  const [isCtrlMode, setIsCtrlMode] = useState(false);
  const [gridInput, setGridInput] = useState({ w: level.gridWidth, h: level.gridHeight });

  useEffect(() => {
    try { const stored = localStorage.getItem('arknights_custom_levels'); if (stored) setSavedLevels(JSON.parse(stored)); } catch (e) {}
  }, []);

  const portalIns = []; const portalOuts = [];
  Object.entries(level.portalIdMap || {}).forEach(([coord, id]) => {
    const [x, y] = coord.split(',').map(Number);
    if (id.startsWith('IN')) portalIns.push({x, y, id});
    if (id.startsWith('OUT')) portalOuts.push({x, y, id});
  });
  portalIns.sort((a,b) => parseInt(a.id.replace('IN','')) - parseInt(b.id.replace('IN','')));
  portalOuts.sort((a,b) => parseInt(a.id.replace('OUT','')) - parseInt(b.id.replace('OUT','')));

  useEffect(() => {
    let newSpawns = []; let newBases = [];
    (level.mapData || []).forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === TILE_TYPES.SPAWN) newSpawns.push({ x, y, id: `R${newSpawns.length + 1}` });
        else if (cell === TILE_TYPES.BASE) newBases.push({ x, y, id: `B${newBases.length + 1}` });
      });
    });
    setSpawns(newSpawns); setBases(newBases);
    if (!level.operators || !level.enemies) {
      setLevel(prev => ({ ...prev, operators: prev.operators || DEFAULT_OPERATORS, enemies: prev.enemies || DEFAULT_ENEMIES }));
    }
  }, [level.mapData]);

  useEffect(() => { if (viewMode === 'JSON') setJsonInput(JSON.stringify(level, null, 2)); }, [level, viewMode]);
  
  useEffect(() => {
    const down = (e) => { if(e.ctrlKey || e.metaKey) setIsCtrlMode(true); };
    const up = (e) => { if(!e.ctrlKey && !e.metaKey) setIsCtrlMode(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const handleConfirmSave = () => {
    if (!saveNameInput.trim()) return;
    const updatedLevel = { ...level, name: saveNameInput, levelId: level.levelId === 'level_01' ? `lvl_${Date.now()}` : level.levelId };
    setLevel(updatedLevel);
    const existingLevels = [...savedLevels];
    const existingIndex = existingLevels.findIndex(l => l.levelId === updatedLevel.levelId);
    if (existingIndex >= 0) existingLevels[existingIndex] = updatedLevel; else existingLevels.push(updatedLevel);
    setSavedLevels(existingLevels);
    setSelectedLevelToPlay(updatedLevel);
    try { localStorage.setItem('arknights_custom_levels', JSON.stringify(existingLevels)); setToastMsg("保存成功！"); } catch(e) {}
    setShowSaveModal(false);
  };

  // 核心功能回归：导出 JSON 到本地
  const exportToFile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(level, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${level.name || 'custom_level'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setToastMsg("文件已成功导出");
  };

  // 核心功能回归：从本地导入 JSON
  const importFromFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if(parsed && parsed.mapData) {
           setLevel(parsed);
           setJsonInput(JSON.stringify(parsed, null, 2));
           setToastMsg("文件导入成功！");
           setViewMode('EDITOR');
        } else {
           setToastMsg("JSON 格式不正确！");
        }
      } catch (err) {
        setToastMsg("JSON 解析失败！");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // 重置 input 允许重复导入同一文件
  };

  useEffect(() => { if (toastMsg) { const timer = setTimeout(() => setToastMsg(""), 3000); return () => clearTimeout(timer); } }, [toastMsg]);

  const updateEntityAttr = (type, index, field, value) => {
    const list = [...(level[type] || [])]; list[index] = { ...list[index], [field]: value }; setLevel({ ...level, [type]: list });
  };

  const addEntity = (type) => {
    const isOp = type === 'operators';
    const newItem = isOp 
      ? { id: `op_${Date.now()}`, name: '新干员', className: '近卫', combatType: 'MELEE', type: TILE_TYPES.GROUND, cost: 10, block: 1, hp: 1000, atk: 50, def: 50, attackSpeed: 1.0, range: 1, targetCount: 1, color: '#a3a3a3' }
      : { id: `en_${Date.now()}`, name: '新敌人', movementType: 'GROUND', blockCost: 1, specialMechanic: '', hp: 500, atk: 30, def: 10, attackSpeed: 1.0, speed: 1.0, color: '#a3a3a3' };
    setLevel({ ...level, [type]: [...(level[type] || []), newItem] });
  };

  const removeEntity = (type, index) => { const list = [...(level[type] || [])]; list.splice(index, 1); setLevel({ ...level, [type]: list }); };
  const toggleStats = (id) => { setExpandedStats(prev => ({ ...prev, [id]: !prev[id] })); };

  const applyMapChange = (x, y, newType) => {
    if (level.mapData[y][x] === newType) return;
    const oldType = level.mapData[y][x];
    const m = [...level.mapData];
    m[y] = [...m[y]];
    m[y][x] = newType;

    const newIdMap = { ...(level.portalIdMap || {}) };
    const newPortals = { ...(level.portals || {}) };

    if (oldType === TILE_TYPES.PORTAL_IN) {
      delete newIdMap[`${x},${y}`];
      delete newPortals[`${x},${y}`];
    } else if (oldType === TILE_TYPES.PORTAL_OUT) {
      delete newIdMap[`${x},${y}`];
      Object.keys(newPortals).forEach(k => {
        if (newPortals[k].outX === x && newPortals[k].outY === y) {
          delete newPortals[k].outX;
          delete newPortals[k].outY;
        }
      });
    }

    if (newType === TILE_TYPES.PORTAL_IN) {
      newIdMap[`${x},${y}`] = getNextPortalId('IN', newIdMap);
      newPortals[`${x},${y}`] = { delay: 1.0, color: '#a855f7' };
    } else if (newType === TILE_TYPES.PORTAL_OUT) {
      newIdMap[`${x},${y}`] = getNextPortalId('OUT', newIdMap);
    }

    setLevel({ ...level, mapData: m, portalIdMap: newIdMap, portals: newPortals });
  };

  const applyGridResize = () => {
    const validWidth = Math.max(3, Math.min(50, gridInput.w)); 
    const validHeight = Math.max(3, Math.min(50, gridInput.h));
    setGridInput({ w: validWidth, h: validHeight });
    let newMapData = [];
    for (let y = 0; y < validHeight; y++) {
      let row = [];
      for (let x = 0; x < validWidth; x++) row.push(y < level.gridHeight && x < level.gridWidth ? level.mapData[y][x] : TILE_TYPES.WALL);
      newMapData.push(row);
    }
    setLevel({ ...level, gridWidth: validWidth, gridHeight: validHeight, mapData: newMapData });
  };

  const handleEditorWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setEditorZoom(z => Math.max(0.2, Math.min(2, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 p-6 flex flex-col font-sans select-none" onMouseUp={() => setIsDrawing(false)} onMouseLeave={() => setIsDrawing(false)} onContextMenu={(e) => e.preventDefault()}>
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col h-[calc(100vh-48px)]">
        
        <header className="flex items-center justify-between border-b border-neutral-700 pb-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Grid3x3 className="text-blue-400" /> 关卡编辑器 <span className="text-xs bg-rose-600 px-2 py-0.5 rounded-full ml-2">Phase 1.8 终极修复版</span></h1>
            <p className="text-neutral-400 text-sm mt-1">修正物理渲染冲突带来的卡顿，恢复并强化本地文件导入/导出</p>
          </div>
          <div className="flex gap-3 items-center">
            {/* 全局导入导出按钮区 */}
            <div className="hidden md:flex items-center gap-2 mr-2 border-r border-neutral-700 pr-4">
              <button onClick={exportToFile} className="text-xs font-bold text-neutral-400 hover:text-white px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center gap-1">
                <Download size={14}/> 导出本地
              </button>
              <label className="text-xs font-bold text-neutral-400 hover:text-white px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1">
                <Upload size={14}/> 导入本地
                <input type="file" accept=".json" className="hidden" onChange={importFromFile} />
              </label>
            </div>
            
            <button onClick={() => { setViewMode('JSON'); setEditingWaveIndex(null); }} className={`px-4 py-2 rounded-md text-sm font-bold border ${viewMode === 'JSON' ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}`}>&lt;/&gt; JSON 代码</button>
            <button onClick={() => { setViewMode('EDITOR'); setEditingWaveIndex(null); }} className={`px-4 py-2 rounded-md text-sm font-bold border ${viewMode === 'EDITOR' ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}`}><Map size={16} className="inline mr-1" /> 编辑器</button>
            <button onClick={() => { setViewMode('PLAY_MENU'); setEditingWaveIndex(null); }} className={`px-5 py-2 rounded-md text-sm font-bold shadow-md flex items-center gap-2 ${viewMode === 'PLAY_MENU' ? 'bg-green-600 border-green-500 text-white' : 'bg-green-900/40 border-green-800/50 text-green-400 hover:bg-green-800/60'}`}><Gamepad2 size={18} /> 试玩大厅</button>
          </div>
        </header>

        {viewMode === 'JSON' ? (
          <div className="space-y-4 animate-in fade-in duration-200 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">JSON 代码</h2>
              <button onClick={() => { try { setLevel(JSON.parse(jsonInput)); setViewMode('EDITOR'); } catch (e) { setToastMsg("无效的 JSON！"); } }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-medium"><Check size={16} /> 保存修改</button>
            </div>
            <textarea className="w-full h-full bg-neutral-950 border border-neutral-700 rounded-lg p-4 font-mono text-sm text-green-400 focus:outline-none focus:border-blue-500" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} />
          </div>
        ) : viewMode === 'PLAY_MENU' ? (
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-10 min-h-[600px] flex flex-col items-center animate-in zoom-in-95 shadow-inner">
             <div className="w-full max-w-2xl">
                <div className="text-center mb-8"><Gamepad2 size={48} className="mx-auto text-green-500 mb-4 opacity-80" /><h2 className="text-3xl font-black text-white">选择关卡试玩</h2></div>
                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-xl">
                  {savedLevels.length === 0 ? (
                    <div className="text-center py-10 text-neutral-600 bg-neutral-950 border border-dashed border-neutral-800"><p>暂无保存的关卡</p></div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {savedLevels.map((lvl) => (
                        <div key={lvl.levelId} onClick={() => setSelectedLevelToPlay(lvl)} className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer ${selectedLevelToPlay?.levelId === lvl.levelId ? 'bg-blue-900/30 border-blue-500 shadow-md' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-600'}`}>
                          <div><div className="font-bold text-white text-lg">{lvl.name}</div><div className="text-xs text-neutral-500 flex gap-3 mt-1"><span>{lvl.gridWidth}x{lvl.gridHeight}</span></div></div>
                          {selectedLevelToPlay?.levelId === lvl.levelId && <Check className="text-blue-500" size={24} />}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-8 pt-6 border-t border-neutral-800 flex justify-end">
                    <button onClick={() => { if(!selectedLevelToPlay){setToastMsg("先选择关卡");return;} setViewMode('PLAYING'); }} disabled={!selectedLevelToPlay} className={`px-8 py-3 rounded-full font-black flex items-center gap-2 text-lg transition-all ${selectedLevelToPlay ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}><Play fill="currentColor" size={20} /> START PLAY</button>
                  </div>
                </div>
             </div>
          </div>
        ) : viewMode === 'PLAYING' ? (
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 flex-1 flex flex-col items-center overflow-hidden shadow-inner">
            <PlayMode level={selectedLevelToPlay} onExit={() => setViewMode('PLAY_MENU')} />
          </div>
        ) : (
          /* EDITOR 模式 */
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 overflow-hidden">
            <div className="lg:w-80 bg-neutral-800 rounded-xl border border-neutral-700 shadow-xl overflow-hidden flex flex-col flex-shrink-0 z-20">
              
              <div className="flex border-b border-neutral-700 bg-neutral-900">
                <button className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1 ${activeTab === 'MAP' ? 'text-blue-400 border-b-2 border-blue-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => { setActiveTab('MAP'); setEditingWaveIndex(null); }}><Map size={14}/> 地形</button>
                <button className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1 ${activeTab === 'WAVES' ? 'text-rose-400 border-b-2 border-rose-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => setActiveTab('WAVES')}><Layers size={14}/> 波次</button>
                <button className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1 ${activeTab === 'OPS' ? 'text-green-400 border-b-2 border-green-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => { setActiveTab('OPS'); setEditingWaveIndex(null); }}><Users size={14}/> 干员</button>
                <button className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1 ${activeTab === 'ENEMIES' ? 'text-purple-400 border-b-2 border-purple-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => { setActiveTab('ENEMIES'); setEditingWaveIndex(null); }}><Skull size={14}/> 敌人</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative">
                {/* 地形 */}
                {activeTab === 'MAP' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-400 mb-3">地形画笔</h3>
                      <div className="space-y-2 grid grid-cols-2 gap-2">
                        {Object.entries(TILE_TYPES).map(([key, val]) => (
                          <button key={key} onClick={() => setSelectedTool(val)} className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-all col-span-2 ${selectedTool === val ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-neutral-900 border-neutral-700'}`}>
                            <div className={`w-5 h-5 rounded border ${TILE_STYLES[val]} flex items-center justify-center text-[8px]`}>
                              {val === TILE_TYPES.SPAWN && 'R'}{val === TILE_TYPES.BASE && 'B'}{val === TILE_TYPES.PORTAL_IN && 'IN'}{val === TILE_TYPES.PORTAL_OUT && 'OUT'}
                            </div>
                            <span className="text-xs font-medium">{TILE_NAMES[val]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 传送通道配置面板联动 */}
                    {portalIns.length > 0 && (
                      <div className="border-t border-neutral-700 pt-5 space-y-3">
                        <button onClick={() => toggleStats('portal_config_hide')} className="flex items-center justify-between w-full text-sm font-bold text-purple-400 hover:text-purple-300 transition-colors">
                          <span className="flex items-center gap-1">传送通道配置 ({portalIns.length})</span>
                          {!expandedStats['portal_config_hide'] ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                        </button>
                        
                        {!expandedStats['portal_config_hide'] && (
                          <div className="space-y-3 animate-in slide-in-from-top-2">
                            {portalIns.map((pin) => {
                               const key = `${pin.x},${pin.y}`;
                               const cfg = level.portals?.[key] || { delay: 1.0, color: '#a855f7' };
                               return (
                                 <div key={key} className="bg-neutral-900 border border-neutral-700 p-2 rounded text-xs space-y-2 relative overflow-hidden">
                                   <div className="absolute top-0 left-0 w-1 h-full" style={{backgroundColor: cfg.color || '#a855f7'}} />
                                   <div className="flex justify-between items-center text-neutral-300 ml-2">
                                      <span className="font-bold flex items-center gap-1 text-[10px] text-white">入口 {pin.id} ({pin.x},{pin.y})</span>
                                      <input type="color" value={cfg.color || '#a855f7'} onChange={e => {
                                          const newPortals = {...(level.portals||{}), [key]: {...cfg, color: e.target.value}};
                                          setLevel({...level, portals: newPortals});
                                      }} className="w-5 h-5 cursor-pointer rounded bg-transparent border-none p-0" />
                                   </div>
                                   <div className="grid grid-cols-2 gap-2 ml-2">
                                      <div>
                                        <label className="text-[10px] text-neutral-500">目标出口</label>
                                        <select value={cfg.outX != null ? `${cfg.outX},${cfg.outY}` : ''} onChange={e => {
                                            const val = e.target.value; const newPortals = {...(level.portals||{})};
                                            if (!val) { delete newPortals[key].outX; delete newPortals[key].outY; } 
                                            else { const [ox, oy] = val.split(','); newPortals[key] = {...cfg, outX: parseInt(ox), outY: parseInt(oy)}; }
                                            setLevel({...level, portals: newPortals});
                                        }} className="w-full bg-neutral-800 border border-neutral-700 rounded px-1 py-1 outline-none text-purple-300">
                                           <option value="">-未绑定-</option>
                                           {portalOuts.map(pout => (<option key={`${pout.x},${pout.y}`} value={`${pout.x},${pout.y}`}>{pout.id} ({pout.x},{pout.y})</option>))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-neutral-500">消失时间(秒)</label>
                                        <input type="number" step="0.5" min="0" value={cfg.delay ?? 1} onChange={e => {
                                            const newPortals = {...(level.portals||{}), [key]: {...cfg, delay: parseFloat(e.target.value)||0}};
                                            setLevel({...level, portals: newPortals});
                                        }} className="w-full bg-neutral-800 border border-neutral-700 rounded px-1 py-1 outline-none text-white"/>
                                      </div>
                                   </div>
                                 </div>
                               )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-neutral-700 pt-5 space-y-4">
                      <h3 className="text-sm font-bold text-neutral-400">全局属性</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs text-neutral-500 mb-1 block">地图宽 (Max 50)</label><input type="number" value={gridInput.w} onChange={(e) => setGridInput({...gridInput, w: e.target.value})} onBlur={applyGridResize} onKeyDown={(e)=>e.key==='Enter'&&applyGridResize()} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                        <div><label className="text-xs text-neutral-500 mb-1 block">地图高 (Max 50)</label><input type="number" value={gridInput.h} onChange={(e) => setGridInput({...gridInput, h: e.target.value})} onBlur={applyGridResize} onKeyDown={(e)=>e.key==='Enter'&&applyGridResize()} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                        <div><label className="text-xs text-neutral-500 mb-1 block">初始 DP</label><input type="number" value={level.initialDp} onChange={(e) => setLevel({...level, initialDp: parseInt(e.target.value) || 0})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                        <div><label className="text-xs text-neutral-500 mb-1 block">蓝门 HP</label><input type="number" value={level.baseHealth} onChange={(e) => setLevel({...level, baseHealth: parseInt(e.target.value) || 0})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                        <div><label className="text-xs text-neutral-500 mb-1 block">回费间隔 (秒)</label><input type="number" step="0.5" min="0.1" value={level.dpRecoveryInterval ?? 1} onChange={(e) => setLevel({...level, dpRecoveryInterval: parseFloat(e.target.value) || 1})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                        <div><label className="text-xs text-neutral-500 mb-1 block">单次回复量</label><input type="number" step="1" value={level.dpRecoveryAmount ?? 1} onChange={(e) => setLevel({...level, dpRecoveryAmount: parseInt(e.target.value) || 0})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 text-white" /></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 波次 */}
                {activeTab === 'WAVES' && (
                  <div className="flex flex-col h-full absolute inset-0 bg-neutral-800">
                    <div className="p-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar relative">
                      {editingWaveIndex !== null ? (
                        <div className="absolute inset-0 bg-neutral-800 z-10 flex flex-col p-4 animate-in slide-in-from-right-4 border border-yellow-500/50 rounded-lg">
                          <div className="flex items-center justify-between mb-4 border-b border-neutral-700 pb-3"><h3 className="font-bold text-yellow-400 flex items-center gap-2"><Route size={18}/> 路线</h3><button onClick={() => setEditingWaveIndex(null)} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-bold text-white">完成</button></div>
                          <div className="flex gap-2 mb-4">
                            <button onClick={() => {
                              const wave = level.waves[editingWaveIndex]; const start = spawns.find(s => s.id === wave.spawnId); const end = bases.find(b => b.id === wave.targetId);
                              if (!start || !end) { setPathError("起点或终点不存在"); return; }
                              const queue = [{ x: start.x, y: start.y, path: [{ x: start.x, y: start.y, wait: 0 }] }]; const visited = new Set([`${start.x},${start.y}`]);
                              const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; let foundPath = null;
                              while (queue.length > 0) {
                                const curr = queue.shift(); if (curr.x === end.x && curr.y === end.y) { foundPath = curr.path; break; }
                                
                                const cType = level.mapData[curr.y][curr.x];
                                if (cType === TILE_TYPES.PORTAL_IN) {
                                  const pCfg = level.portals?.[`${curr.x},${curr.y}`];
                                  if (pCfg && pCfg.outX != null && pCfg.outY != null) {
                                      const nx = pCfg.outX; const ny = pCfg.outY;
                                      if (!visited.has(`${nx},${ny}`)) {
                                          visited.add(`${nx},${ny}`);
                                          queue.push({ x: nx, y: ny, path: [...curr.path, { x: nx, y: ny, wait: 0 }] });
                                      }
                                      continue; 
                                  }
                                }

                                for (let [dx, dy] of dirs) { 
                                  const nx = curr.x + dx; const ny = curr.y + dy;
                                  if (nx >= 0 && nx < level.gridWidth && ny >= 0 && ny < level.gridHeight) {
                                    const tType = level.mapData[ny][nx]; 
                                    if ((tType === 0 || tType === 3 || tType === 4 || tType === 5 || tType === 6) && !visited.has(`${nx},${ny}`)) { 
                                      visited.add(`${nx},${ny}`); queue.push({ x: nx, y: ny, path: [...curr.path, { x: nx, y: ny, wait: 0 }] }); 
                                    }
                                  }
                                }
                              }
                              if (foundPath) { const w = [...level.waves]; w[editingWaveIndex].path = foundPath; setLevel({...level, waves: w}); setPathError(""); } else setPathError("寻路失败：死路或传送进口未绑定");
                            }} className="flex-1 py-1.5 bg-neutral-700 text-xs rounded text-white shadow-md font-bold">AI 虫洞寻路填入</button>
                            <button onClick={() => { const w=[...level.waves]; w[editingWaveIndex].path=[]; setLevel({...level, waves:w}); }} className="flex-1 py-1.5 bg-red-900/50 text-red-300 text-xs rounded shadow-sm">清空路线</button>
                          </div>
                          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                            {((level.waves || [])[editingWaveIndex]?.path || []).map((node, i) => (
                              <div key={i} className="flex items-center justify-between bg-neutral-900 p-2 rounded border border-neutral-700">
                                <div className="flex items-center gap-2"><span className="text-yellow-400 text-[10px] font-bold">{i + 1}</span><span className="text-xs text-neutral-500">({node.x}, {node.y})</span></div>
                                <div className="flex items-center gap-1"><Clock size={12} className="text-neutral-500"/><input type="number" step="0.5" value={node.wait} onChange={(e) => {const w=[...level.waves]; w[editingWaveIndex].path[i].wait=parseFloat(e.target.value)||0; setLevel({...level, waves:w})}} className="w-12 bg-neutral-800 border border-neutral-600 rounded px-1 py-0.5 text-xs text-center outline-none text-white" /><span className="text-[10px] text-neutral-500">秒</span></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {spawns.length === 0 || bases.length === 0 ? (<div className="text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded">请先在地图上放置红蓝门。</div>) : null}
                          {(level.waves || []).map((wave, index) => (
                            <div key={wave.waveId} className={`bg-neutral-900 rounded-lg border p-4 space-y-3 relative group ${editingWaveIndex === index ? 'border-yellow-500' : 'border-neutral-700'}`}>
                              <button onClick={() => {const w=[...level.waves]; w.splice(index,1); setLevel({...level, waves:w})}} className="absolute top-3 right-3 text-neutral-500 hover:text-red-400"><Trash2 size={16} /></button>
                              <div className="flex items-center gap-2 mb-2"><span className="bg-neutral-700 text-xs px-2 py-1 rounded font-bold text-white">波次 {index + 1}</span><button onClick={() => setEditingWaveIndex(index)} className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-2 py-1 rounded ml-auto">编辑动线</button></div>
                              <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-[10px] text-neutral-500 block">时间(s)</label><input type="number" step="0.5" value={wave.time} onChange={(e)=>{const w=[...level.waves];w[index].time=parseFloat(e.target.value);setLevel({...level,waves:w})}} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1 outline-none text-white"/></div>
                                <div><label className="text-[10px] text-neutral-500 block">数量</label><input type="number" value={wave.count} onChange={(e)=>{const w=[...level.waves];w[index].count=parseInt(e.target.value);setLevel({...level,waves:w})}} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1 outline-none text-white"/></div>
                              </div>
                              <div><label className="text-[10px] text-neutral-500 block">敌人种类</label><select value={wave.enemyType} onChange={(e)=>{const w=[...level.waves];w[index].enemyType=e.target.value;setLevel({...level,waves:w})}} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs mt-1 outline-none text-white">{(level.enemies || []).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                              <div className="grid grid-cols-2 gap-3 bg-neutral-950/50 p-2 rounded">
                                <div><label className="text-[10px] text-neutral-500 block">红门</label><select value={wave.spawnId} onChange={(e)=>{const w=[...level.waves];w[index].spawnId=e.target.value;setLevel({...level,waves:w})}} className="w-full bg-neutral-800 text-red-400 text-xs mt-1 font-bold">{spawns.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select></div>
                                <div><label className="text-[10px] text-neutral-500 block">蓝门</label><select value={wave.targetId} onChange={(e)=>{const w=[...level.waves];w[index].targetId=e.target.value;setLevel({...level,waves:w})}} className="w-full bg-neutral-800 text-blue-400 text-xs mt-1 font-bold">{bases.map(b=><option key={b.id} value={b.id}>{b.id}</option>)}</select></div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    {editingWaveIndex === null && (<div className="p-4 border-t border-neutral-700 bg-neutral-800"><button onClick={() => {setLevel({...level, waves: [...(level.waves||[]), {waveId:`w_${Date.now()}`, time:10, enemyType:(level.enemies||DEFAULT_ENEMIES)[0].id, count:1, interval:1, spawnId:spawns[0]?.id||"", targetId:bases[0]?.id||"", path:[]}]})}} className="w-full py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-semibold flex justify-center items-center gap-2 text-white"><Plus size={16}/> 新增波次</button></div>)}
                  </div>
                )}

                {/* 扩展图鉴：干员配置 */}
                {activeTab === 'OPS' && (
                  <div className="space-y-4">
                    <p className="text-[10px] text-neutral-500 leading-tight">定义干员的基础属性。近战干员无法对空，多目标属性决定同时攻击的敌人数。攻击范围指曼哈顿距离(0=仅自身格，1=十字周围一格)。</p>
                    {(level.operators || []).map((op, i) => (
                      <div key={op.id} className="bg-neutral-900 border border-neutral-700 p-3 rounded-lg relative overflow-hidden transition-all">
                        <div className="absolute top-0 left-0 w-1 h-full" style={{backgroundColor: op.color}} />
                        <button onClick={() => removeEntity('operators', i)} className="absolute top-3 right-3 text-neutral-500 hover:text-red-400"><Trash2 size={14}/></button>
                        
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 ml-2 mb-3 pr-6">
                          <div><label className="text-[10px] text-neutral-500">代号/名称</label><input type="text" value={op.name} onChange={e => updateEntityAttr('operators', i, 'name', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white"/></div>
                          <div>
                            <label className="text-[10px] text-neutral-500">所属职业 (预留接口)</label>
                            <select value={op.className} onChange={e => updateEntityAttr('operators', i, 'className', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white">
                              {OPERATOR_CLASSES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-500">战斗方式</label>
                            <select value={op.combatType} onChange={e => updateEntityAttr('operators', i, 'combatType', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white">
                              <option value="MELEE">近战</option><option value="RANGED">远程</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-500">地格限制</label>
                            <select value={op.type} onChange={e => updateEntityAttr('operators', i, 'type', parseInt(e.target.value))} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white">
                              <option value={TILE_TYPES.GROUND}>地面</option><option value={TILE_TYPES.HIGH}>高台</option>
                            </select>
                          </div>
                          <div className="flex gap-2 col-span-2">
                            <div className="flex-1"><label className="text-[10px] text-neutral-500">部署费用</label><input type="number" value={op.cost} onChange={e => updateEntityAttr('operators', i, 'cost', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white"/></div>
                            <div className="flex-1"><label className="text-[10px] text-neutral-500 block mb-1">标识颜色</label><input type="color" value={op.color} onChange={e => updateEntityAttr('operators', i, 'color', e.target.value)} className="w-full h-[22px] rounded bg-neutral-800 border-none cursor-pointer p-0"/></div>
                          </div>
                        </div>
                        <div className="ml-2 border-t border-neutral-800 pt-2">
                          <button onClick={() => toggleStats(`op_${op.id}`)} className="flex items-center justify-between w-full text-xs text-neutral-400 hover:text-white py-1">
                            <span className="flex items-center gap-1"><Settings2 size={12}/> 数值 / 范围 / 阻挡 / 多目标</span>
                            {expandedStats[`op_${op.id}`] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          </button>
                          {expandedStats[`op_${op.id}`] && (
                            <div className="grid grid-cols-2 gap-2 mt-2 bg-neutral-950 p-2 rounded border border-neutral-800 animate-in slide-in-from-top-2">
                              <div><label className="text-[10px] text-yellow-500/80">攻击范围 (格)</label><input type="number" min="0" value={op.range ?? 1} onChange={e => updateEntityAttr('operators', i, 'range', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-xs outline-none text-white"/></div>
                              <div><label className="text-[10px] text-yellow-500/80">攻击目标数</label><input type="number" min="1" value={op.targetCount ?? 1} onChange={e => updateEntityAttr('operators', i, 'targetCount', parseInt(e.target.value) || 1)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-xs outline-none text-white"/></div>
                              <div><label className="text-[10px] text-neutral-500">阻挡数</label><input type="number" value={op.block} onChange={e => updateEntityAttr('operators', i, 'block', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs outline-none text-white" disabled={op.type===TILE_TYPES.HIGH}/></div>
                              <div><label className="text-[10px] text-neutral-500">生命 (HP)</label><input type="number" value={op.hp} onChange={e => updateEntityAttr('operators', i, 'hp', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-green-400 outline-none"/></div>
                              <div><label className="text-[10px] text-neutral-500">攻击 (ATK)</label><input type="number" value={op.atk} onChange={e => updateEntityAttr('operators', i, 'atk', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-orange-400 outline-none"/></div>
                              <div><label className="text-[10px] text-neutral-500">防御 (DEF)</label><input type="number" value={op.def} onChange={e => updateEntityAttr('operators', i, 'def', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-blue-400 outline-none"/></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => addEntity('operators')} className="w-full py-2 bg-neutral-900 border border-dashed border-neutral-600 hover:border-green-500 hover:text-green-400 rounded-lg text-sm text-neutral-400 flex items-center justify-center gap-2 transition-colors"><Plus size={16}/> 新增干员配置</button>
                  </div>
                )}

                {/* 扩展图鉴：敌人配置 */}
                {activeTab === 'ENEMIES' && (
                  <div className="space-y-4">
                    <p className="text-[10px] text-neutral-500 leading-tight">创建关卡中的敌军种类，空中单位不受地面阻挡，并且只有高台干员可以攻击空中单位。</p>
                    {(level.enemies || []).map((e, i) => (
                      <div key={e.id} className="bg-neutral-900 border border-neutral-700 p-3 rounded-lg relative overflow-hidden transition-all">
                        <div className="absolute top-0 left-0 w-1 h-full" style={{backgroundColor: e.color}} />
                        <button onClick={() => removeEntity('enemies', i)} className="absolute top-3 right-3 text-neutral-500 hover:text-red-400"><Trash2 size={14}/></button>
                        
                        <div className="grid grid-cols-2 gap-3 ml-2 mb-3 pr-6">
                          <div><label className="text-[10px] text-neutral-500">代号/名称</label><input type="text" value={e.name} onChange={evt => updateEntityAttr('enemies', i, 'name', evt.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-white"/></div>
                          <div><label className="text-[10px] text-neutral-500">移动类型</label><select value={e.movementType} onChange={evt => updateEntityAttr('enemies', i, 'movementType', evt.target.value)} className={`w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none ${e.movementType === 'FLYING' ? 'text-sky-400 font-bold' : 'text-white'}`}><option value="GROUND">地面</option><option value="FLYING">飞行</option></select></div>
                          <div className="col-span-2 flex gap-2">
                            <div className="flex-[3]"><label className="text-[10px] text-neutral-500">特殊机制备忘</label><input type="text" placeholder="例如：死亡爆炸" value={e.specialMechanic || ''} onChange={evt => updateEntityAttr('enemies', i, 'specialMechanic', evt.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs outline-none text-purple-300"/></div>
                            <div className="flex-1"><label className="text-[10px] text-neutral-500 block mb-1">颜色</label><input type="color" value={e.color} onChange={evt => updateEntityAttr('enemies', i, 'color', evt.target.value)} className="w-full h-[22px] rounded bg-neutral-800 border-none cursor-pointer p-0"/></div>
                          </div>
                        </div>
                        <div className="ml-2 border-t border-neutral-800 pt-2">
                          <button onClick={() => toggleStats(`en_${e.id}`)} className="flex items-center justify-between w-full text-xs text-neutral-400 hover:text-white py-1">
                            <span className="flex items-center gap-1"><Settings2 size={12}/> 基础战斗数值 & 阻挡消耗</span>
                            {expandedStats[`en_${e.id}`] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                          </button>
                          {expandedStats[`en_${e.id}`] && (
                            <div className="grid grid-cols-2 gap-2 mt-2 bg-neutral-950 p-2 rounded border border-neutral-800 animate-in slide-in-from-top-2">
                              <div><label className="text-[10px] text-neutral-500">消耗阻挡数</label><input type="number" value={e.blockCost} onChange={evt => updateEntityAttr('enemies', i, 'blockCost', parseInt(evt.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs outline-none text-white" disabled={e.movementType==='FLYING'} title={e.movementType==='FLYING'?"空中单位不可被阻挡":""}/></div>
                              <div><label className="text-[10px] text-neutral-500">移动速度</label><input type="number" step="0.1" value={e.speed} onChange={evt => updateEntityAttr('enemies', i, 'speed', parseFloat(evt.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs outline-none text-white"/></div>
                              <div><label className="text-[10px] text-neutral-500">生命 (HP)</label><input type="number" value={e.hp} onChange={evt => updateEntityAttr('enemies', i, 'hp', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-red-400 outline-none"/></div>
                              <div><label className="text-[10px] text-neutral-500">防御 (DEF)</label><input type="number" value={e.def} onChange={evt => updateEntityAttr('enemies', i, 'def', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-blue-400 outline-none"/></div>
                              <div><label className="text-[10px] text-neutral-500">攻击 (ATK)</label><input type="number" value={e.atk} onChange={evt => updateEntityAttr('enemies', i, 'atk', parseInt(e.target.value) || 0)} className="w-full bg-neutral-800 rounded px-1 py-0.5 text-xs text-orange-400 outline-none"/></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => addEntity('enemies')} className="w-full py-2 bg-neutral-900 border border-dashed border-neutral-600 hover:border-purple-500 hover:text-purple-400 rounded-lg text-sm text-neutral-400 flex items-center justify-center gap-2 transition-colors"><Plus size={16}/> 新增敌人配置</button>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧画布区 */}
            <div 
              className={`flex-1 relative rounded-xl border flex flex-col overflow-hidden ${editingWaveIndex !== null ? 'border-yellow-500 shadow-[inset_0_0_50px_rgba(234,179,8,0.1)]' : 'border-neutral-800'}`}
              onWheel={handleEditorWheel}
            >
              {pathError && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-900 text-white px-3 py-1 rounded text-xs z-50 shadow-lg">{pathError}</div>}
              
              <div className="absolute top-4 right-4 z-40 flex items-center gap-1 bg-neutral-800/90 backdrop-blur border border-neutral-700 rounded-lg p-1 shadow-lg">
                <button onClick={() => setEditorZoom(z => Math.min(2, z + 0.1))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="放大"><ZoomIn size={16}/></button>
                <span className="text-xs font-mono text-neutral-400 w-10 text-center select-none">{Math.round(editorZoom * 100)}%</span>
                <button onClick={() => setEditorZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white transition-colors" title="缩小"><ZoomOut size={16}/></button>
                <button onClick={() => setEditorZoom(1)} className="p-1.5 hover:bg-neutral-700 rounded text-neutral-300 hover:text-white text-[10px] font-bold transition-colors" title="恢复 1:1">1:1</button>
              </div>

              <div className="absolute bottom-4 left-4 z-40 flex flex-col gap-1.5 items-start pointer-events-none opacity-70 hover:opacity-100 transition-opacity">
                 <div className={`bg-neutral-900/60 backdrop-blur-sm border border-neutral-700/50 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[10px] transition-colors shadow-sm ${isCtrlMode ? 'text-white border-neutral-500' : 'text-neutral-400'}`}>
                   <span>🖱️ 按住 Ctrl/Cmd + 滚轮缩放</span>
                 </div>
                 {editingWaveIndex !== null ? (
                   <div className="bg-yellow-500/10 text-yellow-500/80 border border-yellow-500/20 px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-2 shadow-sm text-[10px]">
                     <span className="flex items-center gap-1"><MousePointer2 size={12}/> 左键: 添加</span>
                     <span className="w-px h-2.5 bg-yellow-500/30"></span>
                     <span>右键: 撤销</span>
                   </div>
                 ) : (
                   <div className="text-neutral-500 bg-neutral-900/60 px-2.5 py-1 rounded-full backdrop-blur-sm border border-neutral-800/50 shadow-sm text-[10px]">
                     <MousePointer2 size={10} className="inline mr-1" /> 左键拖拽涂鸦
                   </div>
                 )}
              </div>

              {editingWaveIndex === null && (
                <div className="absolute bottom-6 right-6 z-40">
                  <button onClick={() => { setSaveNameInput(level.name); setShowSaveModal(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400 transition-transform active:scale-95">
                    <Download size={18} /> 保存并同步至大厅
                  </button>
                </div>
              )}

              <div className="w-full h-full bg-neutral-950 overflow-auto custom-scrollbar">
                <div className="pt-24 pb-32 px-24 md:px-32 flex min-w-max min-h-max" style={{ transform: `scale(${editorZoom})`, transformOrigin: 'top left', transition: isCtrlMode ? 'none' : 'transform 0.1s ease-out' }}>
                  <div className="relative bg-neutral-700 shadow-2xl border border-neutral-600" style={{ width: level.gridWidth * CELL_SIZE, height: level.gridHeight * CELL_SIZE }}>
                    
                    <div className="grid absolute inset-0" style={{ gridTemplateColumns: `repeat(${level.gridWidth}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${level.gridHeight}, ${CELL_SIZE}px)` }}>
                      {(level.mapData || []).map((row, y) => (
                        row.map((cellType, x) => {
                          const isEditMode = editingWaveIndex !== null;
                          const currentPath = isEditMode ? ((level.waves || [])[editingWaveIndex]?.path || []) : [];
                          const pathNodeIndex = currentPath.findIndex(p => p.x === x && p.y === y);
                          const isPath = pathNodeIndex !== -1;
                          const sData = spawns.find(s => s.x === x && s.y === y);
                          const bData = bases.find(b => b.x === x && b.y === y);
                          
                          const customColor = getPortalColor(level, x, y, cellType);
                          const portalStyle = customColor ? { borderColor: customColor, boxShadow: `inset 0 0 15px ${customColor}80` } : {};

                          return (
                            <div
                              key={`${x}-${y}`}
                              className={`relative cursor-crosshair transition-all duration-75 border border-black/10 hover:brightness-125 hover:border-white/30
                                ${TILE_STYLES[cellType]} 
                                ${isEditMode && !isPath ? 'opacity-60' : 'opacity-100'} 
                                ${isPath ? '!bg-yellow-500/40 !border-yellow-400 z-10' : ''}`
                              }
                              style={customColor ? portalStyle : undefined}
                              onMouseDown={(e) => {
                                if (isEditMode) {
                                  if (e.button === 2) {
                                    const w=[...level.waves]; const p=w[editingWaveIndex].path; const idx=p.findIndex(n=>n.x===x&&n.y===y);
                                    if(idx!==-1) w[editingWaveIndex].path=p.slice(0,idx); else if(p.length) p.pop();
                                    setLevel({...level,waves:w});
                                  } else {
                                    const w=[...level.waves]; const p=w[editingWaveIndex].path; const last=p[p.length-1];
                                    if(!last || last.x!==x || last.y!==y) { p.push({x,y,wait:0}); setLevel({...level,waves:w}); }
                                  }
                                } else if (e.button === 0) { setIsDrawing(true); applyMapChange(x, y, selectedTool); }
                              }}
                              onMouseEnter={() => { if (isDrawing && !isEditMode) { applyMapChange(x, y, selectedTool); } }}
                            >
                              {sData && <span className="absolute inset-0 flex items-center justify-center font-bold text-white drop-shadow-md text-sm pointer-events-none">{sData.id}</span>}
                              {bData && <span className="absolute inset-0 flex items-center justify-center font-bold text-white drop-shadow-md text-sm pointer-events-none">{bData.id}</span>}
                              {isPath && <span className="absolute inset-0 flex items-center justify-center font-black text-yellow-100 text-lg pointer-events-none">{pathNodeIndex + 1}</span>}
                              
                              {(cellType === TILE_TYPES.PORTAL_IN || cellType === TILE_TYPES.PORTAL_OUT) && (
                                <span className="absolute flex items-center justify-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-md pointer-events-none" style={{backgroundColor: customColor || '#a855f7'}}>
                                  {level.portalIdMap?.[`${x},${y}`]}
                                </span>
                              )}
                            </div>
                          );
                        })
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 保存 Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-xl w-96 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-bold text-white mb-4">保存关卡并同步大厅</h3>
              <input type="text" value={saveNameInput} onChange={(e) => setSaveNameInput(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white mb-4 outline-none focus:border-blue-500" autoFocus />
              <div className="flex justify-end gap-3"><button onClick={() => setShowSaveModal(false)} className="px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors">取消</button><button onClick={handleConfirmSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 shadow-lg transition-colors">确认保存</button></div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toastMsg && <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl border border-neutral-700 z-50 flex items-center gap-2 animate-in slide-in-from-top-4"><Check size={16} className="text-green-400"/> {toastMsg}</div>}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .crosshatch { background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.3) 5px, rgba(0,0,0,0.3) 10px), repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(0,0,0,0.3) 5px, rgba(0,0,0,0.3) 10px); }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #525252; border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #737373; }
      `}} />
    </div>
  );
}