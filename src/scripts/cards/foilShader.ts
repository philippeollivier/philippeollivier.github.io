export const foilVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const foilFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uInspectAmt;
  uniform float uAspect;
  uniform float uCornerRadius;
  uniform float uOpacity;
  uniform vec2 uArtUvMin;
  uniform vec2 uArtUvMax;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  // smooth rainbow from hue parameter (cycle = 1.0)
  vec3 hue(float h) {
    h = fract(h);
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // SDF of rounded rect
  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Linear → sRGB (so the texture passes through at its native brightness)
  vec3 linearToSrgb(vec3 c) {
    vec3 lo = 12.92 * c;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, step(c, vec3(0.0031308)));
  }

  void main() {
    // ---- rounded-corner mask ----
    vec2 centered = vUv - 0.5;
    vec2 halfExt = vec2(uAspect, 1.0) * 0.5;
    vec2 p = centered * vec2(uAspect, 1.0);
    float sd = sdRoundedBox(p, halfExt, uCornerRadius);
    if (sd > 0.0) discard;
    float edgeAA = 1.0 - smoothstep(-0.004, 0.0, sd);

    // ---- sample art with border trim ----
    vec2 artUv = mix(uArtUvMin, uArtUvMax, vUv);
    vec4 art = texture2D(uMap, artUv);
    // Texture is tagged sRGB so the sample gives us linear values; convert to
    // sRGB display space up front so the foil additions below behave intuitively
    // (small values stay small) and the output matches the source PNG brightness.
    vec3 base = linearToSrgb(art.rgb);

    // ---- holographic glare (PURE ADDITIVE — never darkens the base) ----
    float vDotN = clamp(dot(vViewDir, vWorldNormal), 0.0, 1.0);
    float fr = pow(1.0 - vDotN, 1.8);

    // ONE broad iridescent band sweeping the card (no fine stripes / micro-scratches).
    // The band drifts with view angle, card tilt, and slow time.
    float band = vUv.x * 0.55 + vUv.y * 0.25
               + fr * 0.7
               + uPointer.x * 0.45 - uPointer.y * 0.20
               + uTime * 0.03;
    vec3 holo = hue(band) + hue(band + 0.07) * 0.4;

    // Broad secondary wave — full card-scale, not micro-stripes
    float wave = sin((vUv.x + vUv.y * 0.4) * 6.2832 + uPointer.x * 1.2) * 0.5 + 0.5;
    wave = pow(wave, 2.0);

    // Sparse, low-frequency sparkle (still card-scale)
    float n = noise(vUv * 50.0 + uTime * 0.12);
    float sparkle = smoothstep(0.92, 1.0, n) * (0.30 + 0.35 * fr);

    // Intensity in sRGB display space — values are intuitive (0.05 = subtle, 0.20 = strong)
    float baseIntensity = 0.05 + 0.10 * fr;
    float intensity = baseIntensity * (0.65 + 0.35 * uInspectAmt);

    // PURE ADDITIVE composition — every term only adds light, never subtracts.
    vec3 glare = holo * intensity * (0.50 + 0.65 * wave)
               + vec3(sparkle) * (0.10 + 0.12 * uInspectAmt);

    vec3 outColor = clamp(base + glare, 0.0, 1.0);

    gl_FragColor = vec4(outColor, art.a * edgeAA * uOpacity);
  }
`;
