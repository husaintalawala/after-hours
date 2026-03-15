// @ts-nocheck
'use client'

import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { journey, origin } from '@/data/journey'

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

function dampV(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

// ═══════════════════════════════════════════════════════════════════════════
// DARK LUXURY EARTH SHADERS
// Procedural black marble with gold foil continent edges, city lights on
// night side, specular ocean, volumetric atmosphere
// ═══════════════════════════════════════════════════════════════════════════

const earthVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  // ── Simplex noise ──
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // ── Hash for city lights ──
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 sphereUv = vUv * vec2(4.0, 2.0);

    // ── Continent shape (multi-octave noise) ──
    float n1 = snoise(sphereUv * 1.5 + 0.5) * 0.5;
    float n2 = snoise(sphereUv * 3.0 + 1.2) * 0.25;
    float n3 = snoise(sphereUv * 6.0 + 2.7) * 0.125;
    float n4 = snoise(sphereUv * 12.0 + 4.1) * 0.0625;
    float continent = n1 + n2 + n3 + n4;
    float isLand = smoothstep(-0.02, 0.05, continent);

    // ── BLACK MARBLE palette ──
    // Deep ocean — near-black with subtle blue
    vec3 oceanDeep = vec3(0.01, 0.015, 0.04);
    vec3 oceanMid  = vec3(0.015, 0.025, 0.06);
    float oceanVar = snoise(sphereUv * 8.0) * 0.5 + 0.5;
    vec3 ocean = mix(oceanDeep, oceanMid, oceanVar);

    // Dark land — charcoal marble with subtle veining
    vec3 landBase   = vec3(0.04, 0.04, 0.038);
    vec3 landVein   = vec3(0.06, 0.055, 0.05);
    float vein = snoise(sphereUv * 10.0 + 3.3) * 0.5 + 0.5;
    vein = smoothstep(0.3, 0.7, vein);
    vec3 land = mix(landBase, landVein, vein * 0.4);

    // Marble surface
    vec3 surface = mix(ocean, land, isLand);

    // ── GOLD FOIL continent edges ──
    float edgeDist = smoothstep(0.0, 0.04, continent) - smoothstep(0.04, 0.12, continent);
    vec3 goldFoil = vec3(0.78, 0.63, 0.15);
    vec3 goldDark = vec3(0.55, 0.42, 0.10);
    float goldShimmer = snoise(sphereUv * 30.0 + uTime * 0.1) * 0.5 + 0.5;
    vec3 gold = mix(goldDark, goldFoil, goldShimmer);
    surface = mix(surface, gold, edgeDist * 0.85);

    // ── Subtle gold grid lines ──
    float latLine = smoothstep(0.985, 1.0, abs(sin(vUv.y * 3.14159 * 12.0)));
    float lngLine = smoothstep(0.985, 1.0, abs(sin(vUv.x * 3.14159 * 24.0)));
    float grid = max(latLine, lngLine) * 0.025;
    surface += vec3(grid) * goldFoil * 0.3;

    // ── Lighting (cinematic, dramatic) ──
    vec3 lightDir = normalize(vec3(0.6, 0.35, 0.8));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.08;

    // ── Night side ──
    float dayFactor = dot(vWorldNormal, lightDir);
    float nightMask = smoothstep(0.0, -0.15, dayFactor);

    // ── City lights on night side (scattered dots on land) ──
    vec2 cellUv = vUv * vec2(200.0, 100.0);
    vec2 cellId = floor(cellUv);
    float cityHash = hash(cellId);
    float isCity = step(0.92, cityHash) * isLand;
    float cityFlicker = 0.7 + 0.3 * sin(uTime * 2.0 + cityHash * 100.0);
    vec3 cityLight = vec3(1.0, 0.85, 0.5) * isCity * cityFlicker * 0.6;
    surface += cityLight * nightMask;

    // ── Specular on ocean (gold-tinted) ──
    vec3 viewDir = normalize(cameraPosition - vPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 80.0) * (1.0 - isLand);
    vec3 specColor = goldFoil * spec * 0.4;

    // ── Fresnel rim (warm gold on lit side, cool blue on dark) ──
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.5);
    vec3 rimLit  = goldFoil * 0.15;
    vec3 rimDark = vec3(0.08, 0.12, 0.25);
    vec3 rim = mix(rimLit, rimDark, nightMask) * fresnel;

    // ── Scan line (subtle) ──
    float scanY = fract(uTime * 0.02);
    float scanLine = 1.0 - (1.0 - smoothstep(0.0, 0.002, abs(vUv.y - scanY))) * 0.06;

    // ── Compose ──
    vec3 color = surface * (ambient + diffuse * 0.9) * scanLine;
    color += specColor;
    color += rim;

    // ── Subtle vignette darkening toward edges ──
    float edgeDarken = pow(max(dot(viewDir, vNormal), 0.0), 0.5);
    color *= mix(0.3, 1.0, edgeDarken);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Atmosphere: warm gold glow on lit side, cool blue on dark ──
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);

    // Day/night gradient
    vec3 lightDir = normalize(vec3(0.6, 0.35, 0.8));
    float dayFactor = dot(vWorldNormal, lightDir);

    vec3 warmGlow = vec3(0.45, 0.32, 0.08); // gold atmosphere
    vec3 coolGlow = vec3(0.06, 0.10, 0.25);  // deep blue night
    vec3 atmColor = mix(coolGlow, warmGlow, smoothstep(-0.2, 0.3, dayFactor));

    float alpha = fresnel * 0.55;
    gl_FragColor = vec4(atmColor, alpha);
  }
