import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { ColliderGrid } from './world/colliders.js';
import { createVegetation } from './world/vegetation.js';
import { createWater } from './world/water.js';
import { createGrass } from './world/grass.js';
import { createClouds } from './world/clouds.js';
import { DayNight } from './world/daynight.js';
import { Character } from './player/character.js';
import { PlayerController } from './player/controller.js';
import { ThirdPersonCamera } from './player/camera.js';
import { Input } from './core/input.js';
import { Hud } from './ui/hud.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

const terrain = new Terrain();
scene.add(terrain.mesh);
const colliders = new ColliderGrid(8);
createVegetation(scene, terrain, colliders);
const water = createWater(terrain);
scene.add(water.mesh);
const grass = createGrass(terrain);
scene.add(grass.mesh);
const clouds = createClouds();
scene.add(clouds.mesh);
const dayNight = new DayNight(scene, params.has('t') ? Number(params.get('t')) : 8);

const input = new Input(renderer.domElement);
const character = new Character();
scene.add(character.root);
const player = new PlayerController(character, terrain, colliders, input);
const cam = new ThirdPersonCamera(camera, input, terrain, colliders);
const hud = new Hud(input);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let elapsed = 0;
function tick(dt, render = true) {
  elapsed += dt;
  const t = elapsed;

  dayNight.timeScale = input.down('KeyT') ? 60 : 1; // hold T to fast-forward time
  player.update(dt, cam.yaw);
  cam.update(dt, player.pos, player.eyeHeight);
  dayNight.update(dt, player.pos, camera);
  water.update(t, dayNight);
  grass.update(t, player.pos, camera);
  clouds.update(dt, player.pos);
  hud.update(dayNight, player);

  if (render) renderer.render(scene, camera);
  input.endFrame();
}

// Handy for testing from the browser console.
window.__game = { scene, camera, renderer, terrain, dayNight, player, character, cam, tick };

// ?manual: no real-time loop; tests advance frames with __game.tick(dt).
if (!params.has('manual')) {
  const timer = new THREE.Timer();
  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp);
    tick(Math.min(timer.getDelta(), 0.05));
  });
}
