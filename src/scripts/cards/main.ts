import * as THREE from 'three';
import { CARDS, type CardData } from '../../data/cards';
import { foilVertexShader, foilFragmentShader } from './foilShader';

export interface OverlayRefs {
  root: HTMLElement;
  name: HTMLElement;
  artist: HTMLElement;
  hint: HTMLElement;
}

// ---------- geometry / layout constants ----------
// PNG card art: 822 × 1122 px with a 30px printer-bleed border on all sides.
// After trimming, the visible art is 762 × 1062 px.
const ART_TRIM_PX = 36;
const ART_SRC_W = 822;
const ART_SRC_H = 1122;
const ART_UV_MIN_X = ART_TRIM_PX / ART_SRC_W;
const ART_UV_MIN_Y = ART_TRIM_PX / ART_SRC_H;
const ART_UV_MAX_X = (ART_SRC_W - ART_TRIM_PX) / ART_SRC_W;
const ART_UV_MAX_Y = (ART_SRC_H - ART_TRIM_PX) / ART_SRC_H;

// Card geometry uses the trimmed aspect (the visible art region after bleed)
const CARD_W = 1.6;
const CARD_ASPECT_PX = (ART_SRC_W - 2 * ART_TRIM_PX) / (ART_SRC_H - 2 * ART_TRIM_PX);
const CARD_H = CARD_W / CARD_ASPECT_PX;

// MTG card: 63mm wide, 88mm tall, ~3.18mm corner radius → 0.0505 of short edge.
// SDF radius is in card-height-normalized units, so divide by (h/w) factor.
const MTG_CORNER_FRAC = 0.0505;
const CARD_CORNER_RADIUS = MTG_CORNER_FRAC * (CARD_W / CARD_H);

// Horizontal stack: each card offset from focus by SPACING in x; left cards stack on top.
const STACK_SPACING = 0.30;      // fraction of CARD_W between adjacent card centers (70% overlap)
const FADE_START = 5;            // offsets within this stay fully opaque
const FADE_END = 9;              // offsets beyond this are fully hidden

interface CardInstance {
  data: CardData;
  index: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

const INSPECT_Z = 3.2;
const INSPECT_SCALE = 1.45;
const INSPECT_TILT_Y = 0.45;       // max rad
const INSPECT_TILT_X = 0.30;
const INSPECT_X_LANDSCAPE = -1.2;  // shift card left when text is on right
const LANDSCAPE_ASPECT = 1.15;     // viewport aspect threshold for landscape layout

export function mountCards(container: HTMLElement, overlay: OverlayRefs) {
  // ---------- renderer / scene / camera ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- cards ----------
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const cards: CardInstance[] = CARDS.map((data, index) => {
    const material = new THREE.ShaderMaterial({
      vertexShader: foilVertexShader,
      fragmentShader: foilFragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: null as THREE.Texture | null },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uInspectAmt: { value: 0 },
        uAspect: { value: CARD_W / CARD_H },
        uCornerRadius: { value: CARD_CORNER_RADIUS },
        uOpacity: { value: 1 },
        uArtUvMin: { value: new THREE.Vector2(ART_UV_MIN_X, ART_UV_MIN_Y) },
        uArtUvMax: { value: new THREE.Vector2(ART_UV_MAX_X, ART_UV_MAX_Y) },
      },
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.index = index;
    scene.add(mesh);

    loader.load(data.image, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      material.uniforms.uMap.value = tex;
    });

    return { data, index, mesh, material };
  });