`

// ── Outer halo: soft gold bloom ──
const haloFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 1.5);
    vec3 haloColor = vec3(0.35, 0.25, 0.05);
    gl_FragColor = vec4(haloColor, fresnel * 0.12);
  }
`

// ═══════════════════════════════════════════════════════════════════════════
// EARTH MESH
// ═══════════════════════════════════════════════════════════════════════════
function Earth() {
  const earthMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: { uTime: { value: 0 } },
  }), [])

  const atmosphereMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), [])

  const haloMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader, // reuse vertex
    fragmentShader: haloFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), [])

  useFrame((_, delta) => { earthMaterial.uniforms.uTime.value += delta })

  return (
    <group>
      {/* Earth sphere */}
      <mesh material={earthMaterial}>
        <sphereGeometry args={[2, 128, 128]} />
      </mesh>
      {/* Inner atmosphere */}
      <mesh material={atmosphereMaterial}>
        <sphereGeometry args={[2.06, 64, 64]} />
      </mesh>
      {/* Outer gold halo */}
      <mesh material={haloMaterial}>
        <sphereGeometry args={[2.25, 64, 64]} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE LINES — gold with animated glow
// ═══════════════════════════════════════════════════════════════════════════
function RouteLine({ from, to, progress = 1, color = '#c9a227' }: {
  from: { lat: number; lng: number }; to: { lat: number; lng: number }
  progress?: number; color?: string
}) {
  const curve = useMemo(() => {
    const start = latLngToVector3(from.lat, from.lng, 2.01)
    const end = latLngToVector3(to.lat, to.lng, 2.01)
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const distance = start.distanceTo(end)
    mid.normalize().multiplyScalar(2.01 + distance * 0.22)
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to])

  const geometry = useMemo(() => {
    const pts = curve.getPoints(100)
    const count = Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))
    return new THREE.BufferGeometry().setFromPoints(pts.slice(0, count))
  }, [curve, progress])

  if (progress <= 0) return null
  return (
    <group>
      {/* Core line */}
      <line geometry={geometry}>
        <lineBasicMaterial color="#c9a227" transparent opacity={Math.min(progress * 2, 0.95)} />
      </line>
      {/* Glow line */}
      <line geometry={geometry}>
        <lineBasicMaterial color="#e8d48a" transparent opacity={Math.min(progress * 1.2, 0.2)} />
      </line>
    </group>
  )
}

