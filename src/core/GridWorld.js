import { Logger } from '../utils/Logger.js';

export class GridWorld {
  constructor(app) {
    Logger.log("Initializing GridWorld core");
    this.app = app; // Reference to GridWorldApp for losDisplayMode
    this.grid = this.createGrid();
    this.agentPos = [0, 0];
    this.goalPos = [14, 14];
    this.returning = false;
    const originalPaths = [
      [[2, 6], [2, 7], [2, 10], [2, 12], [2, 10]],
      [[5, 3], [7, 3], [9, 3], [7, 3], [5, 3]],
      [[8, 8], [10, 10], [12, 12], [10, 10], [8, 8]],
      [[11, 10], [13, 12], [11, 14], [9, 12], [11, 10]],
      [[3, 12], [5, 14], [7, 12], [5, 10], [3, 12]]
    ];
    this.enemies = originalPaths.map((path, i) => ({
      pos: path[0],
      path: this.interpolatePath(path),
      phase: 0,
      facing: 'right'
    }));
    this.qTable = {};
    this.stats = { episode: 1, step: 0, reward: 0, totalReward: 0, coverUses: 0, exposures: 0, successes: 0, stagnationEvents: 0, lastDetectedStep: 0 };
    this.actions = ['up', 'down', 'left', 'right', 'wait'];
    this.params = {
      alpha: 0.5,
      gamma: 0.8,
      epsilon: 0.5,
      epsilonDecay: 0.999,
      minEpsilon: 0.01,
      timePenalty: -0.1,
      forwardReward: 1.0,
      enemyRadius: 1.5,
      proximityWeight: 3.0,
      riskExposureWeight: 1.5,
      safeDistanceReward: 0.2,
      coverStreakBonus: 0.1,
      explorationBonus: 0.2,
      predictiveWaitReward: 0.02,
      stealthReward: 0.1,
      detectionPenalty: -10.0,
      losRange: 4,
      stagnationPenalty: -1.0
    };
    this.losCache = this.precomputeLOSCache();
    this.totalExposures = 0;
    this.riskExposure = 0;
    this.coverStreak = 0;
    this.visitedTiles = new Set();
    this.visitedTiles.add(this.agentPos.toString());
    this.prevMinDistance = this.getMinDistanceToEnemy();
    this.prevDistance = null;
    this.positionHistory = [this.agentPos.toString()];
    Logger.log("GridWorld initialized with interpolated enemy paths");
  }

  isValidPosition(pos) {
    const [x, y] = pos;
    return (
      x >= 0 &&
      x < this.grid.length &&
      y >= 0 &&
      y < this.grid[0].length &&
      this.grid[x][y] !== 'W'
    );
  }

  validateState() {
    try {
      if (!this.grid || !this.grid[0]) {
        Logger.error("Grid is undefined or empty");
        return false;
      }
      if (!this.isValidPosition(this.agentPos)) {
        Logger.error(`Invalid agent position: ${JSON.stringify(this.agentPos)}`);
        return false;
      }
      for (const enemy of this.enemies) {
        if (!enemy.pos || !this.isValidPosition(enemy.pos)) {
          Logger.error(`Invalid enemy position: ${JSON.stringify(enemy.pos)}`);
          return false;
        }
        if (!enemy.path || enemy.path.length === 0) {
          Logger.error(`Invalid enemy path for enemy at ${JSON.stringify(enemy.pos)}`);
          return false;
        }
      }
      return true;
    } catch (e) {
      Logger.error(`Error in validateState: ${e.message}`);
      return false;
    }
  }

