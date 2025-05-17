import { GridWorld } from './core/GridWorld.js';
import { SceneManager } from './rendering/SceneManager.js';
import { Logger } from './utils/Logger.js';

export class GridWorldApp {
  constructor() {
    Logger.log("GridWorldApp constructor started");
    this.world = new GridWorld();
    this.sceneManager = new SceneManager(document.getElementById('canvas'), this.world.grid, this.world.params, this);
    this.losDisplayMode = 'radius'; // Options: 'radius', 'line', 'none'
    this.running = false; // Start paused
    this.modelLoaded = false; // Track if a model is loaded
    this.simulationDelay = 1000; // Default delay in ms (1 second)
    this.showPath = true; // Default: show agent path
    this.manualMode = false; // Default: automatic mode
    this.showGraph = false; // Default: hide training graph
    this.darkMode = false; // Default: light mode
    this.pauseOnDetection = false; // Default: don't pause on detection
    this.episodeMetrics = []; // Store metrics for graph and CSV export

    this.setupUI();
    this.setupManualControls();
    Logger.log("GridWorldApp constructor completed");

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
      Logger.error("Controls element not found in DOM. Ensure index.html has <div id='controls'></div>");
      return;
    }
    Logger.log("Controls element found");

    // Clear controls to start fresh
    controls.innerHTML = '';
    controls.className = 'w-80 bg-gradient-to-b from-gray-50 to-gray-200 p-4 overflow-y-auto fixed top-0 right-0 h-full shadow-xl border-l border-gray-300 rounded-l-lg dark:bg-gradient-to-b dark:from-gray-800 dark:to-gray-900 dark:border-gray-600';
    Logger.log("Controls element cleared and styled");

    // Add Project Title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'mb-6';
    titleDiv.innerHTML = '<h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Stealth Mission Simulator</h2>';
    controls.appendChild(titleDiv);
    Logger.log("Project title added");

