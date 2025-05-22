
# Stealth Mission Simulator

A reinforcement learning environment where an agent navigates a grid to reach a goal while avoiding patrolling enemies.  
This project uses **Three.js** for rendering and **Q-learning** for the agent's decision-making.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Features

- **15x15 Grid Environment**: Includes walls, cover, a start point (S), and a goal (G).
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
  - Size: 15x15
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

## Development

- **Tech Stack**:
  - [Three.js](https://threejs.org/) — 3D rendering
  - [TWEEN.js](https://github.com/tweenjs/tween.js) — smooth animations
  - [Tailwind CSS](https://tailwindcss.com/) — UI styling via CDN

- **Enhancements** (optional goals):
  - Add advanced RL (e.g., SARSA, DQN)
  - Visualize value functions or Q-tables
  - Add Chart.js for real-time metric plotting

- **Debugging**:
  - Use `Logger.js` for structured logging
  - Monitor the browser developer console for warnings/errors

---

## Contributing

We welcome contributions!

```text
1. Fork the repository
2. Create a new branch: git checkout -b feature-name
3. Make your changes and commit them
4. Push to your fork and submit a pull request
```

Please follow the coding style used in the project.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Three.js](https://threejs.org/) and [TWEEN.js](https://github.com/tweenjs/tween.js) for graphics and animation
- [Tailwind CSS](https://tailwindcss.com/) for UI components
- The reinforcement learning community for continuous inspiration and knowledge
```