function JourneyRoutes({ scrollProgress }: { scrollProgress: number }) {
  const chapters = journey.chapters
  const routes = useMemo(() => {
    const segs: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = []
    segs.push({ from: origin, to: chapters[0].coordinates })
    for (let i = 0; i < chapters.length - 1; i++) {
      segs.push({ from: chapters[i].coordinates, to: chapters[i + 1].coordinates })
    }
    return segs
  }, [chapters])

  const visibleRoutes = useMemo(() => {
    const n = routes.length
    const active = Math.floor(scrollProgress * n)
    const partial = (scrollProgress * n) % 1
    return routes.map((r, i) => ({ ...r, progress: i < active ? 1 : i === active ? partial : 0 }))
  }, [routes, scrollProgress])

  return (
    <group>
      {visibleRoutes.map((r, i) => <RouteLine key={i} from={r.from} to={r.to} progress={r.progress} />)}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CITY MARKERS — gold diamond with radar pulse
// ═══════════════════════════════════════════════════════════════════════════
function CityMarker({ lat, lng, isPeak = false, isOrigin = false, isActive = false }: {
  lat: number; lng: number; isPeak?: boolean; isOrigin?: boolean; isActive?: boolean
}) {
  const markerRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const pulse2Ref = useRef<THREE.Mesh>(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  const color = isOrigin ? '#f5f3ef' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.03 : isPeak ? 0.035 : 0.02

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (markerRef.current) {
      // Orient marker to face outward from globe center
      markerRef.current.lookAt(0, 0, 0)
      if (isActive || isPeak) {
        markerRef.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.25)
      }
    }
    if (pulseRef.current && isActive) {
      const c = (t * 0.7) % 1
      pulseRef.current.scale.setScalar(1 + c * 5);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.5
    }
    if (pulse2Ref.current && isActive) {
      const c = ((t * 0.7) + 0.5) % 1
      pulse2Ref.current.scale.setScalar(1 + c * 5);
      (pulse2Ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.35
    }
  })

  return (
    <group position={position}>
      {/* Diamond marker */}
      <mesh ref={markerRef} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isActive ? 1.0 : isPeak ? 0.8 : 0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Inner glow */}
      <mesh>
        <sphereGeometry args={[size * 0.4, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 2.0 : isPeak ? 0.8 : 0.3}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Radar pulse rings */}
      {isActive && (
        <>
          <mesh ref={pulseRef}>
            <ringGeometry args={[size * 1.5, size * 2.2, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={pulse2Ref}>
            <ringGeometry args={[size * 1.5, size * 2.2, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL-DRIVEN CAMERA — cinematic flight
// ═══════════════════════════════════════════════════════════════════════════
function ScrollCamera({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree()
  const chapters = journey.chapters

  const targets = useMemo(() => {
    const allCoords = [origin, ...chapters.map(c => c.coordinates)]
    return allCoords.map((coord) => {
      const surface = latLngToVector3(coord.lat, coord.lng, 2.02)
      const camPos = surface.clone().normalize().multiplyScalar(4.6)
      camPos.y += 0.5
      return camPos
    })
  }, [chapters])

  const currentPos = useRef(new THREE.Vector3(0, 0, 5))

  useFrame((_, delta) => {
    const n = targets.length
    const rawIdx = scrollProgress * (n - 1)
    const idx = Math.floor(rawIdx)
    const t = rawIdx - idx
    const from = targets[Math.min(idx, n - 1)]
    const to = targets[Math.min(idx + 1, n - 1)]
    const eased = t * t * (3 - 2 * t)
    const target = from.clone().lerp(to, eased)

    const lambda = 2.5
    currentPos.current.x = dampV(currentPos.current.x, target.x, lambda, delta)
    currentPos.current.y = dampV(currentPos.current.y, target.y, lambda, delta)
    currentPos.current.z = dampV(currentPos.current.z, target.z, lambda, delta)

    camera.position.copy(currentPos.current)
    camera.lookAt(0, 0, 0)
  })

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// DUST PARTICLES — floating gold motes
// ═══════════════════════════════════════════════════════════════════════════
function GoldDust() {
  const count = 600
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
    }
    return pos
  }, [])

  const ref = useRef<THREE.Points>(null)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.008
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.005) * 0.05
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.008} color="#c9a227" transparent opacity={0.3} sizeAttenuation />
    </points>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE
// ═══════════════════════════════════════════════════════════════════════════
function Scene({ scrollProgress, activeIndex }: { scrollProgress: number; activeIndex: number }) {
  const chapters = journey.chapters
  return (
    <>
      {/* Cinematic lighting */}
      <ambientLight intensity={0.08} color="#1a1520" />
      <directionalLight position={[6, 3.5, 8]} intensity={1.0} color="#f0e6d0" />
      <pointLight position={[-8, -5, -8]} intensity={0.08} color="#3a5a8a" />
      <pointLight position={[3, 8, -3]} intensity={0.06} color="#c9a227" />

      {/* Background stars — fewer, subtler */}
      <Stars radius={300} depth={100} count={2500} factor={2} fade speed={0.3} />

      {/* Gold dust particles */}
      <GoldDust />

      {/* The Globe */}
      <Earth />

      {/* Routes */}
      <JourneyRoutes scrollProgress={scrollProgress} />

      {/* Markers */}
      <CityMarker lat={origin.lat} lng={origin.lng} isOrigin />
      {chapters.map((ch, i) => (
        <CityMarker
          key={ch.id}
          lat={ch.coordinates.lat}
          lng={ch.coordinates.lng}
          isPeak={ch.isPeak}
          isActive={i === activeIndex}
        />
      ))}

      {/* Camera */}
      <ScrollCamera scrollProgress={scrollProgress} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export default function Globe({ scrollProgress = 0, activeIndex = 0 }: { scrollProgress?: number; activeIndex?: number }) {
  return (
    <div className="globe-canvas">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        dpr={[1, 2]}
      >
        <Scene scrollProgress={scrollProgress} activeIndex={activeIndex} />
      </Canvas>
    </div>
  )
}