    // Add Model Load Input
    const loadModelDiv = document.createElement('div');
    loadModelDiv.className = 'mb-4';
    loadModelDiv.innerHTML = '<input type="file" id="load-model-input" accept=".json" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300 dark:hover:file:bg-gray-600">';
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
          if (this.running && !this.manualMode) this.simulationLoop();
        }
      };
    } else {
      Logger.error("Model load input not found after appending");
    }

    // Add Model Status
    const modelStatusDiv = document.createElement('div');
    modelStatusDiv.className = 'mb-4';
    modelStatusDiv.innerHTML = `
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model Status:</h4>
      <p class="text-sm text-gray-600 dark:text-gray-400"><span id="model-status">${this.modelLoaded ? 'Loaded (Trained)' : 'Training'}</span></p>
    `;
    controls.appendChild(modelStatusDiv);
    Logger.log("Model status section added");

    // Add Save Model Button
    const saveModelDiv = document.createElement('div');
    saveModelDiv.className = 'mb-4';
    saveModelDiv.innerHTML = '<button id="save-model-button" class="bg-green-600 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded transition duration-200">Save Model</button>';
    controls.appendChild(saveModelDiv);
    const saveModelButton = document.getElementById('save-model-button');
    if (saveModelButton) {
      Logger.log("Save Model button added to DOM");
      saveModelButton.addEventListener('click', () => {
        Logger.log("Save Model button clicked");
        this.world.saveModel();
      });
    } else {
      Logger.error("Save Model button not found after appending");
    }

    // Add Clear Model Button
    const clearModelDiv = document.createElement('div');
    clearModelDiv.className = 'mb-4';
    clearModelDiv.innerHTML = '<button id="clear-model-button" class="bg-yellow-600 hover:bg-yellow-800 text-white font-semibold py-2 px-4 rounded transition duration-200">Clear Model & Retrain</button>';
    controls.appendChild(clearModelDiv);
    const clearModelButton = document.getElementById('clear-model-button');
    if (clearModelButton) {
      Logger.log("Clear Model button added to DOM");
      clearModelButton.addEventListener('click', () => {
        Logger.log("Clear Model button clicked");
        this.world.clearModel();
        this.modelLoaded = false;
        this.episodeMetrics = []; // Reset metrics for graph
        this.updateGraph();
        document.getElementById('model-status').textContent = 'Training';
        this.sceneManager.updateAgent(this.world.agentPos, this.world.grid, this.world.enemies);
        this.sceneManager.updatePath([this.world.agentPos], this.world.grid);
        this.updateMetrics();
      });
    } else {
      Logger.error("Clear Model button not found after appending");
    }

    // Add Simulation Speed Slider
    const speedDiv = document.createElement('div');
    speedDiv.className = 'mb-4';
    speedDiv.innerHTML = '<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Simulation Speed:</h4>';
    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.className = 'w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer hover:bg-gray-400 transition duration-150 dark:bg-gray-600 dark:hover:bg-gray-500';
    speedInput.min = '100'; // Fastest: 100ms
    speedInput.max = '2000'; // Slowest: 2000ms
    speedInput.step = '100';
    speedInput.value = this.simulationDelay;
    const speedValueDisplay = document.createElement('span');
    speedValueDisplay.className = 'ml-2 text-sm text-gray-600 dark:text-gray-400';
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

    // Add Path Visualization Toggle
    const pathToggleDiv = document.createElement('div');
    pathToggleDiv.className = 'mb-4';
    pathToggleDiv.innerHTML = `
      <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" id="path-toggle" class="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" ${this.showPath ? 'checked' : ''}>
        Show Agent Path
      </label>
    `;
    controls.appendChild(pathToggleDiv);
    const pathToggle = document.getElementById('path-toggle');
    if (pathToggle) {
      pathToggle.addEventListener('change', () => {
        this.showPath = pathToggle.checked;
        this.sceneManager.updatePath([this.world.agentPos], this.world.grid);
        Logger.log(`Path visualization toggled to ${this.showPath}`);
      });
    }
    Logger.log("Path visualization toggle added");

    // Add Manual Control Toggle
    const manualToggleDiv = document.createElement('div');
    manualToggleDiv.className = 'mb-4';
    manualToggleDiv.innerHTML = `
      <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" id="manual-toggle" class="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" ${this.manualMode ? 'checked' : ''}>
        Manual Control Mode
      </label>
    `;
    controls.appendChild(manualToggleDiv);
    const manualToggle = document.getElementById('manual-toggle');
    if (manualToggle) {
      manualToggle.addEventListener('change', () => {
        this.manualMode = manualToggle.checked;
        if (this.manualMode) {
          this.running = false;
          document.getElementById('start-pause-button').textContent = 'Start';
        }
        Logger.log(`Manual control mode toggled to ${this.manualMode}`);
      });
    }
    Logger.log("Manual control toggle added");

    // Add Training Graph Toggle
    const graphToggleDiv = document.createElement('div');
    graphToggleDiv.className = 'mb-4';
    graphToggleDiv.innerHTML = `
      <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" id="graph-toggle" class="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" ${this.showGraph ? 'checked' : ''}>
        Show Training Graph
      </label>
    `;
    controls.appendChild(graphToggleDiv);
    const graphCanvasDiv = document.createElement('div');
    graphCanvasDiv.className = 'mb-4';
    graphCanvasDiv.innerHTML = '<canvas id="training-graph" class="w-full h-40"></canvas>';
    graphCanvasDiv.style.display = this.showGraph ? 'block' : 'none';
    controls.appendChild(graphCanvasDiv);
    const graphToggle = document.getElementById('graph-toggle');
    if (graphToggle) {
      graphToggle.addEventListener('change', () => {
        this.showGraph = graphToggle.checked;
        graphCanvasDiv.style.display = this.showGraph ? 'block' : 'none';
        if (this.showGraph) this.updateGraph();
        Logger.log(`Training graph toggled to ${this.showGraph}`);
      });
    }
    Logger.log("Training graph toggle added");

    // Add Dark Mode Toggle
    const darkModeToggleDiv = document.createElement('div');
    darkModeToggleDiv.className = 'mb-4';
    darkModeToggleDiv.innerHTML = `
      <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" id="dark-mode-toggle" class="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" ${this.darkMode ? 'checked' : ''}>
        Dark Mode
      </label>
    `;
    controls.appendChild(darkModeToggleDiv);
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', () => {
        this.darkMode = darkModeToggle.checked;
        document.documentElement.classList.toggle('dark', this.darkMode);
        Logger.log(`Dark mode toggled to ${this.darkMode}`);
      });
    }
    Logger.log("Dark mode toggle added");

    // Add Pause on Detection Toggle
    const pauseDetectionDiv = document.createElement('div');
    pauseDetectionDiv.className = 'mb-4';
    pauseDetectionDiv.innerHTML = `
      <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" id="pause-detection-toggle" class="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" ${this.pauseOnDetection ? 'checked' : ''}>
        Pause on Detection
      </label>
    `;
    controls.appendChild(pauseDetectionDiv);
    const pauseDetectionToggle = document.getElementById('pause-detection-toggle');
    if (pauseDetectionToggle) {
      pauseDetectionToggle.addEventListener('change', () => {
        this.pauseOnDetection = pauseDetectionToggle.checked;
        Logger.log(`Pause on detection toggled to ${this.pauseOnDetection}`);
      });
    }
    Logger.log("Pause on detection toggle added");

    // Add Export Metrics Button
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
    } else {
      Logger.error("Export Metrics button not found after appending");
    }
    Logger.log("Export Metrics button added");

    // Add Button Group
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
        if (this.manualMode) return; // Disable Start/Pause in manual mode
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
    } else {
      Logger.error("Start/Pause or Reset button not found after appending");
    }

    // Add Metrics Section
    const metricsDiv = document.createElement('div');
    metricsDiv.id = 'metrics';
    metricsDiv.className = 'mb-6';
    metricsDiv.innerHTML = `
      <h3 class="text-lg font-bold mb-2 text-gray-800 dark:text-gray-200">Metrics</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Episode:</strong> <span id="episode">1/100</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Step:</strong> <span id="step">0/100</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Reward:</strong> <span id="reward">0.0</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Total Reward:</strong> <span id="total-reward">0.0</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Exploration Rate:</strong> <span id="exploration-rate">1.000</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Cover Uses:</strong> <span id="cover-uses">0</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Exposures:</strong> <span id="exposures">0</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-400"><strong>Mission Status:</strong> <span id="mission-status">To Goal</span></p>
    `;
    controls.appendChild(metricsDiv);
    Logger.log("Metrics section added");

    // LOS Display Toggle
    const losToggleDiv = document.createElement('div');
    losToggleDiv.className = 'mb-4';
    losToggleDiv.innerHTML = '<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enemy LOS Display:</h4>';
    const losSelect = document.createElement('select');
    losSelect.className = 'w-full p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300';
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

    // Parameter sliders
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'mb-6';
    paramsDiv.innerHTML = '<h3 class="text-lg font-bold mb-2 text-gray-800 dark:text-gray-200">Agent Parameters</h3>';
    const params = [
      { name: 'alpha', label: 'Learning Rate (α)', min: 0, max: 1, step: 0.01, value: 0.1 },
      { name: 'gamma', label: 'Discount Factor (γ)', min: 0, max: 1, step: 0.01, value: 0.9 },
      { name: 'epsilon', label: 'Exploration Rate (ε)', min: 0, max: 1, step: 0.01, value: 1.0 },
      { name: 'epsilonDecay', label: 'Epsilon Decay', min: 0.9, max: 1, step: 0.001, value: 0.995 },
      { name: 'minEpsilon', label: 'Min Epsilon', min: 0, max: 0.1, step: 0.001, value: 0.01 },
      { name: 'timePenalty', label: 'Time Penalty', min: -0.1, max: -0.01, step: 0.01, value: -0.05 },
      { name: 'distancePenalty', label: 'Distance Penalty', min: -0.05, max: -0.01, step: 0.01, value: -0.02 },
      { name: 'forwardReward', label: 'Forward Reward', min: 0.05, max: 0.2, step: 0.05, value: 0.1 },
      { name: 'enemyRadius', label: 'Enemy Radius', min: 0.5, max: 3.0, step: 0.1, value: 1.5 },
      { name: 'proximityWeight', label: 'Proximity Weight', min: 5.0, max: 20.0, step: 1.0, value: 10.0 },
      { name: 'riskExposureWeight', label: 'Risk Exposure Weight', min: 2.0, max: 10.0, step: 1.0, value: 5.0 }
    ];

    params.forEach(param => {
      const label = document.createElement('label');
      label.className = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
      label.textContent = `${param.label}: `;
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer hover:bg-gray-400 transition duration-150 dark:bg-gray-600 dark:hover:bg-gray-500';
      input.min = param.min;
      input.max = param.max;
      input.step = param.step;
      input.value = param.value;
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'ml-2 text-sm text-gray-600 dark:text-gray-400';
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

  setupManualControls() {
    document.addEventListener('keydown', (event) => {
      if (!this.manualMode) return;
      let newPos = [...this.world.agentPos];
      if (event.key === 'ArrowUp') newPos[0]--;
      else if (event.key === 'ArrowDown') newPos[0]++;
      else if (event.key === 'ArrowLeft') newPos[1]--;
      else if (event.key === 'ArrowRight') newPos[1]++;
      else return;

      if (newPos[0] >= 0 && newPos[0] < this.world.grid.length && newPos[1] >= 0 && newPos[1] < this.world.grid[0].length && this.world.grid[newPos[0]][newPos[1]] !== 'W') {
        this.world.agentPos = newPos;
        this.world.stats.step++;
        if (this.world.grid[newPos[0]][newPos[1]] === 'C') this.world.stats.coverUses++;
        if (newPos[0] === this.world.goalPos[0] && newPos[1] === this.world.goalPos[1] && !this.world.returning) {
          this.world.returning = true;
        }
        if (newPos[0] === 0 && newPos[1] === 0 && this.world.returning) {
          this.world.stats.episode++;
          this.world.returning = false;
          this.world.agentPos = [0, 0];
          this.episodeMetrics.push(this.world.getMetrics());
          this.updateGraph();
        }
        this.world.updateEnemies();
        if (this.world.isDetected() && this.world.grid[this.world.agentPos[0]][this.world.agentPos[1]] !== 'C') {
          this.world.totalExposures++;
          this.world.stats.exposures = this.world.totalExposures;
          if (this.pauseOnDetection) {
            this.manualMode = false;
            document.getElementById('manual-toggle').checked = false;
            alert(`Agent detected at ${this.world.agentPos} by enemy! Exposures: ${this.world.stats.exposures}`);
          }
        }
        this.sceneManager.updateAgent(this.world.agentPos, this.world.grid, this.world.enemies);
        this.sceneManager.updatePath([this.world.agentPos], this.world.grid);
        this.updateMetrics();
        Logger.log(`Manual move to ${newPos}`);
      }
    });
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
    Logger.log(`Metrics updated - Exposures: ${metrics.exposures}`);
  }

  updateGraph() {
    if (!this.showGraph) return;
    const ctx = document.getElementById('training-graph').getContext('2d');
    if (window.trainingChart) window.trainingChart.destroy();
    window.trainingChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.episodeMetrics.map(m => m.episode),
        datasets: [{
          label: 'Total Reward per Episode',
          data: this.episodeMetrics.map(m => m.totalReward),
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true,
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Episode' } },
          y: { title: { display: true, text: 'Total Reward' } }
        }
      }
    });
    Logger.log("Training graph updated");
  }

  exportMetricsAsCSV() {
    const headers = ['Episode', 'Steps', 'Reward', 'Total Reward', 'Exploration Rate', 'Cover Uses', 'Exposures', 'Mission Status'];
    const rows = this.episodeMetrics.map(metric => [
      metric.episode,
      metric.step,
      metric.reward,
      metric.totalReward,
      metric.explorationRate,
      metric.coverUses,
      metric.exposures,
      this.world.returning ? 'Returning' : 'To Goal'
    ]);
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
    if (!this.running || this.manualMode) return;
    const result = this.world.simulateStep();
    if (result.done) {
      this.episodeMetrics.push(this.world.getMetrics());
      this.updateGraph();
    }
    this.sceneManager.animateAgent(
      result.agentPos,
      this.world.grid,
      this.world.enemies,
      this.world.isDetected(),
      () => {
        this.sceneManager.updatePath(this.showPath ? result.path : [], this.world.grid);
        this.updateMetrics();
        this.checkAgentMovement();
        if (this.pauseOnDetection && this.world.isDetected() && this.world.grid[this.world.agentPos[0]][this.world.agentPos[1]] !== 'C') {
          this.running = false;
          document.getElementById('start-pause-button').textContent = 'Start';
          alert(`Agent detected at ${this.world.agentPos} by enemy! Exposures: ${this.world.stats.exposures}`);
          return;
        }
        if (!result.done) {
          Logger.log(`Applying simulation delay of ${this.simulationDelay}ms`);
          setTimeout(() => this.simulationLoop(), this.simulationDelay);
        } else {
          const resetResult = this.world.resetSimulation();
          this.sceneManager.updateAgent(resetResult.agentPos, this.world.grid, this.world.enemies);
          this.sceneManager.updatePath(this.showPath ? resetResult.path : [], this.world.grid);
          this.updateMetrics();
          if (!this.modelLoaded && this.running) {
            Logger.log(`Applying simulation delay of ${this.simulationDelay}ms after reset`);
            setTimeout(() => this.simulationLoop(), this.simulationDelay);
          }
        }
      }
    );
  }

  checkAgentMovement() {
    const detected = this.world.isDetected();
    if (this.world.agentPos[0] === 0 && this.world.agentPos[1] === 0 && this.world.returning) {
      Logger.log("Agent not moving: Mission completed (returned to start). Resetting episode.");
    } else if (detected && this.world.grid[this.world.agentPos[0]][this.world.agentPos[1]] !== 'C') {
      Logger.log("Agent not moving: Detected by enemy, resetting episode.");
    } else {
      Logger.log(`Agent moved to position: ${JSON.stringify(this.world.agentPos)}`);
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