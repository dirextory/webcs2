import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type WeaponId = "ak" | "m4" | "awp";
export const weapons = {
  ak: {
    name: "AK-47",
    type: "ASSAULT RIFLE",
    mag: 30,
    damage: 34,
    interval: 0.105,
    reload: 2.3,
    description: "Raw power. A classic for a reason.",
  },
  m4: {
    name: "M4A1-S",
    type: "SUPPRESSED RIFLE",
    mag: 25,
    damage: 29,
    interval: 0.085,
    reload: 2.1,
    description: "Quiet, controlled, and dependable.",
  },
  awp: {
    name: "AWP",
    type: "SNIPER RIFLE",
    mag: 5,
    damage: 110,
    interval: 1.25,
    reload: 3,
    description: "One shot. Make it count.",
  },
};
export type Settings = {
  difficulty: "Easy" | "Normal" | "Hard";
  sensitivity: number;
  volume: number;
  bots: number;
};
export type GameState = {
  health: number;
  ammo: number;
  reserve: number;
  kills: number;
  deaths: number;
  time: number;
  round: number;
  score: [number, number];
  alive: number;
  reloading: boolean;
  message: string;
  hit: boolean;
  hurt: boolean;
  feed: { killer: string; victim: string }[];
  x: number;
  z: number;
  yaw: number;
  ended: boolean;
};
type Bot = { group: THREE.Group; hp: number; cooldown: number; direction: number; id: number };
type Obstacle = { x: number; z: number; w: number; d: number };

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.05, 180);
  private gun = new THREE.Group();
  private flash: THREE.Mesh;
  private obstacles: Obstacle[] = [];
  private solid: THREE.Object3D[] = [];
  private bots: Bot[] = [];
  private keys = new Set<string>();
  private clock = new THREE.Clock();
  private frame = 0;
  private running = false;
  private inLobby = true;
  private firing = false;
  private aiming = false;
  private yaw = 0;
  private pitch = 0;
  private velocityY = 0;
  private lastShot = 0;
  private reloadAt = 0;
  private nextRoundAt = 0;
  private hitUntil = 0;
  private hurtUntil = 0;
  private recoil = 0;
  private elapsed = 0;
  private lastUI = 0;
  private mouseReadyAt = 0;
  private mapSources: THREE.Mesh[] = [];
  private audio?: AudioContext;
  private weapon: WeaponId = "ak";
  private mode: "elimination" | "deathmatch" = "elimination";
  private settings: Settings = { difficulty: "Normal", sensitivity: 1, volume: 40, bots: 5 };
  private state: GameState = {
    health: 100,
    ammo: 30,
    reserve: 90,
    kills: 0,
    deaths: 0,
    time: 90,
    round: 1,
    score: [0, 0],
    alive: 5,
    reloading: false,
    message: "",
    hit: false,
    hurt: false,
    feed: [],
    x: 0,
    z: 17,
    yaw: 0,
    ended: false,
  };
  private ray = new THREE.Raycaster();
  private resize: ResizeObserver;

  constructor(
    private mount: HTMLDivElement,
    private update: (s: GameState) => void,
    private onPause: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#a6b8b8");
    this.scene.fog = new THREE.Fog("#b7b8a6", 35, 95);
    this.scene.add(new THREE.HemisphereLight("#e7eff2", "#978169", 2.6));
    const sun = new THREE.DirectionalLight("#fff1cd", 3.1);
    sun.position.set(-16, 29, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 90 });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.buildMap();
    this.batchMap();
    this.scene.add(this.camera);
    this.camera.add(this.gun);
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.45, 7),
      new THREE.MeshBasicMaterial({ color: "#ffd77b", transparent: true, opacity: 0.9 }),
    );
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.buildGun();
    this.resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = mount;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(mount);
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    document.addEventListener("mousemove", this.mousemove);
    document.addEventListener("mouseup", this.mouseup);
    document.addEventListener("pointerlockchange", this.lockchange);
    this.renderer.domElement.addEventListener("mousedown", this.mousedown);
    this.renderer.domElement.addEventListener("contextmenu", this.contextmenu);
    this.animate();
  }
  private box(
    w: number,
    h: number,
    d: number,
    color: THREE.ColorRepresentation,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private wall(x: number, z: number, w: number, h: number, d: number, color = "#bba68a") {
    const m = this.box(w, h, d, color, x, h / 2, z);
    this.obstacles.push({ x, z, w, d });
    this.solid.push(m);
    return m;
  }
  private buildMap() {
    this.box(150, 0.4, 150, "#b8a88a", 0, -0.23, 0);
    // Ground joints add scale without external textures.
    for (let x = -30; x <= 30; x += 3) {
      this.box(0.018, 0.006, 60, "#aa9b80", x, -0.019, 0);
      this.box(60, 0.006, 0.018, "#aa9b80", 0, -0.019, x);
    }
    this.wall(-25, 0, 2, 10, 52);
    this.wall(25, 0, 2, 10, 52);
    this.wall(0, -25, 52, 11, 2);
    this.wall(0, 25, 52, 7, 2);
    const buildings = [
      [-18, -13, 12, 10, 18, "#c3ad8d"],
      [16, -17, 16, 13, 12, "#b8a085"],
      [-19, 13, 10, 9, 15, "#c4b397"],
      [20, 9, 8, 11, 18, "#bba588"],
      [-10, -21, 5, 14, 7, "#b69d7f"],
    ] as const;
    buildings.forEach(([x, z, w, h, d, c]) => {
      this.wall(x, z, w, h, d, c);
      this.box(w + 0.5, 0.3, d + 0.5, "#d2c2a6", x, h, z);
      this.box(w + 0.2, 0.15, d + 0.2, "#8b7c65", x, h - 0.5, z);
      for (let i = 0; i < Math.floor(w / 3); i++) {
        const wx = x - w / 2 + 1.6 + i * 3;
        for (let wy = 3; wy < h - 1; wy += 3) {
          this.box(0.95, 1.45, 0.12, "#514e43", wx, wy, z + d / 2 + 0.03);
          this.box(1.15, 0.12, 0.3, "#d5c4a7", wx, wy - 0.76, z + d / 2 + 0.1);
          this.box(0.06, 1.4, 0.15, "#8d8a70", wx, wy, z + d / 2 + 0.1);
        }
      }
      // Rooftop water tanks and utility structures.
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.7, 12),
        new THREE.MeshStandardMaterial({ color: "#686b60", roughness: 0.9 }),
      );
      tank.position.set(x + 1, h + 1, z);
      tank.castShadow = true;
      this.scene.add(tank);
      this.box(0.08, 3, 0.08, "#575951", x - 2, h + 1.5, z);
      this.box(2, 0.06, 0.06, "#575951", x - 2, h + 2.4, z);
    });
    // Central sandstone gateway: an actual passage, not a solid facade.
    this.wall(-7, -9, 3.5, 6, 2);
    this.wall(3, -9, 6, 6, 2);
    this.box(7, 2, 2, "#c5b292", -2, 5.3, -9);
    this.solid.push(this.scene.children[this.scene.children.length - 1]);
    this.box(15, 0.3, 2.5, "#d5c6aa", -2, 6.4, -9);
    for (let i = 0; i < 7; i++)
      this.box(1.4, 0.8, 2.1, i % 2 ? "#baa688" : "#cbb899", -6.3 + i * 1.5, 4.35, -9);
    // Doorways and plaster patches on the outside walls.
    this.box(2.5, 3.8, 0.15, "#5c6257", 12, 1.9, -10.91);
    for (let i = 0; i < 6; i++) this.box(0.028, 3.7, 0.02, "#7c8170", 10.85 + i * 0.45, 1.9, -10.8);
    this.box(3, 0.25, 0.35, "#d8c6a4", 12, 4, -10.8);
    this.box(0.25, 6, 0.25, "#8e8671", 23.9, 3, 1);
    const crate = (x: number, z: number, w = 2.6, h = 2.5, d = 2.6) => {
      this.wall(x, z, w, h, d, "#8c8668");
      for (const side of [-1, 1]) {
        this.box(w, 0.13, 0.08, "#5e644e", x, 0.22, z + (side * d) / 2);
        this.box(w, 0.13, 0.08, "#5e644e", x, h - 0.22, z + (side * d) / 2);
        this.box(0.13, h, 0.08, "#5e644e", x - w * 0.36, h / 2, z + (side * d) / 2);
        this.box(0.13, h, 0.08, "#5e644e", x + w * 0.36, h / 2, z + (side * d) / 2);
        for (let i = 1; i < 7; i++)
          this.box(w, 0.018, 0.04, "#79775e", x, (i * h) / 7, z + side * (d / 2 + 0.03));
      }
    };
    crate(7, 0, 4, 2.8, 3);
    crate(8, -0.1, 2.6, 2.2, 2.5); // stacked below
    this.box(2.8, 2.1, 2.8, "#8d896c", 7, 3.85, 0);
    crate(-7, 5, 3, 2.6, 3);
    crate(-9, 6, 2.4, 1.8, 2.4);
    crate(15, 17, 3, 2.5, 3);
    crate(-6, -17, 2.5, 2.5, 2.5);
    crate(13, -6, 2.5, 2.4, 2.5);
    // Painted bombsite marking, signage, and cables.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#b25732";
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, 216, 216);
    ctx.font = "bold 170px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#b25732";
    ctx.fillText("A", 128, 190);
    const tex = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    sign.position.set(3, 2.6, -7.98);
    this.scene.add(sign);
    const marking = sign.clone();
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(4, 0.006, 8);
    marking.scale.setScalar(2);
    this.scene.add(marking);
    const wirePoints = [
      new THREE.Vector3(-20, 10, -7),
      new THREE.Vector3(0, 8, -5),
      new THREE.Vector3(22, 11, -4),
    ];
    const curve = new THREE.CatmullRomCurve3(wirePoints);
    this.scene.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 32, 0.025, 4, false),
        new THREE.MeshBasicMaterial({ color: "#4a4a3e" }),
      ),
    );
    // Distant skyline creates depth beyond the playable compound.
    for (let i = 0; i < 15; i++) {
      const h = 7 + Math.sin(i * 13) * 4;
      this.box(6, h, 6, "#aeaa96", -45 + i * 7, h / 2, -36 - Math.abs(Math.sin(i)) * 8);
    }
    for (let i = 0; i < 28; i++) {
      const x = Math.sin(i * 37) * 22,
        z = Math.cos(i * 17) * 22;
      this.box(0.15 + (i % 3) * 0.1, 0.1, 0.16, "#938a72", x, 0.03, z).rotation.y = i;
    }
  }
  private buildGun() {
    const keep = this.flash;
    [...this.gun.children].forEach((c) => {
      if (c !== keep) {
        this.gun.remove(c);
        this.disposeObject(c);
      }
    });
    const metal = "#303932",
      steel = "#545d50",
      wood = this.weapon === "ak" ? "#805137" : "#414c3c";
    this.box(0.14, 0.19, 0.53, metal, 0, 0, -0.35, this.gun);
    this.box(0.12, 0.035, 0.5, steel, 0, 0.11, -0.35, this.gun);
    this.box(0.13, 0.14, 0.38, wood, 0, -0.005, -0.78, this.gun);
    this.box(0.046, 0.05, 0.47, steel, 0, 0.025, -1.17, this.gun);
    this.box(0.07, 0.08, 0.1, metal, 0, 0.025, -1.43, this.gun);
    this.box(0.04, 0.1, 0.025, metal, 0, 0.1, -1.26, this.gun);
    const mag = this.box(
      0.1,
      0.32,
      0.16,
      this.weapon === "ak" ? "#555c40" : metal,
      0,
      -0.22,
      -0.49,
      this.gun,
    );
    mag.rotation.x = this.weapon === "ak" ? -0.3 : 0.1;
    this.box(0.1, 0.24, 0.12, metal, 0, -0.18, -0.2, this.gun).rotation.x = -0.28;
    this.box(0.13, 0.16, 0.32, wood, 0, -0.015, 0, this.gun);
    this.box(0.15, 0.22, 0.05, metal, 0, -0.04, 0.17, this.gun);
    this.box(0.045, 0.04, 0.09, steel, 0.085, 0.01, -0.32, this.gun);
    if (this.weapon === "m4") {
      this.box(0.06, 0.065, 0.3, metal, 0, 0.17, -0.39, this.gun);
      this.box(0.08, 0.05, 0.36, metal, 0, 0.23, -0.39, this.gun);
      this.box(0.08, 0.08, 0.38, metal, 0, 0.025, -1.58, this.gun);
    }
    if (this.weapon === "awp") {
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.45, 12),
        new THREE.MeshStandardMaterial({ color: metal }),
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.22, -0.4);
      this.gun.add(scope);
      this.box(0.1, 0.13, 0.1, metal, 0, 0.14, -0.4, this.gun);
      this.box(0.17, 0.17, 0.55, "#68704e", 0, -0.02, -0.75, this.gun);
    }
    // Gloved hands and sleeves anchor the recognizable first-person silhouette.
    this.box(0.14, 0.16, 0.22, "#3c4437", 0.03, -0.16, -0.19, this.gun).rotation.x = -0.25;
    const arm = this.box(0.18, 0.2, 0.63, "#77765b", 0.06, -0.25, 0.05, this.gun);
    arm.rotation.x = -0.3;
    this.box(0.15, 0.15, 0.24, "#414939", -0.055, -0.12, -0.78, this.gun);
    const left = this.box(0.17, 0.18, 0.6, "#77765b", -0.16, -0.24, -0.49, this.gun);
    left.rotation.z = -0.35;
    left.rotation.x = 0.4;
    this.flash.position.set(0, 0.025, this.weapon === "m4" ? -1.85 : -1.54);
    this.gun.position.set(0.29, -0.27, -0.38);
    this.gun.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
  }
  private batchMap() {
    // Keep original collision meshes, but render static architecture in color batches.
    this.scene.updateMatrixWorld(true);
    const batches = new Map<string, THREE.Mesh[]>();
    for (const object of [...this.scene.children]) {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial) ||
        object.material.map
      )
        continue;
      const key = object.material.color.getHexString();
      const batch = batches.get(key) || [];
      batch.push(object);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      const geometries = batch.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, (batch[0].material as THREE.Material).clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      batch.forEach((original) => {
        this.scene.remove(original);
        this.mapSources.push(original);
      });
    }
  }
  private spawnBots() {
    this.bots.forEach((b) => {
      this.scene.remove(b.group);
      this.disposeObject(b.group);
    });
    this.bots = [];
    const positions = [
      [-3, 0],
      [10, -5],
      [-9, -3],
      [0, -16],
      [15, 4],
      [-16, 0],
      [10, 12],
    ];
    for (let i = 0; i < this.settings.bots; i++) {
      const group = new THREE.Group();
      const [x, z] = positions[i];
      group.position.set(x, 0, z);
      this.box(0.55, 0.7, 0.32, "#62634c", 0, 1.16, 0, group);
      this.box(0.59, 0.46, 0.37, "#373f33", 0, 1.23, 0.015, group);
      this.box(0.31, 0.33, 0.3, "#c0a282", 0, 1.72, 0, group).userData.head = true;
      this.box(0.35, 0.16, 0.34, "#4d5341", 0, 1.91, 0, group).userData.head = true;
      this.box(0.28, 0.15, 0.02, "#292f29", 0, 1.76, 0.16, group).userData.head = true;
      for (const side of [-1, 1]) {
        this.box(0.2, 0.7, 0.24, "#6b6950", side * 0.17, 0.47, 0, group);
        this.box(0.22, 0.16, 0.37, "#363a2e", side * 0.17, 0.1, 0.06, group);
        const arm = this.box(0.17, 0.55, 0.2, "#77755b", side * 0.36, 1.17, 0.12, group);
        arm.rotation.x = -0.55;
      }
      this.box(0.12, 0.14, 0.75, "#252c26", 0.18, 1.22, 0.46, group);
      group.traverse((c) => {
        if (c instanceof THREE.Mesh) c.userData.bot = i;
      });
      this.scene.add(group);
      this.bots.push({ group, hp: 100, cooldown: 1.8 + i * 0.3, direction: i, id: i });
    }
    this.state.alive = this.bots.length;
  }
  configure(settings: Settings, weapon: WeaponId) {
    this.settings = { ...settings, bots: this.inLobby ? settings.bots : this.settings.bots };
    if (this.inLobby && weapon !== this.weapon) {
      this.weapon = weapon;
      this.buildGun();
    }
  }
  start(weapon: WeaponId, mode: "elimination" | "deathmatch", settings: Settings) {
    this.weapon = weapon;
    this.mode = mode;
    this.settings = { ...settings };
    this.state = {
      ...this.state,
      kills: 0,
      deaths: 0,
      round: 1,
      score: [0, 0],
      ended: false,
      feed: [],
    };
    this.inLobby = false;
    this.running = true;
    this.buildGun();
    this.newRound();
    this.audio ??= new AudioContext();
    void this.audio.resume();
    this.capture();
  }
  private newRound() {
    this.state.health = 100;
    this.state.ammo = weapons[this.weapon].mag;
    this.state.reserve = weapons[this.weapon].mag * 3;
    this.state.time = this.mode === "deathmatch" ? 180 : 90;
    this.state.message = "";
    this.state.reloading = false;
    this.reloadAt = 0;
    this.nextRoundAt = 0;
    this.camera.position.set(0, 1.7, 17);
    this.yaw = 0;
    this.pitch = 0;
    this.velocityY = 0;
    this.keys.clear();
    this.firing = false;
    this.aiming = false;
    this.spawnBots();
    this.publish();
  }
  resume() {
    this.running = true;
    this.clock.getDelta();
    this.capture();
  }
  pause() {
    if (this.inLobby) return;
    this.running = false;
    this.firing = false;
    this.aiming = false;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  lobby() {
    this.pause();
    this.inLobby = true;
    this.bots.forEach((b) => {
      this.scene.remove(b.group);
      this.disposeObject(b.group);
    });
    this.bots = [];
  }
  private capture() {
    if (document.pointerLockElement === this.renderer.domElement) return;
    this.mouseReadyAt = performance.now() + 150;
    const p = this.renderer.domElement.requestPointerLock?.();
    if (p)
      p.catch(() => {
        /* Drag-to-look remains available when embedded pointer lock is denied. */
      });
  }
  private keydown = (e: KeyboardEvent) => {
    if (this.inLobby) return;
    if (["Space", "Tab", "KeyW", "KeyA", "KeyS", "KeyD", "ControlLeft"].includes(e.code))
      e.preventDefault();
    if (e.code === "Escape" && this.running) {
      this.pause();
      this.onPause();
      return;
    }
    if (!this.running) return;
    this.keys.add(e.code);
    if (e.code === "KeyR") this.reload();
    if (e.code === "Space" && this.camera.position.y <= 1.71) {
      this.velocityY = 5;
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => {
    if (this.running) {
      this.pause();
      this.onPause();
    }
  };
  private lockchange = () => {
    if (document.pointerLockElement) {
      this.mouseReadyAt = performance.now() + 150;
      return;
    }
    if (this.running && !this.inLobby) {
      this.pause();
      this.onPause();
    }
  };
  private mousemove = (e: MouseEvent) => {
    if (
      !this.running ||
      performance.now() < this.mouseReadyAt ||
      (!document.pointerLockElement && e.buttons === 0)
    )
      return;
    const sensitivity = 0.002 * this.settings.sensitivity * (this.aiming ? 0.55 : 1);
    this.yaw -= e.movementX * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sensitivity, -1.4, 1.4);
  };
  private mousedown = (e: MouseEvent) => {
    if (!this.running) return;
    if (e.button === 0) {
      this.firing = true;
      this.capture();
    }
    if (e.button === 2) this.aiming = true;
  };
  private mouseup = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
    if (e.button === 2) this.aiming = false;
  };
  private contextmenu = (e: Event) => e.preventDefault();
  private reload() {
    if (
      this.state.reloading ||
      this.state.ammo === weapons[this.weapon].mag ||
      this.state.reserve <= 0 ||
      this.state.health <= 0
    )
      return;
    this.state.reloading = true;
    this.reloadAt = this.elapsed + weapons[this.weapon].reload;
    this.tone(220, 0.08, 0.15);
  }
  private blocked(x: number, z: number, r = 0.38) {
    return (
      Math.abs(x) > 23.5 ||
      Math.abs(z) > 23.5 ||
      this.obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r)
    );
  }
  private move(position: THREE.Vector3, dx: number, dz: number, r = 0.38) {
    if (!this.blocked(position.x + dx, position.z, r)) position.x += dx;
    if (!this.blocked(position.x, position.z + dz, r)) position.z += dz;
  }
  private shoot() {
    const w = weapons[this.weapon];
    if (
      this.elapsed - this.lastShot < w.interval ||
      this.state.reloading ||
      this.state.health <= 0 ||
      this.state.message
    )
      return;
    if (!this.state.ammo) {
      this.reload();
      return;
    }
    this.lastShot = this.elapsed;
    this.state.ammo--;
    this.recoil = 0.065;
    this.flash.visible = true;
    this.tone(
      this.weapon === "awp" ? 65 : this.weapon === "m4" ? 135 : 95,
      0.13,
      this.weapon === "m4" ? 0.24 : 0.5,
      true,
    );
    this.scene.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = this.bots.filter((b) => b.hp > 0).flatMap((b) => b.group.children);
    const intersections = this.ray.intersectObjects([...this.solid, ...targets], false);
    if (intersections.length) {
      const obj = intersections[0].object;
      if (obj.userData.bot !== undefined) {
        const bot = this.bots[obj.userData.bot];
        bot.hp -= w.damage * (obj.userData.head ? 3 : 1);
        this.hitUntil = this.elapsed + 0.13;
        if (bot.hp <= 0) {
          bot.group.visible = false;
          this.state.kills++;
          this.state.alive--;
          this.state.feed = [
            { killer: "YOU", victim: `BOT ${String(bot.id + 1).padStart(2, "0")}` },
            ...this.state.feed,
          ].slice(0, 4);
          if (this.state.alive === 0 && this.mode === "elimination") this.finishRound(true);
          else if (this.mode === "deathmatch") bot.cooldown = 3;
        }
      }
      const point = intersections[0].point;
      const mark = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 5, 5),
        new THREE.MeshBasicMaterial({ color: "#e8c280" }),
      );
      mark.position.copy(point);
      this.scene.add(mark);
      // Remove impact markers through the main loop to avoid outstanding timers.
      mark.userData.expires = this.elapsed + 0.2;
    }
    this.pitch += this.weapon === "awp" ? 0.025 : 0.007 + Math.random() * 0.007;
  }
  private finishRound(win: boolean) {
    if (this.nextRoundAt || this.state.ended) return;
    this.state.score[win ? 0 : 1]++;
    this.state.message = win ? "ROUND WON" : "ROUND LOST";
    this.firing = false;
    this.tone(win ? 620 : 130, 0.4, 0.25);
    if (this.state.score.some((s) => s >= 5)) {
      this.state.message = win ? "MISSION COMPLETE" : "MISSION FAILED";
      this.state.ended = true;
      this.pause();
      this.onPause();
    } else this.nextRoundAt = this.elapsed + 3.5;
  }
  private tone(freq: number, length: number, volume: number, noise = false) {
    if (!this.audio || !this.settings.volume) return;
    const ctx = this.audio,
      gain = ctx.createGain();
    gain.gain.setValueAtTime((volume * this.settings.volume) / 100, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + length);
    gain.connect(ctx.destination);
    if (noise) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * length, ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq * 12;
      source.connect(filter);
      filter.connect(gain);
      source.start();
      source.stop(ctx.currentTime + length);
    } else {
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(freq * 0.4, ctx.currentTime + length);
      oscillator.connect(gain);
      oscillator.start();
      oscillator.stop(ctx.currentTime + length);
    }
  }
  private updateBots(dt: number) {
    const difficulty = { Easy: 0.45, Normal: 1, Hard: 1.6 }[this.settings.difficulty];
    for (const bot of this.bots) {
      bot.cooldown -= dt;
      if (bot.hp <= 0) {
        if (this.mode === "deathmatch" && bot.cooldown <= 0) {
          bot.hp = 100;
          bot.group.visible = true;
          bot.group.position.set(bot.id % 2 ? 15 : -15, 0, -16 + bot.id * 3);
          this.state.alive++;
        }
        continue;
      }
      const p = bot.group.position,
        dist = p.distanceTo(this.camera.position);
      bot.group.lookAt(this.camera.position.x, 0, this.camera.position.z);
      const from = p.clone().add(new THREE.Vector3(0, 1.5, 0));
      const dir = this.camera.position.clone().sub(from).normalize();
      this.ray.set(from, dir);
      const cover = this.ray.intersectObjects(this.solid, false);
      const visible = !cover.length || cover[0].distance > dist;
      if (!this.state.message && this.state.health > 0) {
        let angle = Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z);
        if (visible && dist < 13) angle += Math.sin(this.elapsed * 0.7 + bot.id) * 1.9;
        else if (!visible) angle += Math.sin(this.elapsed * 0.8 + bot.id) * 1.5;
        const speed = (visible && dist < 8 ? 0.8 : 1.9) * dt;
        const old = p.clone();
        this.move(p, Math.sin(angle) * speed, Math.cos(angle) * speed, 0.4);
        if (p.distanceTo(old) < 0.003)
          this.move(
            p,
            Math.cos(angle + bot.id) * speed * 2,
            -Math.sin(angle + bot.id) * speed * 2,
            0.4,
          );
        if (visible && dist < 33 && bot.cooldown <= 0) {
          bot.cooldown = (0.65 + Math.random() * 0.7) / difficulty;
          if (Math.random() < (0.68 - dist * 0.009) * difficulty) {
            this.state.health = Math.max(
              0,
              this.state.health - (5 + Math.floor(Math.random() * 7)),
            );
            this.hurtUntil = this.elapsed + 0.18;
            this.tone(70, 0.09, 0.18);
            if (this.state.health === 0) {
              this.state.deaths++;
              this.state.feed = [
                { killer: `BOT ${bot.id + 1}`, victim: "YOU" },
                ...this.state.feed,
              ].slice(0, 4);
              if (this.mode === "elimination") this.finishRound(false);
              else {
                this.state.message = "ELIMINATED";
                this.nextRoundAt = this.elapsed + 2;
              }
            }
          }
          const end = this.camera.position
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0));
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([from, end]),
            new THREE.LineBasicMaterial({ color: "#ecd28c", transparent: true, opacity: 0.55 }),
          );
          line.userData.expires = this.elapsed + 0.055;
          this.scene.add(line);
        }
      }
    }
  }
  private publish() {
    this.state.x = this.camera.position.x;
    this.state.z = this.camera.position.z;
    this.state.yaw = this.yaw;
    this.state.hit = this.elapsed < this.hitUntil;
    this.state.hurt = this.elapsed < this.hurtUntil;
    this.update({ ...this.state, score: [...this.state.score], feed: [...this.state.feed] });
  }
  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.inLobby) {
      const t = this.clock.elapsedTime;
      this.camera.position.set(10 + Math.sin(t * 0.035) * 1.5, 8, 22);
      this.camera.lookAt(-1, 2.5, -8);
      this.gun.visible = false;
    } else {
      this.gun.visible = true;
      if (this.running && !this.state.ended) {
        this.elapsed += dt;
        if (!this.state.message) {
          this.state.time = Math.max(0, this.state.time - dt);
          if (!this.state.time) {
            if (this.mode === "elimination") this.finishRound(false);
            else {
              this.state.message = "TRAINING COMPLETE";
              this.state.ended = true;
              this.pause();
              this.onPause();
            }
          }
          const crouch = this.keys.has("ControlLeft") || this.keys.has("KeyC");
          const speed = (crouch ? 2 : this.keys.has("ShiftLeft") ? 2.5 : 5) * dt;
          let x = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
            z = Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW"));
          const len = Math.hypot(x, z) || 1;
          x /= len;
          z /= len;
          this.move(
            this.camera.position,
            (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) * speed,
            (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) * speed,
          );
          const floor = crouch ? 1.15 : 1.7;
          this.velocityY -= 13 * dt;
          this.camera.position.y = Math.max(floor, this.camera.position.y + this.velocityY * dt);
          if (this.camera.position.y === floor) this.velocityY = 0;
          if (this.firing) this.shoot();
          this.updateBots(dt);
        }
        if (this.state.reloading && this.elapsed >= this.reloadAt) {
          const amount = Math.min(weapons[this.weapon].mag - this.state.ammo, this.state.reserve);
          this.state.ammo += amount;
          this.state.reserve -= amount;
          this.state.reloading = false;
        }
        if (this.nextRoundAt && this.elapsed >= this.nextRoundAt) {
          if (this.mode === "elimination") {
            this.state.round++;
            this.newRound();
          } else {
            this.state.health = 100;
            this.state.ammo = weapons[this.weapon].mag;
            this.state.reserve = weapons[this.weapon].mag * 3;
            this.state.message = "";
            this.nextRoundAt = 0;
            this.state.reloading = false;
            this.camera.position.set(0, 1.7, 17);
            this.firing = false;
          }
        }
      }
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        this.aiming ? (this.weapon === "awp" ? 28 : 53) : 75,
        0.18,
      );
      this.camera.updateProjectionMatrix();
      this.recoil = Math.max(0, this.recoil - dt * 0.5);
      this.gun.position.set(
        this.aiming ? 0.075 : 0.29,
        -0.27 +
          (this.state.reloading ? -0.22 : 0) +
          Math.sin(this.elapsed * 9) * (this.keys.size ? 0.007 : 0.002),
        -0.38 + this.recoil,
      );
      this.gun.rotation.x = this.state.reloading ? -0.5 : this.recoil;
      this.flash.visible = this.elapsed - this.lastShot < 0.045 && this.lastShot > 0;
      if (this.clock.elapsedTime - this.lastUI > 0.07) {
        this.lastUI = this.clock.elapsedTime;
        this.publish();
      }
    }
    for (const obj of [...this.scene.children])
      if (obj.userData.expires && obj.userData.expires < this.elapsed) {
        this.scene.remove(obj);
        this.disposeObject(obj);
      }
    this.renderer.render(this.scene, this.camera);
  };
  private disposeObject(object: THREE.Object3D) {
    object.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if ("map" in m) (m.map as THREE.Texture | undefined)?.dispose();
          m.dispose();
        });
      }
    });
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.pause();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("mousemove", this.mousemove);
    document.removeEventListener("mouseup", this.mouseup);
    document.removeEventListener("pointerlockchange", this.lockchange);
    this.renderer.domElement.removeEventListener("mousedown", this.mousedown);
    this.renderer.domElement.removeEventListener("contextmenu", this.contextmenu);
    this.disposeObject(this.scene);
    this.mapSources.forEach((m) => this.disposeObject(m));
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.audio?.close();
  }
}
