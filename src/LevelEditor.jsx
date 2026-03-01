import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, Plus, Minus, MousePointer2, Grid3x3, Layers, Route, Trash2, Map, Check, Clock, Wand2, Download, Gamepad2, Play } from 'lucide-react';

// ==========================================
// 1. 基础配置与字典
// ==========================================
const TILE_TYPES = { GROUND: 0, HIGH: 1, WALL: 2, SPAWN: 3, BASE: 4 };

// 敌人的具体战斗属性
const ENEMY_TYPES = [
  { id: 'basic_soldier', name: '源石虫 (基础近战)', hp: 100, speed: 1.0, color: '#ef4444' },
  { id: 'heavy_defender', name: '重装兵 (高护甲)', hp: 300, speed: 0.5, color: '#7f1d1d' },
  { id: 'fast_runner', name: '猎犬 (高移速)', hp: 60, speed: 1.8, color: '#f97316' },
  { id: 'ranged_caster', name: '术师 (法伤)', hp: 80, speed: 0.8, color: '#a855f7' }
];

// 干员（防御塔）图鉴配置
const OPERATOR_TYPES = [
  { id: 'vanguard', name: '先锋 (产费)', cost: 10, type: TILE_TYPES.GROUND, range: 1.5, atk: 20, attackSpeed: 1.0, color: '#eab308' },
  { id: 'sniper', name: '狙击 (高速)', cost: 12, type: TILE_TYPES.HIGH, range: 2.5, atk: 35, attackSpeed: 1.2, color: '#3b82f6' },
  { id: 'caster', name: '术师 (高伤)', cost: 20, type: TILE_TYPES.HIGH, range: 2.5, atk: 60, attackSpeed: 0.6, color: '#a855f7' },
  { id: 'defender', name: '重装 (阻挡)', cost: 18, type: TILE_TYPES.GROUND, range: 1.5, atk: 10, attackSpeed: 0.8, color: '#64748b' }
];

const TILE_STYLES = {
  [TILE_TYPES.GROUND]: "bg-stone-300 border-stone-400/50 hover:bg-stone-400",
  [TILE_TYPES.HIGH]: "bg-stone-100 border-stone-300/50 shadow-[inset_0_4px_4px_rgba(0,0,0,0.1)] hover:bg-stone-200 relative after:content-[''] after:absolute after:inset-1 after:border after:border-stone-200",
  [TILE_TYPES.WALL]: "bg-stone-800 border-stone-900/80 hover:bg-stone-700 crosshatch",
  [TILE_TYPES.SPAWN]: "bg-red-500 border-red-700 text-white font-bold text-xs flex flex-col items-center justify-center",
  [TILE_TYPES.BASE]: "bg-blue-500 border-blue-700 text-white font-bold text-xs flex flex-col items-center justify-center"
};

const TILE_NAMES = {
  [TILE_TYPES.GROUND]: "地面 (近战)",
  [TILE_TYPES.HIGH]: "高台 (远程)",
  [TILE_TYPES.WALL]: "障碍物",
  [TILE_TYPES.SPAWN]: "红门 (出生点)",
  [TILE_TYPES.BASE]: "蓝门 (保护目标)"
};

const INITIAL_LEVEL = {
  version: "1.0",
  levelId: "level_01",
  name: "测试关卡 LV1",
  gridWidth: 10,
  gridHeight: 6,
  baseHealth: 3,
  initialDp: 10,
  mapData: [
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 0, 0, 0, 0, 0, 0, 0, 0, 4],
    [2, 1, 1, 1, 0, 1, 1, 1, 1, 2],
    [2, 2, 2, 2, 0, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 0, 0, 0, 0, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
  ],
  waves: [
    {
      waveId: "w_1", time: 3.0, enemyType: "basic_soldier", count: 3, interval: 2.0,
      spawnId: "R1", targetId: "B1", path: [] 
    }
  ]
};

