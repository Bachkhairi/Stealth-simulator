import { GridWorld } from './core/GridWorld.js';
import { SceneManager } from './rendering/SceneManager.js';
import { Logger } from './utils/Logger.js';

export class GridWorldApp {
  constructor() {
    Logger.log("GridWorldApp constructor started at", new Date().toISOString());
    this.world = new GridWorld();
    this.sceneManager = new SceneManager(document.getElementById('canvas'), this.world.grid, this.world.params, this);
    this.losDisplayMode = 'radius';
    this.running = false;
    this.modelLoaded = false;
    this.simulationDelay = 1000;

    this.setupUI();
    Logger.log("GridWorldApp constructor completed at", new Date().toISOString());

    this.sceneManager.createAgent();
    this.sceneManager.renderGrid(this.world.grid);
    this.sceneManager.createEnemies(this.world.enemies);
    this.sceneManager.updateAgent(this.world.agentPos, this.world.grid, this.world.enemies);
    this.checkAgentMovement();
    this.animate();
  }

  setupUI() {
    Logger.log("Setting up UI");
    const controls = document.getElementById('controls');
    if (!controls) {
      Logger.error("Controls element not found in DOM");
      return;
    }
    Logger.log("Controls element found");

    controls.innerHTML = '';
    controls.className = 'w-80 bg-gradient-to-b from-gray-50 to-gray-200 p-4 overflow-y-auto fixed top-0 right-0 h-full shadow-xl border-l border-gray-300 rounded-l-lg';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'mb-6';
    titleDiv.innerHTML = '<h2 class="text-xl font-bold text-gray-900">Stealth Mission Simulator</h2>';
    controls.appendChild(titleDiv);
    Logger.log("Project title added");

    const loadModelDiv = document.createElement('div');
    loadModelDiv.className = 'mb-4';
    loadModelDiv.innerHTML = '<input type="file" id="load-model-input" accept=".json" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100">';
    controls.appendChild(loadModelDiv);
    const loadModelInput = document.getElementById('load-model-input');
    if (loadModelInput) {
      Logger.log("Model load input added");
      loadModelInput.onchange = (event) => {
        if (event.target.files.length > 0) {
          const file = event.target.files[0];
          this.modelLoaded = this.world.loadModelFromFile(file);
          document.getElementById('model-status').textContent = this.modelLoaded ? 'Loaded (Trained)' : 'Training';
          this.sceneManager.updateAgent(this.world.agentPos, this.world.grid, this.world.enemies);
          this.sceneManager.updatePath([this.world.agentPos], this.world.grid);
          this.updateMetrics();
          if (this.running) this.simulationLoop();
        }
      };
    }

    const modelStatusDiv = document.createElement('div');
    modelStatusDiv.className = 'mb-4';
    modelStatusDiv.innerHTML = `
      <h4 class="text-sm font-medium text-gray-700 mb-1">Model Status:</h4>
      <p class="text-sm text-gray-600"><span id="model-status">${this.modelLoaded ? 'Loaded (Trained)' : 'Training'}</span></p>
    `;
    controls.appendChild(modelStatusDiv);
    Logger.log("Model status section added");

    const saveModelDiv = document.createElement('div');
    saveModelDiv.className = 'mb-4';
    saveModelDiv.innerHTML = '<button id="save-model-button" class="bg-green-600 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded transition duration-200">Save Model</button>';
    controls.appendChild(saveModelDiv);
    const saveModelButton = document.getElementById('save-model-button');
    if (saveModelButton) {
      Logger.log("Save Model button added");
      saveModelButton.addEventListener('click', () => {
        Logger.log("Save Model button clicked");
        this.world.saveModel();
      });
    }

    const clearModelDiv = document.createElement('div');
    clearModelDiv.className = 'mb-4';
    clearModelDiv.innerHTML = '<button id="clear-model-button" class="bg-yellow-600 hover:bg-yellow-800 text-white font-semibold py-2 px-4 rounded transition duration-200">Clear Model & Retrain</button>';
    controls.appendChild(clearModelDiv);
    const clearModelButton = document.getElementById('clear-model-button');
    if (clearModelButton) {
      Logger.log("Clear Model button added");
      clearModelButton.addEventListener('click', () => {
        Logger.log("Clear Model button clicked");
        this.world.clearModel();
        this.modelLoaded = false;
        document.getElementById('model-status').textContent = 'Training';
        this.sceneManager.updateAgent(this.world.agentPos, this.world.grid, this.world.enemies);
        this.sceneManager.updatePath([this.world.agentPos], this.world.grid);
        this.updateMetrics();
      });
    }

    const speedDiv = document.createElement('div');
    speedDiv.className = 'mb-4';
    speedDiv.innerHTML = '<h4 class="text-sm font-medium text-gray-700 mb-1">Simulation Speed:</h4>';
    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.className = 'w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer hover:bg-gray-400 transition duration-150';
    speedInput.min = '100';
    speedInput.max = '2000';
    speedInput.step = '100';
    speedInput.value = this.simulationDelay;
    const speedValueDisplay = document.createElement('span');
    speedValueDisplay.className = 'ml-2 text-sm text-gray-600';
    speedValueDisplay.textContent = `${this.simulationDelay}ms`;
    speedInput.addEventListener('input', () => {
      this.simulationDelay = parseInt(speedInput.value);
      speedValueDisplay.textContent = `${this.simulationDelay}ms`;
      Logger.log(`Simulation speed updated to ${this.simulationDelay}ms`);
    });
    speedDiv.appendChild(speedInput);
    speedDiv.appendChild(speedValueDisplay);
    controls.appendChild(speedDiv);
    Logger.log("Simulation speed slider added");

    const exportMetricsDiv = document.createElement('div');
    exportMetricsDiv.className = 'mb-4';
    exportMetricsDiv.innerHTML = '<button id="export-metrics-button" class="bg-purple-600 hover:bg-purple-800 text-white font-semibold py-2 px-4 rounded transition duration-200">Export Metrics as CSV</button>';
    controls.appendChild(exportMetricsDiv);
    const exportMetricsButton = document.getElementById('export-metrics-button');
    if (exportMetricsButton) {
      exportMetricsButton.addEventListener('click', () => {
        Logger.log("Export Metrics button clicked");
        this.exportMetricsAsCSV();
      });
    }
    Logger.log("Export Metrics button added");

    const buttonGroupDiv = document.createElement('div');
    buttonGroupDiv.className = 'flex space-x-2 mb-6';
    buttonGroupDiv.innerHTML = `
      <button id="start-pause-button" class="bg-blue-600 hover:bg-blue-800 text-white font-semibold py-2 px-6 rounded transition duration-200">Start</button>
      <button id="reset-button" class="bg-red-600 hover:bg-red-800 text-white font-semibold py-2 px-6 rounded transition duration-200">Reset</button>
    `;
    controls.appendChild(buttonGroupDiv);
    Logger.log("Button group added");

    const startPauseButton = document.getElementById('start-pause-button');
    const resetButton = document.getElementById('reset-button');
    if (startPauseButton && resetButton) {
      Logger.log("Start/Pause and Reset buttons found");
      startPauseButton.addEventListener('click', () => {
        Logger.log("Start/Pause button clicked");
        this.running = !this.running;
        startPauseButton.textContent = this.running ? 'Pause' : 'Start';
        if (this.running && !this.modelLoaded) this.simulationLoop();
      });
      resetButton.addEventListener('click', () => {
        Logger.log("Reset button clicked");
        const resetResult = this.world.resetSimulation();
        this.sceneManager.updateAgent(resetResult.agentPos, this.world.grid, this.world.enemies);
        this.sceneManager.updatePath(resetResult.path, this.world.grid);
        this.updateMetrics();
        if (this.running && !this.modelLoaded) this.simulationLoop();
      });
    }

    const metricsDiv = document.createElement('div');
    metricsDiv.id = 'metrics';
    metricsDiv.className = 'mb-6';
    metricsDiv.innerHTML = `
      <h3 class="text-lg font-bold mb-2 text-gray-800">Metrics</h3>
      <p class="text-sm text-gray-600"><strong>Episode:</strong> <span id="episode">1/100</span></p>
      <p class="text-sm text-gray-600"><strong>Step:</strong> <span id="step">0/100</span></p>
      <p class="text-sm text-gray-600"><strong>Reward:</strong> <span id="reward">0.0</span></p>
      <p class="text-sm text-gray-600"><strong>Total Reward:</strong> <span id="total-reward">0.0</span></p>
      <p class="text-sm text-gray-600"><strong>Exploration Rate:</strong> <span id="exploration-rate">1.000</span></p>
      <p class="text-sm text-gray-600"><strong>Cover Uses:</strong> <span id="cover-uses">0</span></p>
      <p class="text-sm text-gray-600"><strong>Exposures:</strong> <span id="exposures">0</span></p>
      <p class="text-sm text-gray-600"><strong>Mission Status:</strong> <span id="mission-status">To Goal</span></p>
    `;
    controls.appendChild(metricsDiv);
    Logger.log("Metrics section added");

    const losToggleDiv = document.createElement('div');
    losToggleDiv.className = 'mb-4';
    losToggleDiv.innerHTML = '<h4 class="text-sm font-medium text-gray-700 mb-1">Enemy LOS Display:</h4>';
    const losSelect = document.createElement('select');
    losSelect.className = 'w-full p-2 border border-gray-300 rounded';
    losSelect.innerHTML = `
      <option value="radius" ${this.losDisplayMode === 'radius' ? 'selected' : ''}>Circular Radius</option>
      <option value="line" ${this.losDisplayMode === 'line' ? 'selected' : ''}>Directional Line</option>
      <option value="none" ${this.losDisplayMode === 'none' ? 'selected' : ''}>None</option>
    `;
    losSelect.addEventListener('change', () => {
      this.losDisplayMode = losSelect.value;
      this.sceneManager.createEnemies(this.world.enemies);
      Logger.log(`LOS display mode changed to ${this.losDisplayMode}`);
    });
    losToggleDiv.appendChild(losSelect);
    controls.appendChild(losToggleDiv);
    Logger.log("LOS display toggle added");

    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'mb-6';
    paramsDiv.innerHTML = '<h3 class="text-lg font-bold mb-2 text-gray-800">Agent Parameters</h3>';
    const params = [
      { name: 'alpha', label: 'Learning Rate (α)', min: 0, max: 1, step: 0.01, value: 0.5 },
      { name: 'gamma', label: 'Discount Factor (γ)', min: 0, max: 1, step: 0.01, value: 0.8 },
      { name: 'epsilon', label: 'Exploration Rate (ε)', min: 0, max: 1, step: 0.01, value: 0.5 },
      { name: 'epsilonDecay', label: 'Epsilon Decay', min: 0.9, max: 1, step: 0.001, value: 0.999 },
      { name: 'minEpsilon', label: 'Min Epsilon', min: 0, max: 0.1, step: 0.001, value: 0.01 },
      { name: 'timePenalty', label: 'Time Penalty', min: -1.0, max: 0, step: 0.01, value: -0.1 },
      { name: 'forwardReward', label: 'Forward Reward', min: 0, max: 2.0, step: 0.1, value: 1.0 },
      { name: 'detectionPenalty', label: 'Detection Penalty', min: -20.0, max: 0, step: 1.0, value: -10.0 },
      { name: 'enemyRadius', label: 'Enemy Radius', min: 0.5, max: 5.0, step: 0.1, value: 1.5 },
      { name: 'stealthReward', label: 'Stealth Reward', min: 0, max: 1.0, step: 0.01, value: 0.1 },
      { name: 'coverStreakBonus', label: 'Cover Streak Bonus', min: 0, max: 0.5, step: 0.01, value: 0.1 }
    ];

    params.forEach(param => {
      const label = document.createElement('label');
      label.className = 'block text-sm font-medium text-gray-700 mb-1';
      label.textContent = `${param.label}: `;
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer hover:bg-gray-400 transition duration-150';
      input.min = param.min;
      input.max = param.max;
      input.step = param.step;
      input.value = param.value;
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'ml-2 text-sm text-gray-600';
      valueDisplay.textContent = param.value;
      input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
        const newParams = { [param.name]: parseFloat(input.value) };
        this.world.updateParams(newParams);
        this.sceneManager.updateEnemyRadius(this.world.params.enemyRadius);
        this.sceneManager.createEnemies(this.world.enemies);
        Logger.log(`Parameter ${param.name} updated to ${input.value}`);
      });
      const container = document.createElement('div');
      container.className = 'mb-3';
      container.appendChild(label);
      container.appendChild(input);
      container.appendChild(valueDisplay);
      paramsDiv.appendChild(container);
    });
    controls.appendChild(paramsDiv);
    Logger.log("Parameter sliders added");

    Logger.log("UI setup completed");
  }

  updateMetrics() {
    const metrics = this.world.getMetrics();
    document.getElementById('episode').textContent = `${metrics.episode}/100`;
    document.getElementById('step').textContent = `${metrics.step}/100`;
    document.getElementById('reward').textContent = metrics.reward;
    document.getElementById('total-reward').textContent = metrics.totalReward;
    document.getElementById('exploration-rate').textContent = metrics.explorationRate;
    document.getElementById('cover-uses').textContent = metrics.coverUses;
    document.getElementById('exposures').textContent = metrics.exposures;
    document.getElementById('mission-status').textContent = this.world.returning ? 'Returning' : 'To Goal';
    Logger.log(`Metrics updated - Episode: ${metrics.episode}, Total Reward: ${metrics.totalReward}`);
  }

  exportMetricsAsCSV() {
    const headers = ['Episode', 'Steps', 'Reward', 'Total Reward', 'Exploration Rate', 'Cover Uses', 'Exposures', 'Mission Status'];
    const metrics = this.world.getMetrics();
    const rows = [[
      metrics.episode,
      metrics.step,
      metrics.reward,
      metrics.totalReward,
      metrics.explorationRate,
      metrics.coverUses,
      metrics.exposures,
      this.world.returning ? 'Returning' : 'To Goal'
    ]];
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'simulation_metrics.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Logger.log("Metrics exported as CSV");
  }

  simulationLoop() {
    if (!this.running) return;
    const result = this.world.simulateStep();
    if (result.done) {
      this.updateMetrics();
      if (!this.modelLoaded && this.running) {
        Logger.log(`Applying simulation delay of ${this.simulationDelay}ms after episode completion`);
        setTimeout(() => this.simulationLoop(), this.simulationDelay);
        return;
      }
    }
    this.sceneManager.animateAgent(
      result.agentPos,
      this.world.grid,
      this.world.enemies,
      result.detected,
      () => {
        this.sceneManager.updatePath(result.path, this.world.grid);
        this.updateMetrics();
        this.checkAgentMovement();
        if (!result.done) {
          Logger.log(`Applying simulation delay of ${this.simulationDelay}ms`);
          setTimeout(() => this.simulationLoop(), this.simulationDelay);
        }
      }
    );
  }

  checkAgentMovement() {
    const detected = this.world.isDetected();
    if (this.world.agentPos[0] === 0 && this.world.agentPos[1] === 0 && this.world.returning) {
      Logger.log("Agent mission completed: Returned to start. Should reset episode.");
    } else if (this.world.agentPos[0] === this.world.goalPos[0] && this.world.agentPos[1] === this.world.goalPos[1] && !this.world.returning) {
      Logger.log("Agent reached goal, should switch to returning mode.");
    } else if (detected && this.world.grid[this.world.agentPos[0]][this.world.agentPos[1]] !== 'C') {
      Logger.log("Agent detected by enemy, should reset episode.");
    } else {
      Logger.log(`Agent at position: ${JSON.stringify(this.world.agentPos)}, Returning: ${this.world.returning}`);
    }
  }

  animate() {
    this.sceneManager.render();
    requestAnimationFrame(() => this.animate());
  }

  getLOSDisplayMode() {
    return this.losDisplayMode;
  }
}