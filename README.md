Stealth Mission Simulator
Overview
The Stealth Mission Simulator is a 10x10 grid-based simulation where an agent navigates from a start position (0,0) to a goal (9,9) and back, avoiding detection by enemies. The agent learns using Q-learning, balancing stealth (using cover) and efficiency (minimizing steps). The project uses Three.js for 3D visualization, Chart.js for real-time learning insights, and Tailwind CSS for styling.
Features

Grid World: A 10x10 grid with tiles: Start (S), Goal (G), Open (.), Cover (C), Wall (W), and Enemies (E).
Agent: Uses Q-learning to navigate, avoiding enemies by using cover.
Enemies: Patrol predefined paths with configurable line-of-sight (LOS) radius.
Visualization: 3D rendering with Three.js, showing the agent, enemies, and LOS (configurable as radius, line, or none).
UI: Sidebar with metrics, adjustable parameters, and real-time plots for learning insights.
Controls:
Start/Pause: Toggle automatic simulation.
Step: (Optional) Advance one step manually when paused.
Reset: Restart the simulation episode.


Plots: Real-time charts for Total Reward, Exposures, and Cover Uses per episode.

Project Structure
gridworld-threejs/
  ├── src/
  │   ├── main.js              # Entry point
  │   ├── gridworld.js         # Main application logic and UI
  │   ├── core/
  │   │   ├── GridWorld.js     # Simulation logic and Q-learning
  │   ├── rendering/
  │   │   ├── SceneManager.js  # 3D rendering with Three.js
  │   ├── utils/
  │   │   ├── Logger.js        # Logging utility
  │   ├── index.html           # HTML template
  ├── node_modules/            # Dependencies
  ├── package.json             # Project metadata and scripts
  ├── vite.config.js           # Vite configuration
  └── README.md                # This file

Setup Instructions

Clone the Repository:
git clone <repository-url>
cd gridworld-threejs

Note: If you don't have a repository, ensure all project files are in the structure above.

Install Dependencies:Ensure Node.js is installed, then run:
npm install

This installs Vite, Three.js, Tween.js, and other dependencies.

Verify index.html:Ensure index.html includes the following in the <head>:
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>

And the following in the <body>:
<canvas id="canvas" class="absolute inset-0"></canvas>
<div id="controls" class="z-10"></div>
<script type="module" src="/src/main.js"></script>


Run the Development Server:
npm run dev

Open http://localhost:3000 in your browser.


Usage

Simulation:
The simulation starts automatically. The agent (yellow sphere) moves from (0,0) to (9,9) and back.
Enemies (red boxes) patrol predefined paths with configurable LOS.
The agent uses cover (gray blocks) to avoid detection.


Controls:
Start/Pause: Toggle automatic stepping.
Step: (Optional, toggle visibility in UI) Advance one step manually when paused.
Reset: Restart the episode.
Enemy LOS Display: Toggle between circular radius, directional line, or none.


Parameters:
Adjust Q-learning parameters (e.g., alpha, gamma, epsilon) and simulation parameters (e.g., enemyRadius) in real-time.


Plots:
View real-time charts for Total Reward, Exposures, and Cover Uses to monitor the agent’s learning.



Troubleshooting

Agent Not Moving:
Check the console (F12) for logs:
"Simulation paused": Click "Start" to resume.
"Mission completed": Reset to start a new episode.
"Detected by enemy": Adjust detectionPenalty or enemyRadius.




Plots Not Rendering:
Ensure Chart.js is loaded (Network tab in F12).
Verify updatePlots is called (console logs like [GridWorld 2025-05-16T17:33:00.000Z] Plots updated).


Performance:
Maintain 60 FPS. Check Performance tab (F12) for bottlenecks.



Dependencies

Three.js: 3D rendering.
Tween.js: Animations.
Chart.js: Real-time plots.
Tailwind CSS: Styling.
Vite: Development server and bundler.

Future Improvements

Add path planning visualization for the agent.
Implement enemy AI with dynamic patrol routes.
Export simulation data for analysis.

Last updated: May 16, 2025