// ==========================================
// 核心解耦：独立的游戏试玩引擎组件 (PlayMode)
// ==========================================
const PlayMode = ({ level, onExit }) => {
  // 引擎状态机 (使用 useRef 绕过 React 渲染瓶颈，实现高帧率逻辑计算)
  const engine = useRef({
    state: 'PLAYING', // PLAYING, WIN, LOSE
    time: 0,
    dp: level?.initialDp ?? 0,
    baseHp: level?.baseHealth ?? 3,
    enemies: [],
    towers: [],
    projectiles: [],
    // 增加容错：应对导入 JSON 无波次的情况
    waveProgress: (level?.waves || []).map(() => ({ count: 0, lastSpawnTime: -999 }))
  });

  const [tick, setTick] = useState(0); // 仅用于强制触发 UI 刷新
  const [selectedOp, setSelectedOp] = useState(OPERATOR_TYPES[0]);

  // 核心战斗循环 (Game Loop)
  useEffect(() => {
    let lastTime = performance.now();
    let frameId;

    const gameLoop = (currentTime) => {
      const state = engine.current;
      if (state.state !== 'PLAYING') return;

      // 增加时间增量(dt)的上限防抖，防止切屏或卡顿时产生的数据爆炸
      let dt = (currentTime - lastTime) / 1000;
      if (dt > 0.1) dt = 0.1; 
      lastTime = currentTime;

      // 1. 资源恢复
      state.time += dt;
      state.dp = Math.min(99, state.dp + dt * 1); // 每秒回复 1 DP
      
      // 2. 出怪逻辑 (Spawner)
      (level.waves || []).forEach((wave, wIdx) => {
        const progress = state.waveProgress[wIdx];
        if (state.time >= wave.time && progress.count < wave.count) {
          if (state.time - progress.lastSpawnTime >= wave.interval) {
            progress.count++;
            progress.lastSpawnTime = state.time;
            
            const enemyDef = ENEMY_TYPES.find(e => e.id === wave.enemyType) || ENEMY_TYPES[0];
            if (wave.path && wave.path.length > 0) {
              state.enemies.push({
                ...enemyDef, // 修复：必须先解构图鉴基础属性
                id: `enemy_${Date.now()}_${Math.random()}`, // 然后再赋值唯一ID，防止被覆盖
                hp: enemyDef.hp, // 当前血量
                maxHp: enemyDef.hp,
                x: wave.path[0].x,
                y: wave.path[0].y,
                path: wave.path,
                pathIndex: 0,
                waitTimer: 0
              });
            }
          }
        }
      });

      // 3. 敌人移动与结算
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (e.hp <= 0) {
          state.enemies.splice(i, 1);
          continue; // 死亡清理
        }

        if (e.pathIndex < e.path.length - 1) {
          const target = e.path[e.pathIndex + 1];
          if (e.waitTimer > 0) {
            e.waitTimer -= dt; // 发呆中
          } else {
            const dx = target.x - e.x;
            const dy = target.y - e.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 0.05) {
              e.x = target.x; 
              e.y = target.y; 
              e.pathIndex++;
              if (target.wait > 0) e.waitTimer = target.wait;
            } else {
              const move = Math.min(dist, e.speed * dt);
              e.x += (dx / dist) * move;
              e.y += (dy / dist) * move;
            }
          }
        } else {
          // 到达蓝门
          state.baseHp -= 1;
          state.enemies.splice(i, 1);
          if (state.baseHp <= 0) state.state = 'LOSE';
        }
      }

      // 4. 防御塔索敌与攻击
      state.towers.forEach(t => {
        if (t.cooldown > 0) t.cooldown -= dt;
        if (t.cooldown <= 0) {
          // 简易索敌：范围内最近的敌人
          let target = null;
          let minDist = t.range;
          state.enemies.forEach(e => {
            const dist = Math.hypot(e.x - t.x, e.y - t.y);
            if (dist <= minDist) { minDist = dist; target = e; }
          });

          if (target) {
            target.hp -= t.atk;
            t.cooldown = 1 / t.attackSpeed;
            if (t.id === 'vanguard') state.dp += 1; // 先锋特供产费
            
            // 添加激光特效
            state.projectiles.push({
              id: `proj_${Date.now()}_${Math.random()}`, // 增加特效唯一ID
              x1: t.x, y1: t.y, x2: target.x, y2: target.y, color: t.color, age: 0
            });
          }
        }
      });

      // 5. 特效生命周期
      state.projectiles.forEach(p => p.age += dt);
      state.projectiles = state.projectiles.filter(p => p.age < 0.15); // 特效存留时间

      // 6. 胜利结算
      if (state.state === 'PLAYING') {
        const allSpawned = state.waveProgress.every((p, i) => p.count >= ((level?.waves || [])[i]?.count || 0));
        if (allSpawned && state.enemies.length === 0) {
          state.state = 'WIN';
        }
      }

      // 触发UI渲染，通过取模避免数值无限大
      setTick(t => (t + 1) % 60); 
      frameId = requestAnimationFrame(gameLoop);
    };

    frameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameId);
  }, [level]);

  // 部署干员
  const handleGridClick = (x, y) => {
    const state = engine.current;
    if (state.state !== 'PLAYING') return;

    // 检查地形是否匹配
    const cellType = level.mapData[y][x];
    if (cellType !== selectedOp.type) return;

    // 检查该位置是否已有干员
    if (state.towers.some(t => t.x === x && t.y === y)) return;

    // 检查费用
    if (state.dp >= selectedOp.cost) {
      state.dp -= selectedOp.cost;
      // 修复：部署干员也分配唯一ID
      state.towers.push({ ...selectedOp, id: `tower_${Date.now()}_${Math.random()}`, x, y, cooldown: 0 });
    }
  };

  const st = engine.current;
  const gridW = level?.gridWidth || 10;
  const gridH = level?.gridHeight || 6;

  return (
    <div className="flex flex-col items-center animate-in fade-in duration-300 w-full">
      {/* 顶部状态栏 */}
      <div className="w-full max-w-4xl bg-neutral-900 border border-neutral-700 rounded-xl p-4 shadow-xl mb-6 flex justify-between items-center">
        <div className="flex gap-8">
          <div className="text-center">
            <div className="text-xs text-neutral-400 font-bold mb-1">部署费用 (DP)</div>
            <div className="text-3xl font-black text-blue-400 font-mono">{Math.floor(st.dp)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-400 font-bold mb-1">基地生命 (HP)</div>
            <div className={`text-3xl font-black font-mono ${st.baseHp > 0 ? 'text-red-500' : 'text-neutral-600'}`}>
              {"♥".repeat(Math.max(0, st.baseHp))}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-neutral-400 font-bold mb-1">时间轴</div>
            <div className="text-xl font-bold text-neutral-300 font-mono mt-1">{st.time.toFixed(1)}s</div>
          </div>
        </div>

        {/* 干员选择区 */}
        <div className="flex gap-3">
          {OPERATOR_TYPES.map(op => (
            <button
              key={op.id}
              onClick={() => setSelectedOp(op)}
              className={`relative p-2 rounded-lg border-2 transition-all flex flex-col items-center w-24
                ${selectedOp.id === op.id ? 'border-yellow-400 bg-neutral-800 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : 'border-neutral-700 bg-neutral-950 hover:border-neutral-500'}
                ${st.dp < op.cost ? 'opacity-50 grayscale' : ''}
              `}
            >
              <div className="absolute -top-3 -right-2 bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-md border border-blue-400">
                {op.cost}
              </div>
              <div className="w-6 h-6 rounded-full mb-1 border-2 border-white/20" style={{backgroundColor: op.color}} />
              <div className="text-xs font-bold text-neutral-200">{op.name.split(' ')[0]}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">{op.type === TILE_TYPES.HIGH ? '高台' : '地面'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 游戏战斗视窗 */}
      <div className="flex justify-center w-full overflow-x-auto p-4">
        <div className="relative bg-neutral-700 border-4 border-neutral-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none">
          
          {/* 胜负状态浮层 */}
          {st.state !== 'PLAYING' && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in zoom-in-95">
              <h2 className={`text-4xl md:text-6xl font-black tracking-widest mb-6 ${st.state === 'WIN' ? 'text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'text-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]'}`}>
                {st.state === 'WIN' ? 'OPERATION CLEAR' : 'OPERATION FAILED'}
              </h2>
              <button onClick={onExit} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform text-lg shadow-xl pointer-events-auto">
                返回大厅
              </button>
            </div>
          )}

          {/* 静态地图层 (移除 gap 保证百分比渲染严丝合缝) */}
          <div 
            className="grid"
            style={{ gridTemplateColumns: `repeat(${gridW}, minmax(0, 1fr))` }}
          >
            {(level?.mapData || []).map((row, y) => row.map((cellType, x) => (
              <div
                key={`${x}-${y}`}
                onClick={() => handleGridClick(x, y)}
                className={`w-12 h-12 md:w-16 md:h-16 relative cursor-crosshair border transition-all hover:brightness-125
                  ${TILE_STYLES[cellType]}
                  ${selectedOp.type === cellType ? 'hover:shadow-[inset_0_0_15px_rgba(255,255,255,0.4)]' : ''}
                `}
              >
                {cellType === TILE_TYPES.SPAWN && <span className="absolute inset-0 flex items-center justify-center opacity-30 text-xs font-bold pointer-events-none">出怪</span>}
                {cellType === TILE_TYPES.BASE && <span className="absolute inset-0 flex items-center justify-center opacity-30 text-xs font-bold pointer-events-none">终点</span>}
              </div>
            )))}
          </div>

          {/* 动态实体 SVG 渲染层 */}
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {/* 渲染干员 (塔) */}
            {st.towers.map(t => (
              <div 
                key={t.id} 
                className="absolute flex items-center justify-center" 
                style={{ 
                  left: `${(t.x / level.gridWidth) * 100}%`, 
                  top: `${(t.y / level.gridHeight) * 100}%`,
                  width: `${(1 / level.gridWidth) * 100}%`,
                  height: `${(1 / level.gridHeight) * 100}%`
                }}
              >
                <div className="w-2/3 h-2/3 rounded-md shadow-lg border-2 border-white flex items-center justify-center relative" style={{ backgroundColor: t.color }}>
                  {/* 攻击范围虚线框指示 */}
                  <div className="absolute w-[300%] h-[300%] border border-dashed rounded-full opacity-10 animate-[spin_10s_linear_infinite]" style={{ borderColor: t.color }} />
                </div>
              </div>
            ))}

            {/* 渲染敌人和血条与名字 */}
            {st.enemies.map(e => (
              <div 
                key={e.id} 
                className="absolute flex items-center justify-center transition-transform duration-75" 
                style={{ 
                  left: `${(e.x / gridW) * 100}%`, top: `${(e.y / gridH) * 100}%`,
                  width: `${(1 / gridW) * 100}%`, height: `${(1 / gridH) * 100}%`
                }}
              >
                <div className="relative flex flex-col items-center">
                  {/* 新增优化：半透明敌人名字 UI */}
                  <span className="absolute -top-6 text-[10px] font-bold text-white whitespace-nowrap bg-black/60 px-1.5 py-0.5 rounded shadow-sm z-20">
                    {e.name.split(' ')[0]}
                  </span>
                  
                  {/* 血条 */}
                  <div className="w-8 h-1.5 bg-neutral-900 rounded-full mb-1 border border-neutral-700 overflow-hidden z-10">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%` }} />
                  </div>
                  
                  {/* 敌人本体 */}
                  <div className="w-6 h-6 rounded-full shadow-lg border-2 border-white animate-bounce" style={{ backgroundColor: e.color, animationDuration: `${0.5 / e.speed}s` }} />
                  
                  {/* 发呆状态 */}
                  {e.waitTimer > 0 && <span className="absolute -bottom-4 text-[10px] font-black text-yellow-400 drop-shadow-md">发呆...</span>}
                </div>
              </div>
            ))}

            {/* 渲染攻击射线 (激光) */}
            <svg className="absolute inset-0 w-full h-full">
              {st.projectiles.map(p => {
                // 转换坐标系为 SVG 百分比
                const x1 = ((p.x1 + 0.5) / level.gridWidth) * 100;
                const y1 = ((p.y1 + 0.5) / level.gridHeight) * 100;
                const x2 = ((p.x2 + 0.5) / level.gridWidth) * 100;
                const y2 = ((p.y2 + 0.5) / level.gridHeight) * 100;
                return (
                  <line key={p.id} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke={p.color} strokeWidth="4" strokeLinecap="round" className="opacity-80 animate-pulse" style={{ opacity: Math.max(0, 1 - (p.age / 0.15)) }} />
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-neutral-500 flex gap-4">
        <span>🖱️ 左键点击匹配的地形部署干员 (先锋可放置在地面以产费)</span>
        <span>|</span>
        <button onClick={onExit} className="text-neutral-400 hover:text-white underline underline-offset-4 transition-colors">强制退出试玩</button>
      </div>
    </div>
  );
};


export default function LevelEditor() {
  const [level, setLevel] = useState(INITIAL_LEVEL);
  const [selectedTool, setSelectedTool] = useState(TILE_TYPES.GROUND);
  const [isDrawing, setIsDrawing] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  
  // 视图模式：EDITOR (编辑器), JSON (代码导出), PLAY_MENU (选关大厅), PLAYING (游玩中)
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('arknights_custom_levels');
      if (stored) {
        setSavedLevels(JSON.parse(stored));
      }
    } catch (e) { console.warn("Failed to load levels from localStorage"); }
  }, []);

  useEffect(() => {
    let newSpawns = [];
    let newBases = [];
    (level.mapData || []).forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === TILE_TYPES.SPAWN) newSpawns.push({ x, y, id: `R${newSpawns.length + 1}` });
        else if (cell === TILE_TYPES.BASE) newBases.push({ x, y, id: `B${newBases.length + 1}` });
      });
    });
    setSpawns(newSpawns);
    setBases(newBases);
  }, [level.mapData]);

  useEffect(() => {
    if (viewMode === 'JSON') setJsonInput(JSON.stringify(level, null, 2));
  }, [level, viewMode]);

  const handleSaveClick = () => {
    setSaveNameInput(level.name);
    setShowSaveModal(true);
  };

  const handleConfirmSave = () => {
    if (!saveNameInput.trim()) return;

    const updatedLevel = {
      ...level,
      name: saveNameInput,
      levelId: level.levelId === 'level_01' ? `lvl_${Date.now()}` : level.levelId
    };
    setLevel(updatedLevel);

    const existingLevels = [...savedLevels];
    const existingIndex = existingLevels.findIndex(l => l.levelId === updatedLevel.levelId);
    if (existingIndex >= 0) {
      existingLevels[existingIndex] = updatedLevel;
    } else {
      existingLevels.push(updatedLevel);
    }
    setSavedLevels(existingLevels);
    try {
      localStorage.setItem('arknights_custom_levels', JSON.stringify(existingLevels));
      setToastMsg("保存成功！已同步至试玩大厅。");
    } catch(e) { console.warn("Local storage full or disabled."); }

    const jsonStr = JSON.stringify(updatedLevel, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${saveNameInput.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowSaveModal(false);
  };

  const handleStartPlay = () => {
    if (!selectedLevelToPlay) {
      setToastMsg("请先选择一个关卡！");
      return;
    }
    setViewMode('PLAYING');
  };

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const resizeGrid = (newWidth, newHeight) => {
    const validWidth = Math.max(3, Math.min(30, newWidth));
    const validHeight = Math.max(3, Math.min(20, newHeight));
    let newMapData = [];
    for (let y = 0; y < validHeight; y++) {
      let row = [];
      for (let x = 0; x < validWidth; x++) {
        row.push(y < level.gridHeight && x < level.gridWidth ? level.mapData[y][x] : TILE_TYPES.WALL);
      }
      newMapData.push(row);
    }
    setLevel({ ...level, gridWidth: validWidth, gridHeight: validHeight, mapData: newMapData });
  };
  const handleTileDraw = (x, y) => {
    const newMapData = [...level.mapData];
    newMapData[y] = [...newMapData[y]];
    newMapData[y][x] = selectedTool;
    setLevel({ ...level, mapData: newMapData });
  };
  const addWave = () => {
    const newWave = {
      waveId: `w_${Date.now()}`, time: 10.0, enemyType: ENEMY_TYPES[0].id, count: 1, interval: 1.0,
      spawnId: spawns.length > 0 ? spawns[0].id : "", targetId: bases.length > 0 ? bases[0].id : "", path: []
    };
    setLevel({ ...level, waves: [...(level.waves || []), newWave] });
  };
  const updateWave = (index, field, value) => {
    const newWaves = [...level.waves];
    newWaves[index] = { ...newWaves[index], [field]: value };
    setLevel({ ...level, waves: newWaves });
  };
  const removeWave = (index) => {
    if (editingWaveIndex === index) setEditingWaveIndex(null);
    const newWaves = [...level.waves];
    newWaves.splice(index, 1);
    setLevel({ ...level, waves: newWaves });
  };
  const autoCalculatePath = (index) => {
    const wave = level.waves[index];
    const start = spawns.find(s => s.id === wave.spawnId);
    const end = bases.find(b => b.id === wave.targetId);
    if (!start || !end) { setPathError("起点或终点不存在，无法自动寻路！"); return; }
    const queue = [{ x: start.x, y: start.y, path: [{ x: start.x, y: start.y, wait: 0 }] }];
    const visited = new Set([`${start.x},${start.y}`]);
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; 
    let foundPath = null;
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.x === end.x && curr.y === end.y) { foundPath = curr.path; break; }
      for (let [dx, dy] of dirs) {
        const nx = curr.x + dx; const ny = curr.y + dy;
        if (nx >= 0 && nx < level.gridWidth && ny >= 0 && ny < level.gridHeight) {
          const cellType = level.mapData[ny][nx];
          const isWalkable = cellType === TILE_TYPES.GROUND || cellType === TILE_TYPES.SPAWN || cellType === TILE_TYPES.BASE;
          if (isWalkable && !visited.has(`${nx},${ny}`)) {
            visited.add(`${nx},${ny}`);
            queue.push({ x: nx, y: ny, path: [...curr.path, { x: nx, y: ny, wait: 0 }] });
          }
        }
      }
    }
    if (foundPath) { updateWave(index, 'path', foundPath); setPathError(""); } 
    else { setPathError(`自动寻路失败：道路被障碍物或高台完全封死。`); }
  };
  const handlePathGridClick = (x, y, isRightClick) => {
    if (editingWaveIndex === null) return;
    const newWaves = [...level.waves];
    const wave = newWaves[editingWaveIndex];
    let currentPath = wave.path ? [...wave.path] : [];
    if (isRightClick) {
      const nodeIndex = currentPath.findIndex(p => p.x === x && p.y === y);
      if (nodeIndex !== -1) currentPath = currentPath.slice(0, nodeIndex);
      else if (currentPath.length > 0) currentPath.pop();
    } else {
      const lastNode = currentPath[currentPath.length - 1];
      if (!lastNode || lastNode.x !== x || lastNode.y !== y) currentPath.push({ x, y, wait: 0 });
    }
    wave.path = currentPath; setLevel({ ...level, waves: newWaves });
  };
  const updatePathWaitTime = (waveIndex, pathIndex, waitTime) => {
    const newWaves = [...level.waves];
    newWaves[waveIndex].path[pathIndex].wait = Math.max(0, parseFloat(waitTime) || 0);
    setLevel({ ...level, waves: newWaves });
  };

  return (
    <div 
      className="min-h-screen bg-neutral-900 text-neutral-200 p-6 flex flex-col font-sans select-none"
      onMouseUp={() => setIsDrawing(false)}
      onMouseLeave={() => setIsDrawing(false)}
      onContextMenu={(e) => e.preventDefault()} 
    >
      <div className="max-w-7xl mx-auto w-full space-y-6">
        
        {/* Header - 顶栏加入新的切换按钮 */}
        <header className="flex items-center justify-between border-b border-neutral-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Grid3x3 className="text-blue-400" />
              方舟关卡编辑器 <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full ml-2">引擎完全体</span>
            </h1>
            <p className="text-neutral-400 text-sm mt-1">支持本地关卡存储与专业独立塔防引擎试玩</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => { setViewMode('JSON'); setEditingWaveIndex(null); }}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors border ${viewMode === 'JSON' ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}`}
            >
              &lt;/&gt; JSON 代码
            </button>
            <button 
              onClick={() => { setViewMode('EDITOR'); setEditingWaveIndex(null); }}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors border ${viewMode === 'EDITOR' ? 'bg-neutral-700 text-white border-neutral-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}`}
            >
              <Map size={16} className="inline mr-1" /> 编辑器
            </button>
            <button 
              onClick={() => { setViewMode('PLAY_MENU'); setEditingWaveIndex(null); }}
              className={`px-5 py-2 rounded-md text-sm font-bold transition-colors border shadow-md flex items-center gap-2 ${viewMode === 'PLAY_MENU' ? 'bg-green-600 border-green-500 text-white' : 'bg-green-900/40 border-green-800/50 text-green-400 hover:bg-green-800/60'}`}
            >
              <Gamepad2 size={18} /> 试玩大厅
            </button>
          </div>
        </header>

        {/* 主体视图路由 */}
        {viewMode === 'JSON' ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">关卡标准 JSON 导出格式</h2>
              <button 
                onClick={() => {
                  try { setLevel(JSON.parse(jsonInput)); setViewMode('EDITOR'); } 
                  catch (e) { setToastMsg("无效的 JSON 字符串！"); }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-sm font-medium transition-colors"
              >
                <Upload size={16} /> 导入并应用
              </button>
            </div>
            <textarea
              className="w-full h-[600px] bg-neutral-950 border border-neutral-700 rounded-lg p-4 font-mono text-sm text-green-400 focus:outline-none focus:border-blue-500"
              value={jsonInput} onChange={(e) => setJsonInput(e.target.value)}
            />
          </div>
        ) : viewMode === 'PLAY_MENU' ? (
          /* ================= 试玩大厅视图 ================= */
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-10 min-h-[600px] flex flex-col items-center animate-in zoom-in-95 duration-200 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]">
             <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                  <Gamepad2 size={48} className="mx-auto text-green-500 mb-4 opacity-80" />
                  <h2 className="text-3xl font-black text-white tracking-wide">选择关卡试玩</h2>
                  <p className="text-neutral-500 mt-2">在这里选择你保存的关卡，或者直接导入外部关卡文件</p>
                </div>

                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-xl">
                  <h3 className="text-sm font-bold text-neutral-400 mb-4 uppercase tracking-wider border-b border-neutral-800 pb-2">本地已保存的关卡</h3>
                  
                  {savedLevels.length === 0 ? (
                    <div className="text-center py-10 text-neutral-600 bg-neutral-950 rounded-lg border border-dashed border-neutral-800">
                      <p>暂无保存的关卡</p>
                      <p className="text-sm mt-1">请先在编辑器中点击右下角的 [保存并导出]</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                      {savedLevels.map((lvl) => (
                        <div 
                          key={lvl.levelId}
                          onClick={() => setSelectedLevelToPlay(lvl)}
                          className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all ${selectedLevelToPlay?.levelId === lvl.levelId ? 'bg-blue-900/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800'}`}
                        >
                          <div>
                            <div className="font-bold text-white text-lg">{lvl.name}</div>
                            <div className="text-xs text-neutral-500 flex gap-3 mt-1">
                              <span>尺寸: {lvl.gridWidth}x{lvl.gridHeight}</span>
                              <span>波次: {lvl.waves?.length || 0}</span>
                              <span>初始DP: {lvl.initialDp}</span>
                            </div>
                          </div>
                          {selectedLevelToPlay?.levelId === lvl.levelId && (
                            <Check className="text-blue-500" size={24} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-8 pt-6 border-t border-neutral-800 flex justify-between items-center">
                    <button className="text-sm text-neutral-400 hover:text-white underline decoration-neutral-600 underline-offset-4 flex items-center gap-2 opacity-50 cursor-not-allowed" title="暂未开放该扩展">
                      <Upload size={14}/> 导入本地 .json 文件
                    </button>

                    <button 
                      onClick={handleStartPlay}
                      disabled={!selectedLevelToPlay}
                      className={`px-8 py-3 rounded-full font-black flex items-center gap-2 text-lg transition-all ${selectedLevelToPlay ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:scale-105' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}
                    >
                      <Play fill="currentColor" size={20} /> START PLAY
                    </button>
                  </div>
                </div>
             </div>
          </div>
        ) : viewMode === 'PLAYING' ? (
          /* ================= 游戏引擎视图 ================= */
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-6 min-h-[600px] flex flex-col items-center justify-center">
            <PlayMode level={selectedLevelToPlay} onExit={() => setViewMode('PLAY_MENU')} />
          </div>
        ) : (
          /* ================= 编辑器视图 ================= */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Panel */}
            <div className="lg:col-span-1 bg-neutral-800 rounded-xl border border-neutral-700 shadow-xl overflow-hidden flex flex-col h-[700px]">
              
              <div className="flex border-b border-neutral-700 bg-neutral-900">
                <button 
                  className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'MAP' ? 'text-blue-400 border-b-2 border-blue-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`}
                  onClick={() => { setActiveTab('MAP'); setEditingWaveIndex(null); }}
                >
                  <Map size={16}/> 地形搭建
                </button>
                <button 
                  className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'WAVES' ? 'text-rose-400 border-b-2 border-rose-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`}
                  onClick={() => setActiveTab('WAVES')}
                >
                  <Layers size={16}/> 波次与动线
                </button>
              </div>

              {activeTab === 'MAP' && (
                <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-400 mb-3">地形画笔</h3>
                    <div className="space-y-2">
                      {Object.entries(TILE_TYPES).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => setSelectedTool(val)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all ${
                            selectedTool === val ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded border ${TILE_STYLES[val]} flex items-center justify-center`}>
                            {val === TILE_TYPES.SPAWN && 'R'}
                            {val === TILE_TYPES.BASE && 'B'}
                          </div>
                          <span className="text-sm font-medium">{TILE_NAMES[val]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-neutral-700 pt-5 space-y-4">
                    <h3 className="text-sm font-bold text-neutral-400">全局属性</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs text-neutral-500 mb-1 block">宽 (W)</label><input type="number" value={level.gridWidth} onChange={(e) => resizeGrid(parseInt(e.target.value)||3, level.gridHeight)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm" /></div>
                      <div><label className="text-xs text-neutral-500 mb-1 block">高 (H)</label><input type="number" value={level.gridHeight} onChange={(e) => resizeGrid(level.gridWidth, parseInt(e.target.value)||3)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm" /></div>
                      <div><label className="text-xs text-neutral-500 mb-1 block">初始 DP</label><input type="number" value={level.initialDp} onChange={(e) => setLevel({...level, initialDp: parseInt(e.target.value) || 0})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm" /></div>
                      <div><label className="text-xs text-neutral-500 mb-1 block">基地 HP</label><input type="number" value={level.baseHealth} onChange={(e) => setLevel({...level, baseHealth: parseInt(e.target.value) || 0})} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm" /></div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'WAVES' && (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar relative">
                    {editingWaveIndex !== null ? (
                      <div className="absolute inset-0 bg-neutral-800 z-10 flex flex-col p-4 animate-in slide-in-from-right-4">
                        <div className="flex items-center justify-between mb-4 border-b border-neutral-700 pb-3">
                          <h3 className="font-bold text-yellow-400 flex items-center gap-2">
                            <Route size={18}/> 编辑波次 {editingWaveIndex + 1} 动线
                          </h3>
                          <button onClick={() => setEditingWaveIndex(null)} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-bold flex items-center gap-1">
                            <Check size={14}/> 完成
                          </button>
                        </div>
                        <div className="flex gap-2 mb-4">
                          <button onClick={() => autoCalculatePath(editingWaveIndex)} className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs flex justify-center items-center gap-1 border border-neutral-600">
                            <Wand2 size={12}/> AI 寻路填入
                          </button>
                          <button onClick={() => updateWave(editingWaveIndex, 'path', [])} className="flex-1 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded text-xs flex justify-center items-center gap-1 border border-red-900">
                            <Trash2 size={12}/> 清空路线
                          </button>
                        </div>
                        <div className="text-xs text-neutral-400 mb-2">已选中 {(level.waves || [])[editingWaveIndex]?.path?.length || 0} 个路径节点：</div>
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                          {((level.waves || [])[editingWaveIndex]?.path || []).map((node, i) => (
                            <div key={i} className="flex items-center justify-between bg-neutral-900 p-2 rounded border border-neutral-700">
                              <div className="flex items-center gap-2">
                                <span className="bg-yellow-500/20 text-yellow-400 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-yellow-500/50">
                                  {i + 1}
                                </span>
                                <span className="text-xs text-neutral-500">({node.x}, {node.y})</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock size={12} className="text-neutral-500"/>
                                <input 
                                  type="number" step="0.5" min="0" value={node.wait} 
                                  onChange={(e) => updatePathWaitTime(editingWaveIndex, i, e.target.value)}
                                  className="w-14 bg-neutral-800 border border-neutral-600 rounded px-1 py-0.5 text-xs text-center focus:border-yellow-500 outline-none" 
                                />
                                <span className="text-[10px] text-neutral-500">秒</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {spawns.length === 0 || bases.length === 0 ? (
                          <div className="text-sm text-yellow-500 bg-yellow-500/10 p-3 rounded border border-yellow-500/20">请先在地图上放置红门和蓝门。</div>
                        ) : null}
                        {(level.waves || []).map((wave, index) => (
                          <div key={wave.waveId} className={`bg-neutral-900 rounded-lg border p-4 space-y-3 relative group transition-colors ${editingWaveIndex === index ? 'border-yellow-500' : 'border-neutral-700'}`}>
                            <button onClick={() => removeWave(index)} className="absolute top-3 right-3 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-neutral-700 text-xs px-2 py-1 rounded font-bold">波次 {index + 1}</span>
                              <button 
                                onClick={() => setEditingWaveIndex(index)}
                                className="text-xs flex items-center gap-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50 px-2 py-1 rounded ml-auto transition-colors"
                              >
                                <Route size={14} /> 编辑/查看动线
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div><label className="text-[10px] text-neutral-500 block">出现时间(s)</label><input type="number" step="0.5" value={wave.time} onChange={(e) => updateWave(index, 'time', parseFloat(e.target.value))} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1"/></div>
                              <div><label className="text-[10px] text-neutral-500 block">生成数量</label><input type="number" value={wave.count} onChange={(e) => updateWave(index, 'count', parseInt(e.target.value))} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1"/></div>
                            </div>
                            <div>
                              <label className="text-[10px] text-neutral-500 block">敌军种类</label>
                              <select value={wave.enemyType} onChange={(e) => updateWave(index, 'enemyType', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs mt-1 outline-none">
                                {ENEMY_TYPES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3 bg-neutral-950/50 p-2 rounded border border-neutral-800">
                              <div>
                                <label className="text-[10px] text-neutral-500 block">红门起点</label>
                                <select value={wave.spawnId} onChange={(e) => updateWave(index, 'spawnId', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1 text-red-400 font-bold outline-none">
                                  {spawns.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-neutral-500 block">蓝门终点</label>
                                <select value={wave.targetId} onChange={(e) => updateWave(index, 'targetId', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs mt-1 text-blue-400 font-bold outline-none">
                                  {bases.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  {editingWaveIndex === null && (
                    <div className="p-4 border-t border-neutral-700 bg-neutral-800">
                      <button onClick={addWave} className="w-full py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-semibold flex justify-center items-center gap-2">
                        <Plus size={16}/> 新增波次
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Canvas Area */}
            <div className={`lg:col-span-3 bg-neutral-950 rounded-xl border overflow-hidden flex flex-col relative h-[700px] transition-colors ${editingWaveIndex !== null ? 'border-yellow-500 shadow-[inset_0_0_50px_rgba(234,179,8,0.05)]' : 'border-neutral-800'}`}>
              
              {pathError && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-900/90 border border-red-500 text-red-200 px-4 py-2 rounded-full text-sm shadow-lg z-10 flex items-center gap-2 animate-in slide-in-from-top-4">
                  <span>⚠️</span> {pathError}
                </div>
              )}

              <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
                <div 
                  className="grid gap-[1px] bg-neutral-700 border border-neutral-600 shadow-2xl relative"
                  style={{ gridTemplateColumns: `repeat(${level.gridWidth}, minmax(0, 1fr))` }}
                >
                  {(level.mapData || []).map((row, y) => (
                    row.map((cellType, x) => {
                      const currentPath = editingWaveIndex !== null ? ((level.waves || [])[editingWaveIndex]?.path || []) : [];
                      const pathNodeIndex = currentPath.findIndex(p => p.x === x && p.y === y);
                      const isPath = pathNodeIndex !== -1;
                      const waitTime = isPath ? currentPath[pathNodeIndex].wait : 0;
                      const spawnData = spawns.find(s => s.x === x && s.y === y);
                      const baseData = bases.find(b => b.x === x && b.y === y);
                      const isEditMode = editingWaveIndex !== null;
                      const opacityClass = isEditMode && !isPath ? 'opacity-60 hover:opacity-100' : 'opacity-100';

                      return (
                        <div
                          key={`${x}-${y}`}
                          className={`w-12 h-12 md:w-16 md:h-16 border cursor-pointer select-none transition-all duration-75 relative
                            ${TILE_STYLES[cellType]} ${opacityClass}
                            ${isPath ? '!bg-yellow-500/40 !border-yellow-400 shadow-[inset_0_0_15px_rgba(250,204,21,0.6)] z-10' : ''}
                          `}
                          onMouseDown={(e) => {
                            if (isEditMode) { handlePathGridClick(x, y, e.button === 2); } 
                            else { if (e.button === 0) { setIsDrawing(true); handleTileDraw(x, y); } }
                          }}
                          onMouseEnter={() => { if (isDrawing && !isEditMode) handleTileDraw(x, y); }}
                        >
                          {spawnData && <span className="drop-shadow-md text-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{spawnData.id}</span>}
                          {baseData && <span className="drop-shadow-md text-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{baseData.id}</span>}
                          {isPath && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-yellow-100 font-black text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{pathNodeIndex + 1}</span>
                              {waitTime > 0 && <div className="absolute bottom-1 bg-black/70 px-1 rounded flex items-center gap-0.5 text-[10px] text-yellow-400"><Clock size={8}/> {waitTime}s</div>}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
              
              {/* 底部操作提示栏 */}
              <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs font-medium z-10 pointer-events-none">
                {editingWaveIndex !== null ? (
                  <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-4 py-2 rounded-full backdrop-blur-md flex items-center gap-3">
                    <span className="flex items-center gap-1"><MousePointer2 size={14}/> 左键: 添加路线节点</span>
                    <span className="w-px h-3 bg-yellow-500/50"></span>
                    <span>右键: 撤销节点</span>
                  </div>
                ) : (
                  <div className="text-neutral-500 bg-neutral-900/80 px-4 py-2 rounded-full backdrop-blur-md">
                    <MousePointer2 size={12} className="inline mr-1" /> 按住鼠标左键可拖拽涂鸦地形
                  </div>
                )}
              </div>

              {/* 新增：保存并导出按钮 */}
              {editingWaveIndex === null && (
                <div className="absolute bottom-4 right-4 z-10">
                  <button 
                    onClick={handleSaveClick} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-bold shadow-xl transition-all hover:scale-105 active:scale-95 border border-blue-400"
                  >
                    <Download size={18} /> 保存并导出当前关卡
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= 浮层组件 ================= */}
        
        {/* 自定义 Toast 提示 */}
        {toastMsg && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl border border-neutral-700 z-50 animate-in slide-in-from-top-4 flex items-center gap-2">
            <Check size={16} className="text-green-400"/> {toastMsg}
          </div>
        )}

        {/* 自定义保存弹窗 */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-xl shadow-2xl w-96 animate-in zoom-in-95">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Save size={20} className="text-blue-400"/> 保存并导出关卡
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-neutral-400 block mb-1">关卡名称</label>
                  <input 
                    type="text" 
                    value={saveNameInput}
                    onChange={(e) => setSaveNameInput(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-neutral-800">
                  <button 
                    onClick={() => setShowSaveModal(false)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md text-sm font-bold transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleConfirmSave}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-bold shadow-lg shadow-blue-900/50 transition-colors"
                  >
                    确认保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .crosshatch { background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.3) 5px, rgba(0,0,0,0.3) 10px), repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(0,0,0,0.3) 5px, rgba(0,0,0,0.3) 10px); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #525252; border-radius: 20px; }
      `}} />
    </div>
  );
}