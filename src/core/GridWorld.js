import { Logger } from '../utils/Logger.js';

export class GridWorld {
  constructor() {
    Logger.log("Initializing GridWorld core");
    this.grid = this.createGrid();
    this.agentPos = [0, 0];
    this.goalPos = [9, 9];
    this.returning = false;
    this.enemies = [
      { pos: [2, 4], path: [[2, 4], [2, 5], [2, 6], [2, 7], [2, 6], [2, 5]], phase: 0, facing: 'right' },
      { pos: [5, 7], path: [[5, 7], [5, 8], [5, 9], [5, 8], [5, 7]], phase: 0, facing: 'right' },
      { pos: [7, 3], path: [[7, 3], [8, 3], [9, 3], [8, 3], [7, 3]], phase: 0, facing: 'down' }
    ];
    this.qTable = {};
    this.stats = { episode: 1, step: 0, reward: 0, totalReward: 0, coverUses: 0, exposures: 0 };
    this.actions = ['up', 'down', 'left', 'right', 'wait'];
    this.params = {
      alpha: 0.1, 
      gamma: 0.9, 
      epsilon: 1.0, 
      epsilonDecay: 0.99,
      minEpsilon: 0.005,
      timePenalty: -0.01, // Reduced
      distancePenalty: -0.005, // Reduced
      forwardReward: 0.5, // Increased
      enemyRadius: 1.5,
      proximityWeight: 15.0,
      riskExposureWeight: 5.0,
      safeDistanceReward: 0.2,
      coverStreakBonus: 0.05,
      explorationBonus: 0.05,
      predictiveWaitReward: 0.15
    };
    this.losCache = this.precomputeLOSCache();
    this.totalExposures = 0;
    this.riskExposure = 0;
    this.coverStreak = 0;
    this.visitedTiles = new Set();
    this.visitedTiles.add(this.agentPos.toString());
    this.prevMinDistance = this.getMinDistanceToEnemy();
  }

  createGrid() {
    const map = [
      "S..C........",
      "...C........",
      "W..C........",
      "...W....C...",
      "....W....C..",
      "....W....C..",
      "...C....W...",
      "..........W...",
      "C..C....W...",
      "...........G"
    ].map(row => row.padEnd(10, '.').split(''));
    return map;
  }

  precomputeLOSCache() {
    const cache = {};
    for (let x = 0; x < this.grid.length; x++) {
      for (let y = 0; y < this.grid[0].length; y++) {
        cache[`${x},${y}`] = {
          right: this.computeLOS(x, y, 'right'),
          left: this.computeLOS(x, y, 'left'),
          down: this.computeLOS(x, y, 'down'),
          up: this.computeLOS(x, y, 'up')
        };
      }
    }
    return cache;
  }

  computeLOS(x, y, facing) {
    const los = [];
    let range = 4;
    if (this.grid[x][y] === 'C') range = 2;
    if (facing === 'right') {
      for (let i = 1; i <= range && y + i < this.grid[0].length; i++) {
        if (this.grid[x][y + i] === 'W') break;
        los.push([x, y + i]);
      }
    } else if (facing === 'left') {
      for (let i = 1; i <= range && y - i >= 0; i++) {
        if (this.grid[x][y - i] === 'W') break;
        los.push([x, y - i]);
      }
    } else if (facing === 'down') {
      for (let i = 1; i <= range && x + i < this.grid.length; i++) {
        if (this.grid[x + i][y] === 'W') break;
        los.push([x + i, y]);
      }
    } else if (facing === 'up') {
      for (let i = 1; i <= range && x - i >= 0; i++) {
        if (this.grid[x - i][y] === 'W') break;
        los.push([x - i, y]);
      }
    }
    return los;
  }

  updateEnemies() {
    this.enemies.forEach(enemy => {
      enemy.phase = (enemy.phase + 1) % enemy.path.length;
      enemy.pos = enemy.path[enemy.phase];
      enemy.facing = this.getFacing(enemy);
      if (enemy.path[0][0] === enemy.path[1][0]) {
        enemy.facing = (enemy.phase % 2 === 0) ? 'right' : 'left';
      }
      Logger.log(`Enemy at ${enemy.pos} facing ${enemy.facing}`);
    });
  }

  getFacing(enemy) {
    const nextPhase = (enemy.phase + 1) % enemy.path.length;
    const prevPhase = (enemy.phase - 1 + enemy.path.length) % enemy.path.length;
    const curr = enemy.pos;
    const next = enemy.path[nextPhase];
    const prev = enemy.path[prevPhase];
    if (next[1] > curr[1] || prev[1] > curr[1]) return 'right';
    if (next[1] < curr[1] || prev[1] < curr[1]) return 'left';
    if (next[0] > curr[0] || prev[0] > curr[0]) return 'down';
    if (next[0] < curr[0] || prev[0] < curr[0]) return 'up';
    return enemy.facing;
  }

