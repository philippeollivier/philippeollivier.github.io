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

// Looping horizontal carousel: consistent X-spacing, no rotation. Each card sits
// at offset · SPACING · CARD_W from the focus. The deck wraps modulo N so dragging
// past the last card loops back to the first — the wrap boundary is in the faded
// (invisible) zone so the teleport never shows.
const STACK_SPACING = 1.1;    // > 1.0 = clear gap between adjacent cards (no overlap)
const FADE_START = 2;
const FADE_END = 3.5;
const AUTO_SCROLL_SPEED = 0.25; // cards per second; runs until first user input

interface CardInstance {
  data: CardData;
  index: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

// Inspect settings — desktop / landscape (ortho: depth-free, scale carries the pop)
const INSPECT_Z_DESKTOP = 3.2;
const INSPECT_SCALE_DESKTOP = 1.35;
const INSPECT_X_LANDSCAPE = -1.2;

// Inspect settings — mobile / portrait (card fits with room for text below)
const INSPECT_Z_MOBILE = 1.4;
const INSPECT_SCALE_MOBILE = 1.15;

const INSPECT_TILT_Y = 0.45;       // max rad
const INSPECT_TILT_X = 0.30;
const LANDSCAPE_ASPECT = 1.15;     // viewport aspect threshold for landscape layout

// Orthographic frustum heights — chosen to match the apparent card size that the
// previous perspective camera produced (FOV 34°, z 8 / z 10).
const ORTHO_HEIGHT_LANDSCAPE = 4.9;
const ORTHO_HEIGHT_PORTRAIT = 6.2;

export function mountCards(container: HTMLElement, overlay: OverlayRefs) {
  // ---------- renderer / scene / camera ----------
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Taller frustum on portrait so cards aren't oversized on phones
    const frustumH = aspect < LANDSCAPE_ASPECT ? ORTHO_HEIGHT_PORTRAIT : ORTHO_HEIGHT_LANDSCAPE;
    const halfH = frustumH / 2;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
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
  let autoScrollActive = true;
  let lastTime = performance.now();

  function stopAutoScroll() {
    autoScrollActive = false;
  }

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
    stopAutoScroll();
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
    focusTarget = dragStartFocus - (dx / rect.width) * 6;
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
      // Compare mod N: the clicked card.index represents the same on-screen card
      // as any focusInt that's congruent modulo cards.length.
      if (mod(idx - focusInt, cards.length) === 0) enterInspect(idx);
      else focusTarget = nearestEquivalent(idx, focusInt, cards.length);
    } else {
      focusTarget = Math.round(focusTarget);
    }
  });

  renderer.domElement.addEventListener('pointercancel', () => {
    dragging = false;
  });

  renderer.domElement.addEventListener('wheel', (e) => {
    if (inspectIndex !== -1) return;
    stopAutoScroll();
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    focusTarget = focusTarget + delta * 0.004;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inspectIndex !== -1) {
      exitInspect();
    } else if (inspectIndex === -1) {
      if (e.key === 'ArrowRight') { stopAutoScroll(); focusTarget = Math.round(focusTarget) + 1; }
      else if (e.key === 'ArrowLeft') { stopAutoScroll(); focusTarget = Math.round(focusTarget) - 1; }
      else if (e.key === 'Enter') { stopAutoScroll(); enterInspect(mod(Math.round(focusIndex), cards.length)); }
    }
  });

  // ---------- per-frame layout ----------
  function updateLayout(dt: number) {
    if (autoScrollActive && inspectIndex === -1) {
      focusTarget += AUTO_SCROLL_SPEED * dt;
    }
    focusIndex = damp(focusIndex, focusTarget, 12, dt);
    const targetInspect = inspectIndex !== -1 ? 1 : 0;
    inspectAmt = damp(inspectAmt, targetInspect, 9, dt);
    pointer.x = damp(pointer.x, pointerTarget.x, 10, dt);
    pointer.y = damp(pointer.y, pointerTarget.y, 10, dt);

    const landscape = isLandscape();
    const inspectTargetX = landscape ? INSPECT_X_LANDSCAPE : 0;
    const inspectTargetZ = landscape ? INSPECT_Z_DESKTOP : INSPECT_Z_MOBILE;
    const inspectTargetScale = landscape ? INSPECT_SCALE_DESKTOP : INSPECT_SCALE_MOBILE;

    const N = cards.length;
    for (const card of cards) {
      // Wrap the offset into [-N/2, +N/2] so cards loop around the focus.
      // The "long way around" is suppressed: card N-1 with focus near 0 displays
      // at offset -1 (left of focus), not +N-1 (far off-screen right).
      const rawOffset = card.index - focusIndex;
      const offset = mod(rawOffset + N / 2, N) - N / 2;
      const absOff = Math.abs(offset);

      // Plain horizontal carousel: consistent spacing, no rotation, flat Z.
      const stackX = offset * STACK_SPACING * CARD_W;
      const stackY = 0;
      const stackZ = 0;
      const stackRotY = 0;
      const stackScale = 1.0;
      const stackFade = clamp(1 - (absOff - FADE_START) / (FADE_END - FADE_START), 0, 1);

      const isInspected = card.index === inspectIndex;
      const t = inspectAmt;

      if (isInspected) {
        card.mesh.position.x = lerp(stackX, inspectTargetX, t);
        card.mesh.position.y = lerp(stackY, 0, t);
        card.mesh.position.z = lerp(stackZ, inspectTargetZ, t);
        card.mesh.rotation.x = lerp(0, -pointer.y * INSPECT_TILT_X, t);
        card.mesh.rotation.y = lerp(stackRotY, pointer.x * INSPECT_TILT_Y, t);
        card.mesh.rotation.z = 0;
        card.mesh.scale.setScalar(lerp(stackScale, inspectTargetScale, t));
        card.material.uniforms.uOpacity.value = 1;
        card.material.uniforms.uInspectAmt.value = t;
        card.material.visible = true;
        card.mesh.renderOrder = 100000;
      } else {
        card.mesh.position.set(stackX, stackY, stackZ);
        card.mesh.rotation.set(0, stackRotY, 0);
        card.mesh.scale.setScalar(stackScale);
        const op = stackFade * (1 - t * 0.95);
        card.material.uniforms.uOpacity.value = op;
        card.material.uniforms.uInspectAmt.value = 0;
        card.material.visible = op > 0.01;
        // Closer to focus = on top, so the focused card sits above the cards
        // peeking out on either side.
        card.mesh.renderOrder = -absOff;
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
    autoScrollActive = false;
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
// Math-mod (not JS %): handles negative dividends so the result is always in [0, n).
function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}
// The representative of `target` modulo `n` that's closest to `anchor`. Used to
// route focus animations the short way around the loop instead of unwinding.
function nearestEquivalent(target: number, anchor: number, n: number) {
  return anchor + (mod(target - anchor + n / 2, n) - n / 2);
}
