# Stealth Mission Simulator

A reinforcement learning environment where an agent navigates a grid to reach a goal while avoiding patrolling enemies.  
This project uses **Three.js** for rendering and **Q-learning** for the agent's decision-making.

---

# 🎮 [Try it for yourself!](https://bachkhairi.github.io/Stealth-simulator/)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Tweakable Parameters](#tweakable-parameters)
- [Development](#development)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)

---

## Features

- **15x17 Grid Environment**: Includes walls, cover, a start point (S), and a goal (G).
- **Reinforcement Learning Agent**: Learns optimal paths using Q-learning while avoiding enemies.
- **Dynamic Enemies**: 5 enemies with 4-step back-and-forth patrol patterns.
- **Reward System**: Balanced rewards and penalties for progress, safety, and efficiency.
- **Visualization**: Real-time 3D rendering using Three.js.

---

![image](https://github.com/user-attachments/assets/82ee999e-746d-4e56-938d-1bae8aefad49)

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Bachkhairi/Stealth-simulator
   cd Stealth-simulator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm run dev
   ```

4. Open your browser and visit:
   ```
   http://localhost:3000
   ```

---

## Usage

- **Start / Pause**: Click **Start** to begin the simulation, and **Pause** to stop it.
- **Reset**: Click **Reset** to reposition the agent at the Start (S).
- **Simulation Speed**: Adjust with the slider (100ms to 2000ms per step).
- **Q-Learning Parameters**: Modify learning rate, discount factor, and epsilon via UI sliders.
- **Export Metrics**: Save simulation metrics by clicking **Export Metrics as CSV**.
- **Line of Sight**: Toggle enemy LOS display: `radius`, `line`, or `none`.

---

## Configuration

- **Grid**:
  - Size: 15x17
  - Symbols:
    - `W`: Wall
    - `C`: Cover
    - `S`: Start
    - `G`: Goal

- **Enemies**:
  - Count: 5
  - Patrol: 4-step loops
  - Detection: Adjustable LOS radius

- **Q-Learning**:
  - Set in `GridWorld.js`
  - Default parameters:
    ```javascript
    alpha: 0.5
    epsilon: 0.5
    gamma: 0.9
    ```

---

## Tweakable Parameters

All parameters below are adjustable and influence how the RL agent behaves and learns. You can tweak these in the UI or code to experiment with different strategies:

| Parameter           | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `alpha (α)`         | Learning rate (e.g., 0.5) – how quickly the agent updates Q-values          |
| `gamma (γ)`         | Discount factor (e.g., 0.8) – weights future rewards over immediate ones     |
| `epsilon (ε)`       | Exploration rate (e.g., 0.5) – balance between exploring vs exploiting       |
| `epsilonDecay`      | Decay rate (e.g., 0.999) – gradually reduces ε to favor learning over time   |
| `minEpsilon`        | Minimum ε (e.g., 0.01) – ensures some randomness always remains              |
| `timePenalty`       | Penalty per step (e.g., -0.1) – encourages efficiency                        |
| `forwardReward`     | Reward for progress toward goal (e.g., 1) – motivates forward movement       |
| `detectionPenalty`  | Penalty for enemy detection (e.g., -10) – discourages unsafe actions         |
| `enemyRadius`       | Enemy vision range (e.g., 1.5 tiles) – affects difficulty of stealth         |
| `stealthReward`     | Reward for using cover (e.g., 0.1) – promotes strategic hiding               |
| `coverStreakBonus`  | Bonus for consecutive cover use (e.g., 0.1) – reinforces stealth behavior    |

These allow you to strike a balance between aggressive, stealthy, or safe navigation behaviors.

---

## Development

- **Tech Stack**:
  - [Three.js](https://threejs.org/) — 3D rendering
  - [TWEEN.js](https://github.com/tweenjs/tween.js) — smooth animations
  - [Tailwind CSS](https://tailwindcss.com/) — UI styling via CDN

- **Enhancements** (optional goals):
  - Improve RL agent
  - Visualize value functions or Q-tables
  - Add Chart.js for real-time metric plotting

- **Debugging**:
  - Use `Logger.js` for structured logging
  - Monitor the browser developer console for warnings/errors