  isDetected() {
    for (const enemy of this.enemies) {
      const [ex, ey] = enemy.pos;
      const dx = this.agentPos[0] - ex;
      const dy = this.agentPos[1] - ey;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= this.params.enemyRadius && this.grid[this.agentPos[0]][this.agentPos[1]] !== 'C') {
        Logger.log(`Agent detected at ${JSON.stringify(this.agentPos)} by enemy at ${JSON.stringify(enemy.pos)}, distance: ${distance}, radius: ${this.params.enemyRadius}`);
        return true;
      }
    }
    return false;
  }

  isAtRiskOfDetection() {
    for (const enemy of this.enemies) {
      const [ex, ey] = enemy.pos;
      const dx = this.agentPos[0] - ex;
      const dy = this.agentPos[1] - ey;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 1.5 && this.grid[this.agentPos[0]][this.agentPos[1]] !== 'C') {
        return true;
      }
    }
    return false;
  }

  getMinDistanceToEnemy() {
    let minDistance = Infinity;
    for (const enemy of this.enemies) {
      const dx = this.agentPos[0] - enemy.pos[0];
      const dy = this.agentPos[1] - enemy.pos[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      minDistance = Math.min(minDistance, distance);
    }
    return Math.max(0.1, minDistance);
  }

  getRiskExposure() {
    let exposureCount = 0;
    for (const enemy of this.enemies) {
      const dx = this.agentPos[0] - enemy.pos[0];
      const dy = this.agentPos[1] - enemy.pos[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 3.0) exposureCount++;
    }
    return exposureCount;
  }

  getState() {
    const obsRadius = 2;
    const obs = [];
    for (let i = -obsRadius; i <= obsRadius; i++) {
      for (let j = -obsRadius; j <= obsRadius; j++) {
        const x = this.agentPos[0] + i;
        const y = this.agentPos[1] + j;
        if (x >= 0 && x < this.grid.length && y >= 0 && y < this.grid[0].length) {
          obs.push(this.grid[x][y] || '.');
        } else {
          obs.push('W');
        }
      }
    }
    const enemyVisible = this.enemies.some(enemy => {
      const [ex, ey] = enemy.pos;
      return Math.abs(ex - this.agentPos[0]) <= obsRadius && Math.abs(ey - this.agentPos[1]) <= obsRadius;
    });
    const enemyInfo = this.enemies.map(enemy => ({
      pos: enemy.pos,
      facing: enemy.facing
    }));
    return JSON.stringify({
      agentPos: this.agentPos,
      returning: this.returning,
      obs,
      enemyVisible,
      enemyInfo,
      riskExposure: this.riskExposure > 0 ? 1 : 0
    });
  }

  calculateReward() {
    let reward = this.params.timePenalty;
    const [x, y] = this.agentPos;
    const target = this.returning ? [0, 0] : [9, 9];
    const prevDistance = this.prevDistance || Math.sqrt((this.agentPos[0] - target[0]) ** 2 + (this.agentPos[1] - target[1]) ** 2);
    const newDistance = Math.sqrt((this.agentPos[0] - target[0]) ** 2 + (this.agentPos[1] - target[1]) ** 2);
    this.prevDistance = newDistance;

    // Enhanced forward reward for good steps
    if (newDistance < prevDistance) {
      let forwardReward = this.params.forwardReward;
      // Scale reward inversely with distance (closer to target = higher reward)
      forwardReward *= (10 / Math.max(1, newDistance)); // Scale factor, capped at 10
      // Adjust based on safety
      const minDistance = this.getMinDistanceToEnemy();
      const atRisk = this.isAtRiskOfDetection();
      if (minDistance > 3.0) {
        forwardReward *= 1.5; // Safe step bonus
      } else if (atRisk) {
        forwardReward *= 0.5; // Risky step penalty
      } else if (minDistance <= 3.0) {
        forwardReward *= 0.75; // Near enemy but not at risk
      }
      reward += forwardReward;
      Logger.log(`Good step: Distance decreased to ${newDistance.toFixed(2)}, forwardReward: ${forwardReward.toFixed(2)}`);
    }
    reward += this.params.distancePenalty * newDistance;

    // Cover bonus and streak
    if (this.grid[x][y] === 'C') {
      reward += 0.2;
      this.coverStreak++;
      reward += this.coverStreak * this.params.coverStreakBonus;
    } else {
      this.coverStreak = 0;
    }

    // Goal and return rewards
    if ((x === this.goalPos[0] && y === this.goalPos[1] && !this.returning) ||
        (x === 0 && y === 0 && this.returning)) {
      reward += 100;
      this.riskExposure = 0;
      this.coverStreak = 0;
    }

    // Proximity penalty (capped)
    const minDistance = this.getMinDistanceToEnemy();
    const proximityPenalty = Math.min(1.0, this.params.proximityWeight / minDistance); // Cap at 1.0
    reward -= proximityPenalty;

    // Risk exposure penalty
    const exposureCount = this.getRiskExposure();
    if (exposureCount > 0) {
      this.riskExposure += exposureCount * 0.1;
      reward -= this.params.riskExposureWeight * this.riskExposure;
    } else {
      this.riskExposure = 0;
    }

    // Safe distance reward
    if (minDistance > 3.0) {
      reward += this.params.safeDistanceReward;
    }

    // Predictive wait reward
    const enemyApproaching = minDistance < this.prevMinDistance && minDistance <= 3.0;
    this.prevMinDistance = minDistance;
    if (this.stats.step > 0 && this.agentPos.toString() === this.getPreviousPos().toString() && enemyApproaching) {
      reward += this.params.predictiveWaitReward;
      Logger.log(`Predictive wait rewarded at ${JSON.stringify(this.agentPos)}, enemy approaching, distance: ${minDistance}`);
    }

    // Exploration bonus
    const tileKey = this.agentPos.toString();
    if (!this.visitedTiles.has(tileKey)) {
      this.visitedTiles.add(tileKey);
      reward += this.params.explorationBonus;
    }

    return reward;
  }

  getPreviousPos() {
    return this.agentPos; // Placeholder; enhance with history if required
  }

  simulateStep() {
    this.updateEnemies();
    const detected = this.isDetected();
    if (detected && this.grid[this.agentPos[0]][this.agentPos[1]] !== 'C') {
      this.totalExposures++;
      this.stats.exposures = this.totalExposures;
      Logger.log(`Exposure detected at ${JSON.stringify(this.agentPos)}, resetting to [0,0]`);
      const state = this.getState();
      const action = this.chooseAction(state);
      const reward = this.calculateReward();
      const newState = this.getState();
      this.updateQTable(state, action, reward, newState);
      const resetResult = this.resetSimulation();
      this.agentPos = [0, 0];
      Logger.log(`Reset to position ${JSON.stringify(this.agentPos)}, episode ${this.stats.episode}`);
      return { ...resetResult, agentPos: this.agentPos, done: false, reward, running: true };
    }

    const state = this.getState();
    const action = this.chooseAction(state);
    const newPos = [...this.agentPos];
    if (action === 'up') newPos[0]--;
    else if (action === 'down') newPos[0]++;
    else if (action === 'left') newPos[1]--;
    else if (action === 'right') newPos[1]++;
    else if (action === 'wait') {
      // No movement for wait action
    }

    let reward = this.calculateReward();
    let done = false;
    if (action !== 'wait' && (newPos[0] < 0 || newPos[0] >= this.grid.length || newPos[1] < 0 || newPos[1] >= this.grid[0].length || this.grid[newPos[0]][newPos[1]] === 'W')) {
      newPos[0] = this.agentPos[0];
      newPos[1] = this.agentPos[1];
      reward = -1;
    } else {
      this.agentPos = newPos;
      if (this.grid[newPos[0]][newPos[1]] === 'C') this.stats.coverUses++;
      if (newPos[0] === this.goalPos[0] && newPos[1] === this.goalPos[1] && !this.returning) {
        this.returning = true;
        reward = 50;
      }
      if (newPos[0] === 0 && newPos[1] === 0 && this.returning) {
        reward = 100;
        done = true;
        this.saveModel();
      }
    }

    this.stats.step++;
    this.stats.reward = reward;
    this.stats.totalReward += reward;
    const newState = this.getState();
    this.updateQTable(state, action, reward, newState);
    this.params.epsilon = Math.max(this.params.epsilon * this.params.epsilonDecay, this.params.minEpsilon);
    return {
      agentPos: this.agentPos,
      path: [this.agentPos],
      done,
      reward,
      running: true
    };
  }

  chooseAction(state) {
    if (Math.random() < this.params.epsilon) {
      return this.actions[Math.floor(Math.random() * this.actions.length)];
    }

    const qValues = this.qTable[state] || this.actions.reduce((acc, a) => ({ ...acc, [a]: 0 }), {});
    let bestAction = Object.keys(qValues).reduce((a, b) => qValues[a] > qValues[b] ? a : b);

    const minDistance = this.getMinDistanceToEnemy();
    if (minDistance <= 3.0) {
      const actionScores = {};
      this.actions.forEach(action => {
        const newPos = [...this.agentPos];
        if (action === 'up') newPos[0]--;
        else if (action === 'down') newPos[0]++;
        else if (action === 'left') newPos[1]--;
        else if (action === 'right') newPos[1]++;
        else if (action === 'wait') {
          actionScores[action] = qValues[action] + 0.1;
          return;
        }

        if (newPos[0] < 0 || newPos[0] >= this.grid.length || newPos[1] < 0 || newPos[1] >= this.grid[0].length || this.grid[newPos[0]][newPos[1]] === 'W') {
          actionScores[action] = qValues[action] - 1;
          return;
        }

        let minDist = Infinity;
        this.enemies.forEach(enemy => {
          const dx = newPos[0] - enemy.pos[0];
          const dy = newPos[1] - enemy.pos[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          minDist = Math.min(minDist, dist);
        });
        actionScores[action] = qValues[action] + (minDist > minDistance ? 0.1 : -0.1);
      });
      bestAction = Object.keys(actionScores).reduce((a, b) => actionScores[a] > actionScores[b] ? a : b);
      Logger.log(`Heuristic applied: Chose ${bestAction} with scores ${JSON.stringify(actionScores)}`);
    }

    return bestAction;
  }

  updateQTable(state, action, reward, newState) {
    if (!this.qTable[state]) this.qTable[state] = this.actions.reduce((acc, a) => ({ ...acc, [a]: 0 }), {});
    if (!this.qTable[newState]) this.qTable[newState] = this.actions.reduce((acc, a) => ({ ...acc, [a]: 0 }), {});
    const q = this.qTable[state][action];
    const maxQ = Math.max(...Object.values(this.qTable[newState]));
    this.qTable[state][action] = q + this.params.alpha * (reward + this.params.gamma * maxQ - q);
  }

  resetSimulation() {
    this.agentPos = [0, 0];
    this.returning = false;
    this.enemies.forEach(enemy => { enemy.phase = 0; enemy.pos = enemy.path[0]; enemy.facing = 'right'; });
    this.stats = { ...this.stats, episode: this.stats.episode + 1, step: 0, reward: 0, coverUses: 0 };
    this.riskExposure = 0;
    this.coverStreak = 0;
    this.visitedTiles.clear();
    this.visitedTiles.add(this.agentPos.toString());
    this.prevMinDistance = this.getMinDistanceToEnemy();
    this.prevDistance = null;
    Logger.log(`Reset to episode ${this.stats.episode}`);
    return { agentPos: this.agentPos, path: [this.agentPos] };
  }

  updateParams(newParams) {
    this.params = { ...this.params, ...newParams };
    Logger.log(`Updated parameters: ${JSON.stringify(this.params)}`);
  }

  getMetrics() {
    return {
      episode: this.stats.episode,
      step: this.stats.step,
      reward: this.stats.reward.toFixed(1),
      totalReward: this.stats.totalReward.toFixed(1),
      explorationRate: this.params.epsilon.toFixed(3),
      coverUses: this.stats.coverUses,
      exposures: this.stats.exposures
    };
  }

  saveModel() {
    try {
      const modelData = {
        qTable: this.qTable,
        epsilon: this.params.epsilon,
        riskExposure: this.riskExposure,
        visitedTiles: Array.from(this.visitedTiles)
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(modelData));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "gridworld_model.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      Logger.log("Model saved as gridworld_model.json");
    } catch (e) {
      Logger.error(`Failed to save model: ${e.message}`);
    }
  }

  loadModelFromFile(file) {
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const modelData = JSON.parse(event.target.result);
        this.qTable = modelData.qTable;
        this.params.epsilon = modelData.epsilon || this.params.minEpsilon;
        this.riskExposure = modelData.riskExposure || 0;
        this.visitedTiles = new Set(modelData.visitedTiles || [this.agentPos.toString()]);
        Logger.log("Model loaded from file, epsilon set to " + this.params.epsilon);
      };
      reader.onerror = () => Logger.error("Failed to read model file");
      reader.readAsText(file);
      return true;
    } catch (e) {
      Logger.error(`Failed to load model from file: ${e.message}`);
      return false;
    }
  }

  clearModel() {
    try {
      this.qTable = {};
      this.params.epsilon = 1.0;
      this.riskExposure = 0;
      this.visitedTiles.clear();
      this.visitedTiles.add(this.agentPos.toString());
      this.stats.episode = 1;
      Logger.log("Model cleared, starting fresh training");
    } catch (e) {
      Logger.error(`Failed to clear model: ${e.message}`);
    }
  }
}