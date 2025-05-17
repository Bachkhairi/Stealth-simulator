# Stealth Mission Simulator

a reinforcement learning environment where an agent navigates a grid to reach a goal while avoiding patrolling enemies.  
This project uses Three.js for rendering and Q-learning for the agent's decision-making.

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

- 15x15 Grid Environment: Includes walls, cover, a start point (S), and a goal (G).
- Reinforcement Learning Agent: Learns optimal paths using Q-learning while avoiding enemies.
- Dynamic Enemies: 5 enemies with 4-step back-and-forth patrol patterns.
- Reward System: Balanced rewards and penalties for progress, safety, and efficiency.
- Visualization: Real-time 3D rendering using Three.js.

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/gridworld-simulation.git
   cd gridworld-simulation
