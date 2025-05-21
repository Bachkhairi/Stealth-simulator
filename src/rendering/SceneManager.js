import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TWEEN from '@tweenjs/tween.js';
import { Logger } from '../utils/Logger.js';

const TILE_TYPES = {
  'S': { name: 'Start', passable: true, color: 0x00ff00, height: 0.5 },
  'G': { name: 'Goal', passable: true, color: 0x0000ff, height: 0.5 },
  '.': { name: 'Open', passable: true, color: 0xffffff, height: 0.0 },
  'C': { name: 'Cover', passable: true, color: 0x808080, height: 1.0 },
  'E': { name: 'Enemy', passable: true, color: 0xff3333, height: 0.2 },
  'W': { name: 'Wall', passable: false, color: 0x000000, height: 2.0 }
};

export class SceneManager {
  constructor(canvas, grid, params, gridWorldApp) {
    Logger.log("Initializing SceneManager");
    this.canvas = canvas;
    this.grid = grid;
    this.params = params;
    this.gridWorldApp = gridWorldApp;
    this.gridWidth = grid[0].length;
    this.gridHeight = grid.length;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const centerX = this.gridWidth / 2 - 0.5;
    const centerY = this.gridHeight / 2 - 0.5;
    this.camera.position.set(centerX, centerY, 20);
    this.camera.lookAt(centerX, centerY, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(centerX, centerY, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = true;
    this.controls.update();
    this.agentMesh = null;
    this.glowMesh = null;
    this.enemyMeshes = [];
    this.losCones = [];
    this.losLines = [];
    this.pathLine = null;
    this.pathGeometry = new THREE.BufferGeometry();
    this.pathMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    this.setupScene();
    this.setupGridLines();
    this.setupResize();
  }

  setupScene() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(10, 10, 10);
    this.scene.add(directionalLight);
    Logger.log("Scene setup complete");
  }

  setupGridLines() {
    const lines = [];
    const material = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
    for (let i = 0; i <= this.gridWidth; i++) {
      lines.push(new THREE.Vector3(i - 0.5, -0.5, 0.01));
      lines.push(new THREE.Vector3(i - 0.5, this.gridHeight - 0.5, 0.01));
    }
    for (let j = 0; j <= this.gridHeight; j++) {
      lines.push(new THREE.Vector3(-0.5, j - 0.5, 0.01));
      lines.push(new THREE.Vector3(this.gridWidth - 0.5, j - 0.5, 0.01));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(lines);
    const gridLines = new THREE.LineSegments(geometry, material);
    this.scene.add(gridLines);
    Logger.log("Grid lines added for " + this.gridWidth + "x" + this.gridHeight + " grid");
  }

  renderGrid() {
    const tileGeometry = new THREE.BoxGeometry(1, 1, 1);
    const instanceCount = this.gridHeight * this.gridWidth;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const instanceMesh = new THREE.InstancedMesh(tileGeometry, material, instanceCount);
    const colors = new Float32Array(instanceCount * 3);

    let instanceId = 0;
    for (let i = 0; i < this.gridHeight; i++) {
      for (let j = 0; j < this.gridWidth; j++) {
        const tileType = this.grid[i][j] || '.';
        const tileInfo = TILE_TYPES[tileType];
        const matrix = new THREE.Matrix4();
        matrix.setPosition(j, i, tileInfo.height / 2);
        matrix.scale(new THREE.Vector3(1, 1, tileInfo.height));
        instanceMesh.setMatrixAt(instanceId, matrix);

        const color = new THREE.Color(tileInfo.color);
        colors[instanceId * 3] = color.r;
        colors[instanceId * 3 + 1] = color.g;
        colors[instanceId * 3 + 2] = color.b;
        Logger.log(`Tile at [${i},${j}] set to ${tileType} with color ${tileInfo.color.toString(16)}`);
        instanceId++;
      }
    }

    instanceMesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
    this.scene.add(instanceMesh);
    Logger.log("Grid rendered with instanced meshes and vertex colors");
  }

  createAgent() {
    const agentGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    this.agentMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00 });
    this.agentMesh = new THREE.Mesh(agentGeometry, this.agentMaterial);
    this.scene.add(this.agentMesh);
    
    const glowGeometry = new THREE.SphereGeometry(0.35, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 });
    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    this.scene.add(this.glowMesh);
    
