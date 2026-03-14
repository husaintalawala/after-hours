// @ts-nocheck
'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
// SHADERS
// ═══════════════════════════════════════════════════════════════════════════
const earthVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
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

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
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

  void main() {
    vec2 sphereUv = vUv * vec2(4.0, 2.0);
    float n1 = snoise(sphereUv * 1.5 + 0.5) * 0.5;
    float n2 = snoise(sphereUv * 3.0 + 1.2) * 0.25;
    float n3 = snoise(sphereUv * 6.0 + 2.7) * 0.125;
    float continent = n1 + n2 + n3;

    vec3 oceanDeep = vec3(0.02, 0.04, 0.10);
    vec3 oceanShallow = vec3(0.04, 0.08, 0.18);
    vec3 landLow = vec3(0.08, 0.10, 0.06);
    vec3 landMid = vec3(0.10, 0.12, 0.08);
    vec3 landHigh = vec3(0.14, 0.13, 0.10);

    vec3 ocean = mix(oceanDeep, oceanShallow, snoise(sphereUv * 8.0) * 0.5 + 0.5);
    float elev = smoothstep(0.0, 0.5, continent);
    vec3 land = mix(landLow, mix(landMid, landHigh, elev), elev);
    float isLand = smoothstep(-0.02, 0.05, continent);
    vec3 surface = mix(ocean, land, isLand);

    float latLine = smoothstep(0.98, 1.0, abs(sin(vUv.y * 3.14159 * 12.0)));
    float lngLine = smoothstep(0.98, 1.0, abs(sin(vUv.x * 3.14159 * 24.0)));
    float grid = max(latLine, lngLine) * 0.04;
    surface += vec3(grid) * vec3(0.8, 0.7, 0.4);

    // Scan line
    float scanY = fract(uTime * 0.03);
    float scanLine = smoothstep(0.0, 0.003, abs(vUv.y - scanY));
    surface += (1.0 - scanLine) * vec3(0.15, 0.25, 0.4) * 0.08;

    vec3 lightDir = normalize(vec3(0.5, 0.3, 1.0));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.15;
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 40.0) * (1.0 - isLand) * 0.3;

    vec3 color = surface * (ambient + diffuse * 0.85);
    color += vec3(spec);
    color += fresnel * vec3(0.15, 0.20, 0.35) * 0.5;
    gl_FragColor = vec4(color, 1.0);
  }
`

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);
    vec3 atmColor = mix(vec3(0.1, 0.15, 0.4), vec3(0.15, 0.25, 0.6), fresnel);
    gl_FragColor = vec4(atmColor, fresnel * 0.6);
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

  useFrame((_, delta) => { earthMaterial.uniforms.uTime.value += delta })

  return (
    <group>
      <mesh material={earthMaterial}>
        <sphereGeometry args={[2, 128, 128]} />
      </mesh>
      <mesh material={atmosphereMaterial}>
        <sphereGeometry args={[2.08, 64, 64]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.2, 64, 64]} />
        <meshBasicMaterial color="#1a2a5a" transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE LINES
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
    mid.normalize().multiplyScalar(2.01 + distance * 0.2)
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to])

  const geometry = useMemo(() => {
    const pts = curve.getPoints(80)
    const count = Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))
    return new THREE.BufferGeometry().setFromPoints(pts.slice(0, count))
  }, [curve, progress])

  if (progress <= 0) return null
  return (
    <group>
      <line geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={Math.min(progress * 2, 0.9)} />
      </line>
      <line geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={Math.min(progress * 1.5, 0.3)} />
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
// CITY MARKERS with radar pulse
// ═══════════════════════════════════════════════════════════════════════════
function CityMarker({ lat, lng, isPeak = false, isOrigin = false, isActive = false }: {
  lat: number; lng: number; isPeak?: boolean; isOrigin?: boolean; isActive?: boolean
}) {
  const markerRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const pulse2Ref = useRef<THREE.Mesh>(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  const color = isOrigin ? '#ffffff' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.035 : isPeak ? 0.04 : 0.025

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (markerRef.current && (isActive || isPeak)) {
      markerRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.2)
    }
    if (pulseRef.current && isActive) {
      const c = (t * 0.8) % 1
      pulseRef.current.scale.setScalar(1 + c * 4);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.4
    }
    if (pulse2Ref.current && isActive) {
      const c = ((t * 0.8) + 0.5) % 1
      pulse2Ref.current.scale.setScalar(1 + c * 4);
      (pulse2Ref.current.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.3
    }
  })

  return (
    <group position={position}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 1.5 : isPeak ? 0.6 : 0.2} />
      </mesh>
      {isActive && (
        <>
          <mesh ref={pulseRef}>
            <ringGeometry args={[size * 1.5, size * 2, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={pulse2Ref}>
            <ringGeometry args={[size * 1.5, size * 2, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL-DRIVEN CAMERA
// ═══════════════════════════════════════════════════════════════════════════
function ScrollCamera({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree()
  const chapters = journey.chapters

  const targets = useMemo(() => {
    const allCoords = [origin, ...chapters.map(c => c.coordinates)]
    return allCoords.map((coord) => {
      const surface = latLngToVector3(coord.lat, coord.lng, 2.02)
      const camPos = surface.clone().normalize().multiplyScalar(4.8)
      camPos.y += 0.6
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

    const lambda = 3.0
    currentPos.current.x = dampV(currentPos.current.x, target.x, lambda, delta)
    currentPos.current.y = dampV(currentPos.current.y, target.y, lambda, delta)
    currentPos.current.z = dampV(currentPos.current.z, target.z, lambda, delta)

    camera.position.copy(currentPos.current)
    camera.lookAt(0, 0, 0)
  })

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE
// ═══════════════════════════════════════════════════════════════════════════
function Scene({ scrollProgress, activeIndex }: { scrollProgress: number; activeIndex: number }) {
  const chapters = journey.chapters
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#e8e0d0" />
      <pointLight position={[-8, -5, -8]} intensity={0.15} color="#4a6aaa" />
      <pointLight position={[3, 8, -3]} intensity={0.1} color="#c9a227" />
      <Stars radius={200} depth={80} count={4000} factor={3} fade speed={0.5} />
      <Earth />
      <JourneyRoutes scrollProgress={scrollProgress} />
      <CityMarker lat={origin.lat} lng={origin.lng} isOrigin />
      {chapters.map((ch, i) => (
        <CityMarker key={ch.id} lat={ch.coordinates.lat} lng={ch.coordinates.lng} isPeak={ch.isPeak} isActive={i === activeIndex} />
      ))}
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
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <Scene scrollProgress={scrollProgress} activeIndex={activeIndex} />
      </Canvas>
    </div>
  )
}