  interpolatePath(originalPath) {
    try {
      const newPath = [];
      for (let i = 0; i < originalPath.length; i++) {
        const start = originalPath[i];
        const end = originalPath[(i + 1) % originalPath.length];
        if (!this.isValidPosition(start) || !this.isValidPosition(end)) {
          Logger.log(`Invalid path position: start=${start}, end=${end}`);
          continue;
        }
        newPath.push(start);
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps > 1) {
          for (let j = 1; j < steps; j++) {
            const t = j / steps;
            const x = Math.round(start[0] + t * dx);
            const y = Math.round(start[1] + t * dy);
            if (this.isValidPosition([x, y])) {
              newPath.push([x, y]);
            } else {
              Logger.log(`Skipping invalid interpolated position: [${x},${y}]`);
            }
          }
        }
      }
      if (newPath.length === 0) {
        Logger.error("Empty path generated, using first valid position");
        return [originalPath[0]];
      }
      Logger.log(`Interpolated path: ${JSON.stringify(newPath)}`);
      return newPath;
    } catch (e) {
      Logger.error(`Error in interpolatePath: ${e.message}`);
      return [originalPath[0]];
    }
  }

  createGrid() {
    const map = [
      "S..C.............",
      "...C.W..W...C....",
      "W..C.W..W...C....",
      ".....C...........",
      "....W.C......W...",
      "C...W....W...C...",
      ".................",
      "C............W...",
      ".........C...W...",
      "....C....C.......",
      "....C....W...C...",
      ".........W...C...",
      "....W....W...W...",
      "....W....W...W...",
      "................G"
    ].map(row => row.padEnd(15, '.').split(''));
    return map;
  }

  precomputeLOSCache() {
    try {
      const cache = {};
      for (let x = 0; x < this.grid.length; x++) {
        for (let y = 0; y < this.grid[0].length; y++) {
          cache[`${x},${y}`] = {
            right: this.computeLOS(x, y, 'right', 'line'),
            left: this.computeLOS(x, y, 'left', 'line'),
            down: this.computeLOS(x, y, 'down', 'line'),
            up: this.computeLOS(x, y, 'up', 'line'),
            radius: this.computeLOS(x, y, null, 'radius')
          };
        }
      }
      Logger.log("LOS cache precomputed for all positions");
      return cache;
    } catch (e) {
      Logger.error(`Error in precomputeLOSCache: ${e.message}`);
      return {};
    }
  }

  computeLOS(x, y, facing, mode) {
    try {
      const los = [];
      const range = mode === 'radius' ? this.params.enemyRadius : this.params.losRange;
      const effectiveRange = this.grid[x][y] === 'C' ? range / 2 : range;

      if (mode === 'radius') {
        // Circular LOS: all tiles within enemyRadius
        const radiusSquared = effectiveRange * effectiveRange;
        const gridHeight = this.grid.length;
        const gridWidth = this.grid[0].length;
        for (let i = Math.max(0, x - Math.ceil(effectiveRange)); i <= Math.min(gridHeight - 1, x + Math.ceil(effectiveRange)); i++) {
          for (let j = Math.max(0, y - Math.ceil(effectiveRange)); j <= Math.min(gridWidth - 1, y + Math.ceil(effectiveRange)); j++) {
            if (i === x && j === y) continue;
            const dx = i - x;
            const dy = j - y;
            if (dx * dx + dy * dy <= radiusSquared && this.grid[i][j] !== 'W') {
              los.push([i, j]);
            }
          }
        }
      } else if (mode === 'line') {
        // Directional LOS: tiles in facing direction up to losRange
        if (facing === 'right') {
          for (let j = 1; j <= effectiveRange && y + j < this.grid[0].length; j++) {
            if (this.grid[x][y + j] === 'W') break;
            los.push([x, y + j]);
          }
        } else if (facing === 'left') {
          for (let j = 1; j <= effectiveRange && y - j >= 0; j++) {
            if (this.grid[x][y - j] === 'W') break;
            los.push([x, y - j]);
          }
        } else if (facing === 'down') {
          for (let i = 1; i <= effectiveRange && x + i < this.grid.length; i++) {
            if (this.grid[x + i][y] === 'W') break;
            los.push([x + i, y]);
          }
        } else if (facing === 'up') {
          for (let i = 1; i <= effectiveRange && x - i >= 0; i++) {
            if (this.grid[x - i][y] === 'W') break;
            los.push([x - i, y]);
          }
        }
      }
      return los;
    } catch (e) {
      Logger.error(`Error in computeLOS: ${e.message}`);
      return [];
    }
  }

  updateEnemies() {
    try {
      this.enemies.forEach(enemy => {
        let nextPhase = (enemy.phase + 1) % enemy.path.length;
        let nextPos = enemy.path[nextPhase];
        if (!this.isValidPosition(nextPos)) {
          Logger.log(`Enemy at ${enemy.pos} attempted to move to invalid position ${nextPos}, skipping`);
          nextPhase = (nextPhase + 1) % enemy.path.length;
          nextPos = enemy.path[nextPhase];
          if (!this.isValidPosition(nextPos)) {
            Logger.error(`No valid next position for enemy at ${enemy.pos}, resetting phase`);
            nextPhase = 0;
            nextPos = enemy.path[0];
          }
        }
        enemy.phase = nextPhase;
        enemy.pos = nextPos;
        enemy.facing = this.getFacing(enemy);
        Logger.log(`Enemy at ${enemy.pos} facing ${enemy.facing}`);
      });
    } catch (e) {
      Logger.error(`Error in updateEnemies: ${e.message}`);
    }
  }

  getFacing(enemy) {
    try {
      const curr = enemy.pos;
      const nextPhase = (enemy.phase + 1) % enemy.path.length;
      const next = enemy.path[nextPhase];
      if (next[1] > curr[1]) return 'right';
      if (next[1] < curr[1]) return 'left';
      if (next[0] > curr[0]) return 'down';
      if (next[0] < curr[0]) return 'up';
      return enemy.facing;
    } catch (e) {
      Logger.error(`Error in getFacing: ${e.message}`);
      return enemy.facing;
    }
  }

  isDetected() {
    try {
      if (!this.validateState()) {
        Logger.error("Invalid state in isDetected, skipping detection");
        return false;
      }
      const losDisplayMode = this.app ? this.app.getLOSDisplayMode() : 'radius';
      if (losDisplayMode === 'none') {
        Logger.log("Detection disabled (LOS mode: none)");
        return false;
      }
      const isInCover = this.grid[this.agentPos[0]][this.agentPos[1]] === 'C';
      if (isInCover) {
        Logger.log(`Agent at ${JSON.stringify(this.agentPos)} is in cover, not detected`);
        return false;
      }

      for (const enemy of this.enemies) {
        if (!enemy.pos || !enemy.facing) {
          Logger.error(`Invalid enemy state: ${JSON.stringify(enemy)}`);
          continue;
        }
        const [ex, ey] = enemy.pos;
        const dx = this.agentPos[0] - ex;
        const dy = this.agentPos[1] - ey;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (losDisplayMode === 'radius') {
          // Circular detection based on enemyRadius
          if (distance <= this.params.enemyRadius) {
            const losTiles = this.losCache[`${ex},${ey}`]?.radius || [];
            const inLOS = losTiles.some(([lx, ly]) => lx === this.agentPos[0] && ly === this.agentPos[1]);
            if (inLOS) {
              Logger.log(`Agent detected at ${JSON.stringify(this.agentPos)} by enemy at ${JSON.stringify(enemy.pos)} in radius mode, distance: ${distance.toFixed(2)}`);
              return true;
            }
          }
        } else if (losDisplayMode === 'line') {
          // Directional detection based on facing and losRange
          const losTiles = this.losCache[`${ex},${ey}`]?.[enemy.facing] || [];
          const inLOS = losTiles.some(([lx, ly]) => lx === this.agentPos[0] && ly === this.agentPos[1]);
          if (inLOS && distance <= this.params.losRange) {
            Logger.log(`Agent detected at ${JSON.stringify(this.agentPos)} by enemy at ${JSON.stringify(enemy.pos)} in line mode, facing: ${enemy.facing}, distance: ${distance.toFixed(2)}`);
            return true;
          }
        }
        Logger.log(`Agent at ${JSON.stringify(this.agentPos)} not detected by enemy at ${JSON.stringify(enemy.pos)}, mode: ${losDisplayMode}, distance: ${distance.toFixed(2)}, inCover: ${isInCover}`);
      }
      return false;
    } catch (e) {
      Logger.error(`Error in isDetected: ${e.message}`);
      return false;
    }
  }

  isAtRiskOfDetection() {
    try {
      for (const enemy of this.enemies) {
        const dx = this.agentPos[0] - enemy.pos[0];
        const dy = this.agentPos[1] - enemy.pos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= 1.5 && this.grid[this.agentPos[0]][this.agentPos[1]] !== 'C') {
          return true;
        }
      }
      return false;
    } catch (e) {
      Logger.error(`Error in isAtRiskOfDetection: ${e.message}`);
      return false;
    }
  }

  getMinDistanceToEnemy() {
    try {
      let minDistance = Infinity;
      for (const enemy of this.enemies) {
        const dx = this.agentPos[0] - enemy.pos[0];
        const dy = this.agentPos[1] - enemy.pos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        minDistance = Math.min(minDistance, distance);
      }
      return Math.max(0.1, minDistance);
    } catch (e) {
      Logger.error(`Error in getMinDistanceToEnemy: ${e.message}`);
      return Infinity;
    }
  }

  getClosestEnemyInfo() {
    try {
      let closest = { dist: Infinity, pos: null };
      for (const enemy of this.enemies) {
        const dx = this.agentPos[0] - enemy.pos[0];
        const dy = this.agentPos[1] - enemy.pos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < closest.dist) {
          closest = { dist: distance, pos: enemy.pos };
        }
      }
      return closest;
    } catch (e) {
      Logger.error(`Error in getClosestEnemyInfo: ${e.message}`);
      return { dist: Infinity, pos: null };
    }
  }

  getRiskExposure() {
    try {
      let exposureCount = 0;
      for (const enemy of this.enemies) {
        const dx = this.agentPos[0] - enemy.pos[0];
        const dy = this.agentPos[1] - enemy.pos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= 3.0) exposureCount++;
      }
      return exposureCount;
    } catch (e) {
      Logger.error(`Error in getRiskExposure: ${e.message}`);
      return 0;
    }
  }

  getGoalDistance(pos) {
    try {
      const target = this.returning ? [0, 0] : [14, 14];
      return Math.abs(pos[0] - target[0]) + Math.abs(pos[1] - target[1]);
    } catch (e) {
      Logger.error(`Error in getGoalDistance: ${e.message}`);
      return Infinity;
    }
  }

  discretizeDistance(distance) {
    // Bucket distances: near (<3), mid (3-6), far (>6)
    if (distance < 3) return 0; // near
    if (distance <= 6) return 1; // mid
    return 2; // far
  }

  getState() {
    try {
      const minEnemyDistance = this.getMinDistanceToEnemy();
      const inCover = this.grid[this.agentPos[0]][this.agentPos[1]] === 'C' ? 1 : 0;
      const distanceBucket = this.discretizeDistance(minEnemyDistance);
      const missionPhase = this.returning ? 1 : 0;
      // Compact state key: agentX_agentY_inCover_distanceBucket_missionPhase
      const state = `${this.agentPos[0]}_${this.agentPos[1]}_${inCover}_${distanceBucket}_${missionPhase}`;
      Logger.log(`State: ${state} (agentPos=${JSON.stringify(this.agentPos)}, inCover=${inCover}, minEnemyDistance=${minEnemyDistance.toFixed(1)}, bucket=${distanceBucket}, returning=${this.returning})`);
      return state;
    } catch (e) {
      Logger.error(`Error in getState: ${e.message}`);
      return "0_0_0_2_0"; // Default to starting position, far distance, going to goal
    }
  }

  calculateReward() {
    try {
      let reward = this.params.timePenalty;
      const [x, y] = this.agentPos;
      const target = this.returning ? [0, 0] : [14, 14];
      const prevDistance = this.prevDistance || this.getGoalDistance(this.agentPos);
      const newDistance = this.getGoalDistance(this.agentPos);
      this.prevDistance = newDistance;

      const minDistance = this.getMinDistanceToEnemy();
      if (newDistance < prevDistance) {
        let forwardReward = this.params.forwardReward * (10 / Math.max(1, newDistance));
        forwardReward = Math.min(forwardReward, 2.0);
        if (this.grid[x][y] === 'C') {
          forwardReward += 0.5;
          Logger.log(`Cover progress at ${this.agentPos}, bonus: +0.5`);
        } else if (minDistance <= 3.0) {
          forwardReward *= 0.7;
        }
        reward += forwardReward;
        Logger.log(`Progress: Distance to goal decreased from ${prevDistance.toFixed(2)} to ${newDistance.toFixed(2)}, forwardReward: ${forwardReward.toFixed(2)}`);
      }

      if (this.grid[x][y] === 'C') {
        reward += 0.1;
        this.coverStreak = Math.min(this.coverStreak + 1, 3);
        reward += this.coverStreak * this.params.coverStreakBonus;
        Logger.log(`In cover at ${this.agentPos}, reward: +0.1, streak: ${this.coverStreak}, bonus: ${this.coverStreak * this.params.coverStreakBonus}`);
        this.stats.coverUses++;
        if (minDistance <= 3.0) {
          reward += 0.5;
          Logger.log(`Strategic cover use at ${this.agentPos}, minDistance: ${minDistance.toFixed(2)}, bonus: +0.5`);
        }
      } else {
        this.coverStreak = 0;
      }

      if ((x === this.goalPos[0] && y === this.goalPos[1] && !this.returning) ||
          (x === 0 && y === 0 && this.returning)) {
        reward += 100;
        this.riskExposure = 0;
        this.coverStreak = 0;
        this.positionHistory = [this.agentPos.toString()];
        if (x === 0 && y === 0 && this.returning) {
          this.stats.successes++;
        }
        Logger.log(`Reached ${this.returning ? 'start' : 'goal'} at ${this.agentPos}, reward: +100, successes: ${this.stats.successes}`);
      }

      const proximityPenalty = this.params.proximityWeight / Math.max(0.1, minDistance);
      reward -= proximityPenalty;
      Logger.log(`Proximity penalty: ${proximityPenalty.toFixed(2)} (weight: ${this.params.proximityWeight}, minDistance: ${minDistance.toFixed(2)})`);

      const exposureCount = this.getRiskExposure();
      if (exposureCount > 0) {
        this.riskExposure += exposureCount * 0.1;
        reward -= this.params.riskExposureWeight * this.riskExposure;
        Logger.log(`Exposure risk at ${this.agentPos}, count: ${exposureCount}, penalty: ${this.params.riskExposureWeight * this.riskExposure} (weight: ${this.params.riskExposureWeight})`);
      } else {
        this.riskExposure = 0;
        reward += this.params.stealthReward;
        Logger.log(`Stealth maintained at ${this.agentPos}, reward: +${this.params.stealthReward}`);
      }

      if (minDistance > 3.0) {
        reward += this.params.safeDistanceReward;
        Logger.log(`Safe distance reward: +${this.params.safeDistanceReward}`);
      }

      const enemyApproaching = minDistance < this.prevMinDistance && minDistance <= 3.0;
      this.prevMinDistance = minDistance;
      if (this.stats.step > 0 && this.agentPos.toString() === this.getPreviousPos().toString() && enemyApproaching) {
        reward += this.params.predictiveWaitReward;
        Logger.log(`Predictive wait at ${this.agentPos}, enemy approaching, distance: ${minDistance}, reward: +${this.params.predictiveWaitReward}`);
      }

      const tileKey = this.agentPos.toString();
      if (!this.visitedTiles.has(tileKey)) {
        this.visitedTiles.add(tileKey);
        reward += this.params.explorationBonus;
        Logger.log(`Explored new tile ${tileKey}, reward: +${this.params.explorationBonus}`);
      }

      if (this.positionHistory.length >= 2 && this.positionHistory.slice(-2).every(pos => pos === tileKey)) {
        reward += this.params.stagnationPenalty;
        this.stats.stagnationEvents++;
        Logger.log(`Stagnation penalty at ${this.agentPos}, steps: ${this.positionHistory.length}, penalty: ${this.params.stagnationPenalty}, stagnationEvents: ${this.stats.stagnationEvents}`);
      }

      Logger.log(`Reward breakdown: time=${this.params.timePenalty}, progress=${newDistance < prevDistance ? reward - this.params.timePenalty : 0}, proximity=-${proximityPenalty.toFixed(2)}, exposure=${exposureCount > 0 ? -this.params.riskExposureWeight * this.riskExposure : 0}, cover=${this.grid[x][y] === 'C' ? 0.1 + this.coverStreak * this.params.coverStreakBonus + (minDistance <= 3.0 ? 0.5 : 0) : 0}, stealth=${exposureCount === 0 ? this.params.stealthReward : 0}, safeDistance=${minDistance > 3.0 ? this.params.safeDistanceReward : 0}, stagnation=${this.positionHistory.slice(-2).every(pos => pos === tileKey) ? this.params.stagnationPenalty : 0}, total=${reward.toFixed(2)}`);
      return reward;
    } catch (e) {
      Logger.error(`Error in calculateReward: ${e.message}`);
      return this.params.timePenalty;
    }
  }

  getPreviousPos() {
    return this.positionHistory.length > 1 ? this.positionHistory[this.positionHistory.length - 2].split(',').map(Number) : this.agentPos;
  }

  resetOnDetection(reward) {
    try {
      this.totalExposures++;
      this.stats.exposures = this.totalExposures;
      this.stats.lastDetectedStep = this.stats.step;
      reward += this.params.detectionPenalty;
      Logger.log(`Pre-reset: agentPos=${JSON.stringify(this.agentPos)}`);
      Logger.log(`Exposure detected at ${JSON.stringify(this.agentPos)}, penalty: ${this.params.detectionPenalty}, resetting to start for episode ${this.stats.episode + 1}, exposures: ${this.stats.exposures}`);
      this.agentPos = [0, 0];
      this.stats.episode++;
      this.stats.step = 0;
      this.stats.reward = 0;
      this.stats.totalReward = 0;
      this.coverStreak = 0;
      this.riskExposure = 0;
      this.visitedTiles = new Set([this.agentPos.toString()]);
      this.prevMinDistance = this.getMinDistanceToEnemy();
      this.prevDistance = null;
      this.positionHistory = [this.agentPos.toString()];
      this.returning = false;
      this.enemies.forEach(enemy => {
        enemy.phase = 0;
        enemy.pos = this.isValidPosition(enemy.path[0]) ? enemy.path[0] : [0, 0];
        enemy.facing = 'right';
      });
      this.params.epsilon = Math.min(this.params.epsilon + 0.1, 0.8);
      Logger.log(`Post-reset: agentPos=${JSON.stringify(this.agentPos)}, episode: ${this.stats.episode}, epsilon: ${this.params.epsilon.toFixed(3)}, exposures: ${this.stats.exposures}`);
      if (!this.validateState()) {
        Logger.error(`Invalid state after reset, forcing agentPos=[0,0]`);
        this.agentPos = [0, 0];
      }
    } catch (e) {
      Logger.error(`Error in resetOnDetection: ${e.message}`);
      this.agentPos = [0, 0];
    }
  }

  getResetReturnObj(reward) {
    const returnObj = {
      agentPos: this.agentPos,
      path: [this.agentPos],
      done: false,
      reward,
      running: true,
      detected: true,
      resetFlag: true,
      exposures: this.stats.exposures
    };
    Logger.log(`UI receiving detected: true, glowDuration: ${returnObj.glowDuration || 500}, exposures: ${returnObj.exposures}`);
    Logger.log(`Returning: ${JSON.stringify(returnObj)}`);
    return returnObj;
  }

  simulateStep() {
    try {
      if (!this.validateState()) {
        Logger.error("Invalid state at start of simulateStep, forcing reset");
        this.agentPos = [0, 0];
        this.returning = false;
        this.visitedTiles = new Set([this.agentPos.toString()]);
        this.positionHistory = [this.agentPos.toString()];
        Logger.log(`Forced reset: agentPos=${JSON.stringify(this.agentPos)}`);
        return { agentPos: this.agentPos, path: [this.agentPos], done: true, reward: 0, running: true, detected: false, resetFlag: true, exposures: this.stats.exposures };
      }

      let reward = this.calculateReward();
      const initialDetected = this.isDetected();
      Logger.log(`Initial detected: ${initialDetected}`);

      if (initialDetected) {
        Logger.log(`Detection confirmed, resetting`);
        this.resetOnDetection(reward);
        return this.getResetReturnObj(reward);
      }

      this.updateEnemies();

      if (this.stats.step >= 100) {
        Logger.log(`Step limit (100) reached at step ${this.stats.step}, resetting episode ${this.stats.episode + 1}`);
        this.agentPos = [0, 0];
        this.stats.episode++;
        this.stats.step = 0;
        this.stats.reward = 0;
        this.stats.totalReward = 0;
        this.coverStreak = 0;
        this.riskExposure = 0;
        this.visitedTiles = new Set([this.agentPos.toString()]);
        this.prevMinDistance = this.getMinDistanceToEnemy();
        this.prevDistance = null;
        this.positionHistory = [this.agentPos.toString()];
        this.returning = false;
        this.enemies.forEach(enemy => {
          enemy.phase = 0;
          enemy.pos = this.isValidPosition(enemy.path[0]) ? enemy.path[0] : [0, 0];
          enemy.facing = 'right';
        });
        Logger.log(`Episode reset to start, agentPos=${JSON.stringify(this.agentPos)}`);
        const returnObj = {
          agentPos: this.agentPos,
          path: [this.agentPos],
          done: true,
          reward,
          running: true,
          detected: false,
          resetFlag: true,
          exposures: this.stats.exposures
        };
        Logger.log(`Returning: ${JSON.stringify(returnObj)}`);
        return returnObj;
      }

      const state = this.getState();
      const action = this.chooseAction(state);
      let newPos = [...this.agentPos];
      let done = false;

      if (action === 'up') newPos[0]--;
      else if (action === 'down') newPos[0]++;
      else if (action === 'left') newPos[1]--;
      else if (action === 'right') newPos[1]++;
      else if (action === 'wait') {
      }

      if (action !== 'wait' && (newPos[0] < 0 || newPos[0] >= this.grid.length || newPos[1] < 0 || newPos[1] >= this.grid[0].length || this.grid[newPos[0]][newPos[1]] === 'W')) {
        newPos[0] = this.agentPos[0];
        newPos[1] = this.agentPos[1];
        reward = -1;
        Logger.log(`Invalid move attempted: ${action}, staying at ${this.agentPos}`);
      } else {
        this.agentPos = newPos;
        this.positionHistory.push(this.agentPos.toString());
        if (this.positionHistory.length > 3) this.positionHistory.shift();
        if (this.grid[newPos[0]][newPos[1]] === 'C') this.stats.coverUses++;
        if (newPos[0] === this.goalPos[0] && newPos[1] === this.goalPos[1] && !this.returning) {
          this.returning = true;
          reward = 150;
          this.positionHistory = [this.agentPos.toString()];
          Logger.log(`Reached goal at ${this.agentPos}, reward: +150 (total: +250), now returning`);
        }
        if (newPos[0] === 0 && newPos[1] === 0 && this.returning) {
          reward = 400;
          done = true;
          this.stats.episode++;
          this.stats.step = 0;
          this.stats.reward = 0;
          this.stats.totalReward = 0;
          this.coverStreak = 0;
          this.riskExposure = 0;
          this.visitedTiles = new Set([this.agentPos.toString()]);
          this.prevMinDistance = this.getMinDistanceToEnemy();
          this.prevDistance = null;
          this.positionHistory = [this.agentPos.toString()];
          this.agentPos = [0, 0];
          this.returning = false;
          this.enemies.forEach(enemy => {
            enemy.phase = 0;
            enemy.pos = this.isValidPosition(enemy.path[0]) ? enemy.path[0] : [0, 0];
            enemy.facing = 'right';
          });
          this.saveModel();
          Logger.log(`Completed mission, returned to start, reward: +400 (total: +500), episode: ${this.stats.episode}, successes: ${this.stats.successes}`);
        }
      }

      reward = this.calculateReward();
      this.stats.step++;
      this.stats.reward = reward;
      this.stats.totalReward += reward;
      const newState = this.getState();
      this.updateQTable(state, action, reward, newState);
      this.params.epsilon = Math.max(this.params.epsilon * this.params.epsilonDecay, this.params.minEpsilon);
      if (this.positionHistory.length >= 2 && this.positionHistory.every(pos => pos === this.agentPos.toString())) {
        this.params.epsilon = Math.min(this.params.epsilon + 0.1, 0.8);
        Logger.log(`Epsilon increased to ${this.params.epsilon.toFixed(3)} due to stagnation at ${this.agentPos}`);
      }
      Logger.log(`Step ${this.stats.step}: Action=${action}, Pos=${JSON.stringify(this.agentPos)}, Reward=${reward.toFixed(2)}, Epsilon=${this.params.epsilon.toFixed(3)}, Successes=${this.stats.successes}`);
      const returnObj = {
        agentPos: this.agentPos,
        path: [this.agentPos],
        done,
        reward,
        running: true,
        detected: false,
        resetFlag: false,
        exposures: this.stats.exposures
      };
      Logger.log(`Returning: ${JSON.stringify(returnObj)}`);
      return returnObj;
    } catch (e) {
      Logger.error(`Error in simulateStep: ${e.message}`);
      this.agentPos = [0, 0];
      return { agentPos: this.agentPos, path: [this.agentPos], done: true, reward: 0, running: true, detected: false, resetFlag: true, exposures: this.stats.exposures };
    }
  }

  chooseAction(state) {
    try {
      if (Math.random() < this.params.epsilon) {
        const action = this.actions[Math.floor(Math.random() * this.actions.length)];
        Logger.log(`Exploration: Chose random action ${action} at epsilon ${this.params.epsilon.toFixed(3)} (decay: ${this.params.epsilonDecay}, min: ${this.params.minEpsilon})`);
        return action;
      }

      const qValues = this.qTable[state] || this.actions.reduce((acc, a) => ({ ...acc, [a]: 0.1 + Math.random() * 0.05 }), {});
      let bestAction = Object.keys(qValues).reduce((a, b) => qValues[a] > qValues[b] ? a : b);
      Logger.log(`Exploitation: Chose action ${bestAction} with Q-values ${JSON.stringify(qValues)}`);

      const closestEnemy = this.getClosestEnemyInfo();
      const minDistance = closestEnemy.dist;
      if (minDistance <= 3.0 && this.grid[this.agentPos[0]][this.agentPos[1]] !== 'C') {
        const actionScores = {};
        const currGoalDistance = this.getGoalDistance(this.agentPos);
        this.actions.forEach(action => {
          const newPos = [...this.agentPos];
          if (action === 'up') newPos[0]--;
          else if (action === 'down') newPos[0]++;
          else if (action === 'left') newPos[1]--;
          else if (action === 'right') newPos[1]++;
          else if (action === 'wait') {
            actionScores[action] = qValues[action] + (minDistance < 1.5 ? 0.01 : 0.02);
            return;
          }

          if (newPos[0] < 0 || newPos[0] >= this.grid.length || newPos[1] < 0 || newPos[1] >= this.grid[0].length || this.grid[newPos[0]][newPos[1]] === 'W') {
            actionScores[action] = qValues[action] - 1;
            return;
          }

          const dxCurr = newPos[0] - closestEnemy.pos[0];
          const dyCurr = newPos[1] - closestEnemy.pos[1];
          const distCurr = Math.sqrt(dxCurr * dxCurr + dyCurr * dyCurr);
          const coverBonus = this.grid[newPos[0]][newPos[1]] === 'C' ? 0.2 : 0;
          const distanceScore = distCurr > minDistance ? 0.3 : (minDistance < 1.5 ? -0.3 : 0);
          const newGoalDistance = this.getGoalDistance(newPos);
          const goalScore = currGoalDistance - newGoalDistance > 0 ? 1.5 : -0.2;
          const unexploredBonus = !this.visitedTiles.has(newPos.toString()) ? 0.5 : 0;
          actionScores[action] = qValues[action] + distanceScore + coverBonus + goalScore + unexploredBonus;
        });
        bestAction = Object.keys(actionScores).reduce((a, b) => actionScores[a] > actionScores[b] ? a : b);
        Logger.log(`Avoidance heuristic: Chose ${bestAction} with scores ${JSON.stringify(actionScores)}, closest enemy at ${closestEnemy.pos}, distance: ${minDistance.toFixed(2)}, goalDistance: ${currGoalDistance}`);
      }

      return bestAction;
    } catch (e) {
      Logger.error(`Error in chooseAction: ${e.message}`);
      return this.actions[Math.floor(Math.random() * this.actions.length)];
    }
  }

  updateQTable(state, action, reward, newState) {
    try {
      if (!this.qTable[state]) this.qTable[state] = this.actions.reduce((acc, a) => ({ ...acc, [a]: 0.1 + Math.random() * 0.05 }), {});
      if (!this.qTable[newState]) this.qTable[newState] = this.actions.reduce((acc, a) => ({ ...acc, [a]: 0.1 + Math.random() * 0.05 }), {});
      const q = this.qTable[state][action];
      const maxQ = Math.max(...Object.values(this.qTable[newState]));
      this.qTable[state][action] = q + this.params.alpha * (reward + this.params.gamma * maxQ - q);
      Logger.log(`Q-Table updated: State=${state}, Action=${action}, Reward=${reward.toFixed(2)}, NewQ=${this.qTable[state][action].toFixed(2)}, Alpha=${this.params.alpha}, Gamma=${this.params.gamma}`);
    } catch (e) {
      Logger.error(`Error in updateQTable: ${e.message}`);
    }
  }

  resetSimulation() {
    try {
      Logger.log(`Resetting simulation, episode ${this.stats.episode} continues`);
      this.agentPos = [0, 0];
      this.returning = false;
      this.enemies.forEach(enemy => {
        enemy.phase = 0;
        enemy.pos = this.isValidPosition(enemy.path[0]) ? enemy.path[0] : [0, 0];
        enemy.facing = 'right';
      });
      this.stats = { 
        episode: this.stats.episode, 
        step: 0, 
        reward: 0, 
        totalReward: 0, 
        coverUses: 0, 
        exposures: this.stats.exposures, 
        successes: this.stats.successes, 
        stagnationEvents: this.stats.stagnationEvents, 
        lastDetectedStep: this.stats.lastDetectedStep 
      };
      this.riskExposure = 0;
      this.coverStreak = 0;
      this.visitedTiles = new Set([this.agentPos.toString()]);
      this.prevMinDistance = this.getMinDistanceToEnemy();
      this.prevDistance = null;
      this.positionHistory = [this.agentPos.toString()];
      Logger.log(`Simulation reset, agentPos=${JSON.stringify(this.agentPos)}`);
      return { agentPos: this.agentPos, path: [this.agentPos], resetFlag: true, exposures: this.stats.exposures };
    } catch (e) {
      Logger.error(`Error in resetSimulation: ${e.message}`);
      return { agentPos: this.agentPos, path: [this.agentPos], resetFlag: true, exposures: this.stats.exposures };
    }
  }

  updateParams(newParams) {
    try {
      const validatedParams = {};
      for (const [key, value] of Object.entries(newParams)) {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          Logger.error(`Invalid parameter value for ${key}: ${value}`);
          continue;
        }
        switch (key) {
          case 'alpha':
          case 'gamma':
            validatedParams[key] = Math.max(0, Math.min(1, numValue));
            break;
          case 'epsilon':
            validatedParams[key] = Math.max(0, numValue);
            break;
          case 'epsilonDecay':
            validatedParams[key] = Math.max(0.9, Math.min(1, numValue));
            break;
          case 'minEpsilon':
            validatedParams[key] = Math.max(0, Math.min(0.1, numValue));
            break;
          case 'timePenalty':
          case 'detectionPenalty':
          case 'stagnationPenalty':
            validatedParams[key] = Math.min(0, numValue);
            break;
          case 'forwardReward':
          case 'proximityWeight':
          case 'riskExposureWeight':
          case 'safeDistanceReward':
          case 'coverStreakBonus':
          case 'explorationBonus':
          case 'predictiveWaitReward':
          case 'stealthReward':
          case 'losRange':
            validatedParams[key] = Math.max(0, numValue);
            break;
          case 'enemyRadius':
            validatedParams[key] = Math.max(0.1, numValue);
            break;
          default:
            Logger.error(`Unknown parameter: ${key}`);
            continue;
        }
      }
      this.params = { ...this.params, ...validatedParams };
      // Recompute LOS cache if radius or range changed
      if ('enemyRadius' in validatedParams || 'losRange' in validatedParams) {
        this.losCache = this.precomputeLOSCache();
      }
      Logger.log(`Updated parameters: ${JSON.stringify(validatedParams)}`);
    } catch (e) {
      Logger.error(`Error in updateParams: ${e.message}`);
    }
  }

  getMetrics() {
    try {
      const target = this.returning ? [0, 0] : [14, 14];
      const goalDistance = Math.abs(this.agentPos[0] - target[0]) + Math.abs(this.agentPos[1] - target[1]);
      return {
        episode: this.stats.episode,
        step: this.stats.step,
        reward: this.stats.reward.toFixed(1),
        totalReward: this.stats.totalReward.toFixed(1),
        explorationRate: this.params.epsilon.toFixed(3),
        coverUses: this.stats.coverUses,
        exposures: this.stats.exposures,
        successes: this.stats.successes,
        goalDistance: goalDistance.toFixed(1),
        uniqueTiles: this.visitedTiles.size,
        stagnationEvents: this.stats.stagnationEvents,
        lastDetectedStep: this.stats.lastDetectedStep
      };
    } catch (e) {
      Logger.error(`Error in getMetrics: ${e.message}`);
      return {};
    }
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
      this.params.epsilon = 0.5;
      this.riskExposure = 0;
      this.visitedTiles = new Set([this.agentPos.toString()]);
      this.stats.episode = 1;
      this.stats.successes = 0;
      this.stats.stagnationEvents = 0;
      this.stats.lastDetectedStep = 0;
      Logger.log("Model cleared, starting fresh training");
    } catch (e) {
      Logger.error(`Failed to clear model: ${e.message}`);
    }
  }
}