    Logger.log("Agent and glow created");
  }

  createEnemies(enemies) {
    this.enemyMeshes.forEach(mesh => this.scene.remove(mesh));
    this.losCones.forEach(cone => this.scene.remove(cone));
    this.losLines.forEach(line => this.scene.remove(line));
    this.enemyMeshes = [];
    this.losCones = [];
    this.losLines = [];

    const losDisplayMode = this.gridWorldApp.getLOSDisplayMode();
    
    const enemyGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const coneGeometry = new THREE.CircleGeometry(1, 32);
    const coneMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, linewidth: 10 });

    enemies.forEach((enemy, index) => {
      const material = new THREE.MeshLambertMaterial({ color: 0xff3333 });
      const mesh = new THREE.Mesh(enemyGeometry, material);
      mesh.position.set(enemy.pos[1], enemy.pos[0], 0.2);
      this.scene.add(mesh);
      this.enemyMeshes.push(mesh);

      if (losDisplayMode === 'radius') {
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.set(enemy.pos[1], enemy.pos[0], 0.1);
        const radius = this.params.enemyRadius || 1.5;
        cone.scale.set(radius, radius, 1);
        this.scene.add(cone);
        this.losCones.push(cone);
      } else if (losDisplayMode === 'line') {
        const start = new THREE.Vector3(enemy.pos[1], enemy.pos[0], 0.1);
        let end;
        const losLength = this.params.enemyRadius || 1.5;
        if (enemy.facing === 'right') end = new THREE.Vector3(enemy.pos[1] + losLength, enemy.pos[0], 0.1);
        else if (enemy.facing === 'left') end = new THREE.Vector3(enemy.pos[1] - losLength, enemy.pos[0], 0.1);
        else if (enemy.facing === 'down') end = new THREE.Vector3(enemy.pos[1], enemy.pos[0] + losLength, 0.1);
        else end = new THREE.Vector3(enemy.pos[1], enemy.pos[0] - losLength, 0.1);
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(geometry, lineMaterial);
        this.scene.add(line);
        this.losLines.push(line);
      }
    });
    Logger.log(`Enemies and LOS (${losDisplayMode}) created`);
  }

  updateEnemies(enemies) {
    enemies.forEach((enemy, index) => {
      if (this.enemyMeshes[index]) {
        this.enemyMeshes[index].position.set(enemy.pos[1], enemy.pos[0], 0.2);
        if (this.losCones[index]) {
          this.losCones[index].position.set(enemy.pos[1], enemy.pos[0], 0.1);
        } else if (this.losLines[index]) {
          const start = new THREE.Vector3(enemy.pos[1], enemy.pos[0], 0.1);
          let end;
          const losLength = this.params.enemyRadius || 1.5;
          if (enemy.facing === 'right') end = new THREE.Vector3(enemy.pos[1] + losLength, enemy.pos[0], 0.1);
          else if (enemy.facing === 'left') end = new THREE.Vector3(enemy.pos[1] - losLength, enemy.pos[0], 0.1);
          else if (enemy.facing === 'down') end = new THREE.Vector3(enemy.pos[1], enemy.pos[0] + losLength, 0.1);
          else end = new THREE.Vector3(enemy.pos[1], enemy.pos[0] - losLength, 0.1);
          const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
          this.losLines[index].geometry.dispose();
          this.losLines[index].geometry = geometry;
        }
      }
    });
    Logger.log("Enemy positions updated without re-creating meshes");
  }

  animateEnemies(enemies, callback) {
    const animations = [];
    enemies.forEach((enemy, index) => {
      if (this.enemyMeshes[index]) {
        const currentPos = this.enemyMeshes[index].position;
        const targetPos = { x: enemy.pos[1], y: enemy.pos[0], z: 0.2 };
        const tween = new TWEEN.Tween(currentPos)
          .to(targetPos, 400)
          .easing(TWEEN.Easing.Sinusoidal.InOut)
          .onUpdate(() => {
            this.enemyMeshes[index].position.copy(currentPos);
            if (this.losCones[index]) {
              this.losCones[index].position.set(currentPos.x, currentPos.y, 0.1);
            } else if (this.losLines[index]) {
              const start = new THREE.Vector3(currentPos.x, currentPos.y, 0.1);
              let end;
              const losLength = this.params.enemyRadius || 1.5;
              if (enemy.facing === 'right') end = new THREE.Vector3(currentPos.x + losLength, currentPos.y, 0.1);
              else if (enemy.facing === 'left') end = new THREE.Vector3(currentPos.x - losLength, currentPos.y, 0.1);
              else if (enemy.facing === 'down') end = new THREE.Vector3(currentPos.x, currentPos.y + losLength, 0.1);
              else end = new THREE.Vector3(currentPos.x, currentPos.y - losLength, 0.1);
              const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
              this.losLines[index].geometry.dispose();
              this.losLines[index].geometry = geometry;
            }
          });
        animations.push(tween);
      }
    });

    if (animations.length > 0) {
      const group = new TWEEN.Group();
      animations.forEach(tween => tween.group(group));
      animations[0].onComplete(() => {
        Logger.log("Enemy animations completed");
        if (callback) callback();
      });
      animations.forEach(tween => tween.start());
    } else if (callback) {
      callback();
    }
  }

  updateEnemyRadius(radius) {
    this.params.enemyRadius = radius;
    if (this.gridWorldApp.getLOSDisplayMode() === 'radius') {
      this.losCones.forEach(cone => {
        cone.scale.set(radius, radius, 1);
      });
    }
    Logger.log(`Updated enemy radius to ${radius}`);
  }

  getLOSPositions(enemy) {
    return [];
  }

  animateAgent(agentPos, grid, enemies, detected, callback) {
    if (!this.agentMesh || !this.glowMesh) {
      Logger.error("Agent or glow mesh missing");
      if (callback) callback();
      return;
    }

    if (detected) {
      this.flashAgentRed(() => {
        Logger.log("Agent flash animation completed, proceeding to position update or reset");
        this.performAgentAnimation(agentPos, grid, enemies, callback);
      });
    } else {
      this.performAgentAnimation(agentPos, grid, enemies, callback);
    }
  }

  performAgentAnimation(agentPos, grid, enemies, callback) {
    const targetPos = {
      x: agentPos[1],
      y: agentPos[0],
      z: TILE_TYPES[grid[agentPos[0]][agentPos[1]]].height + 0.3
    };
    new TWEEN.Tween(this.agentMesh.position)
      .to(targetPos, 400)
      .easing(TWEEN.Easing.Sinusoidal.InOut)
      .onUpdate(() => {
        this.glowMesh.position.copy(this.agentMesh.position);
      })
      .onComplete(() => {
        Logger.log(`Agent animated to ${JSON.stringify(targetPos)}`);
        if (grid[agentPos[0]][agentPos[1]] === 'G' || (agentPos[0] === 0 && agentPos[1] === 0)) {
          this.pulseGlow();
        }
        this.updateEnemies(enemies);
        if (callback) callback();
      })
      .start();
  }

  flashAgentRed(callback) {
    if (!this.agentMesh) {
      Logger.error("Agent mesh missing, cannot flash red");
      if (callback) callback();
      return;
    }
    const originalColor = this.agentMaterial.color.getHex();
    this.agentMaterial.color.set(0xff0000);
    Logger.log("Agent flashing red due to detection");
    setTimeout(() => {
      this.agentMaterial.color.set(originalColor);
      Logger.log("Agent color restored");
      if (callback) callback();
    }, 500);
  }

  pulseGlow() {
    if (!this.glowMesh) return;
    const scale = { value: 1 };
    new TWEEN.Tween(scale)
      .to({ value: 2 }, 400)
      .yoyo(true)
      .repeat(3)
      .easing(TWEEN.Easing.Sinusoidal.InOut)
      .onUpdate(() => {
        this.glowMesh.scale.set(scale.value, scale.value, scale.value);
      })
      .start();
    Logger.log("Glow pulsed on Goal or Start");
  }

  updateAgent(agentPos, grid, enemies) {
    if (this.agentMesh && this.glowMesh) {
      this.agentMesh.position.set(
        agentPos[1],
        agentPos[0],
        TILE_TYPES[grid[agentPos[0]][agentPos[1]]].height + 0.3
      );
      this.glowMesh.position.copy(this.agentMesh.position);
      this.glowMesh.scale.set(1, 1, 1);
      this.updateEnemies(enemies);
    }
  }

  updatePath(path, grid) {
    Logger.log(`Updating path with ${path.length} points`);
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }
    if (path.length > 0) {
      const points = path.map(p => new THREE.Vector3(
        p[1],
        p[0],
        TILE_TYPES[grid[p[0]][p[1]]].height + 0.05
      ));
      this.pathGeometry.setFromPoints(points);
      this.pathLine = new THREE.Line(this.pathGeometry, this.pathMaterial);
      this.scene.add(this.pathLine);
    }
  }

  setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    });
  }

  render() {
    TWEEN.update();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}