  // ---------- state ----------
  const initialFocus = Math.floor((cards.length - 1) / 2);
  let focusIndex = initialFocus;
  let focusTarget = initialFocus;
  let inspectIndex = -1;     // -1 when not inspecting
  let inspectAmt = 0;        // animated 0..1
  const pointer = new THREE.Vector2(0, 0);       // smoothed pointer in NDC
  const pointerTarget = new THREE.Vector2(0, 0); // raw pointer in NDC
  let dragging = false;
  let dragStartX = 0;
  let dragStartFocus = 0;
  let dragMoved = 0;
  let lastTime = performance.now();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickCardIndex(clientX: number, clientY: number): number {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const meshes = cards.filter(c => c.material.visible).map(c => c.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return -1;
    // With a horizontal stack many cards overlap. Pick the card whose center
    // is nearest the click in screen space — feels natural to users.
    const tmp = new THREE.Vector3();
    let bestIdx = -1;
    let bestDist = Infinity;
    for (const hit of hits) {
      hit.object.getWorldPosition(tmp);
      tmp.project(camera);
      const d = Math.hypot(tmp.x - ndc.x, tmp.y - ndc.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = hit.object.userData.index as number;
      }
    }
    return bestIdx;
  }

  function isLandscape() {
    return renderer.domElement.clientWidth / renderer.domElement.clientHeight >= LANDSCAPE_ASPECT;
  }

  // ---------- interaction ----------
  function updatePointer(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerTarget.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerTarget.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function enterInspect(index: number) {
    inspectIndex = index;
    const card = cards[index];
    overlay.name.textContent = card.data.name;
    overlay.artist.textContent = card.data.artist;
    overlay.root.classList.add('is-active');
    overlay.hint.classList.add('is-hidden');
  }
  function exitInspect() {
    inspectIndex = -1;
    overlay.root.classList.remove('is-active');
    overlay.hint.classList.remove('is-hidden');
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    updatePointer(e.clientX, e.clientY);
    if (inspectIndex !== -1) return; // ignore drag start while inspecting
    dragging = true;
    dragStartX = e.clientX;
    dragStartFocus = focusTarget;
    dragMoved = 0;
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    updatePointer(e.clientX, e.clientY);
    if (!dragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const dx = e.clientX - dragStartX;
    dragMoved = Math.max(dragMoved, Math.abs(dx));
    focusTarget = clamp(dragStartFocus - (dx / rect.width) * 6, 0, cards.length - 1);
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    updatePointer(e.clientX, e.clientY);
    if (inspectIndex !== -1) {
      // Any release while inspecting (no real drag in this mode) → exit
      exitInspect();
      return;
    }
    if (!dragging) return;
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    if (dragMoved < 5) {
      const idx = pickCardIndex(e.clientX, e.clientY);
      const focusInt = Math.round(focusIndex);
      if (idx === -1) return;
      if (idx === focusInt) enterInspect(idx);
      else focusTarget = idx;
    } else {
      focusTarget = clamp(Math.round(focusTarget), 0, cards.length - 1);
    }
  });

  renderer.domElement.addEventListener('pointercancel', () => {
    dragging = false;
  });

  renderer.domElement.addEventListener('wheel', (e) => {
    if (inspectIndex !== -1) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    focusTarget = clamp(focusTarget + delta * 0.004, 0, cards.length - 1);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inspectIndex !== -1) {
      exitInspect();
    } else if (inspectIndex === -1) {
      if (e.key === 'ArrowRight') focusTarget = clamp(Math.round(focusTarget) + 1, 0, cards.length - 1);
      else if (e.key === 'ArrowLeft') focusTarget = clamp(Math.round(focusTarget) - 1, 0, cards.length - 1);
      else if (e.key === 'Enter') enterInspect(Math.round(focusIndex));
    }
  });

  // ---------- per-frame layout ----------
  function updateLayout(dt: number) {
    focusIndex = damp(focusIndex, focusTarget, 12, dt);
    const targetInspect = inspectIndex !== -1 ? 1 : 0;
    inspectAmt = damp(inspectAmt, targetInspect, 9, dt);
    pointer.x = damp(pointer.x, pointerTarget.x, 10, dt);
    pointer.y = damp(pointer.y, pointerTarget.y, 10, dt);

    const inspectTargetX = isLandscape() ? INSPECT_X_LANDSCAPE : 0;

    for (const card of cards) {
      const offset = card.index - focusIndex;
      const absOff = Math.abs(offset);

      // Horizontal stack: cards spaced along x, all parallel
      const stackX = offset * CARD_W * STACK_SPACING;
      const stackY = 0;
      // Tiny z stagger so depth-test never z-fights with renderOrder
      const stackZ = -card.index * 0.002;
      // Subtle "pop" of focus: very small scale bump on the focused card
      const focusBoost = Math.exp(-absOff * absOff * 1.2) * 0.08;
      const stackScale = 1.0 + focusBoost;
      const stackFade = clamp(1 - (absOff - FADE_START) / (FADE_END - FADE_START), 0, 1);

      const isInspected = card.index === inspectIndex;
      const t = inspectAmt;

      if (isInspected) {
        card.mesh.position.x = lerp(stackX, inspectTargetX, t);
        card.mesh.position.y = lerp(stackY, 0, t);
        card.mesh.position.z = lerp(stackZ, INSPECT_Z, t);
        card.mesh.rotation.x = lerp(0, -pointer.y * INSPECT_TILT_X, t);
        card.mesh.rotation.y = lerp(0, pointer.x * INSPECT_TILT_Y, t);
        card.mesh.rotation.z = 0;
        card.mesh.scale.setScalar(lerp(stackScale, INSPECT_SCALE, t));
        card.material.uniforms.uOpacity.value = 1;
        card.material.uniforms.uInspectAmt.value = t;
        card.material.visible = true;
        card.mesh.renderOrder = 100000;
      } else {
        card.mesh.position.set(stackX, stackY, stackZ);
        card.mesh.rotation.set(0, 0, 0);
        card.mesh.scale.setScalar(stackScale);
        const op = stackFade * (1 - t * 0.95);
        card.material.uniforms.uOpacity.value = op;
        card.material.uniforms.uInspectAmt.value = 0;
        card.material.visible = op > 0.01;
        // Constant stacking: lower index renders on top.
        // Focused card gets a small boost so it sits a step above its right neighbors.
        const focusBonus = card.index === Math.round(focusIndex) ? 0.5 : 0;
        card.mesh.renderOrder = -card.index + focusBonus;
      }
    }

    // Shared per-frame shader uniforms
    const tSec = performance.now() * 0.001;
    for (const card of cards) {
      card.material.uniforms.uTime.value = tSec;
      card.material.uniforms.uPointer.value.set(pointer.x, pointer.y);
    }
  }

  // ---------- animation loop ----------
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    updateLayout(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Dev-only: ?inspect=N auto-enters inspect mode (skipping damping) for screenshot testing
  const inspectParam = new URLSearchParams(window.location.search).get('inspect');
  if (inspectParam !== null) {
    const idx = clamp(parseInt(inspectParam, 10) || 0, 0, cards.length - 1);
    focusIndex = idx;
    focusTarget = idx;
    enterInspect(idx);
    inspectAmt = 1; // skip damping; visible immediately for headless screenshot
  }

  console.log('[cards] mounted; meshes:', cards.length);

  return () => {
    window.removeEventListener('resize', resize);
    renderer.dispose();
    geometry.dispose();
    for (const c of cards) {
      const tex = c.material.uniforms.uMap.value as THREE.Texture | null;
      if (tex) tex.dispose();
      c.material.dispose();
    }
    renderer.domElement.remove();
  };
}

// ---------- utilities ----------
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function damp(a: number, b: number, lambda: number, dt: number) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
