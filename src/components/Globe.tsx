// @ts-nocheck
'use client'

import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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

function dampV(a: number, b: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt))
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTINENT DATA — Real geographic polygons encoded as [lat, lng] pairs
// Used to determine where dots should appear on the sphere
// ═══════════════════════════════════════════════════════════════════════════
const CONTINENTS: number[][][] = [
  // North America
  [[70,-165],[72,-130],[70,-100],[65,-85],[60,-80],[55,-65],[48,-55],[45,-65],[42,-70],[30,-80],[25,-80],[20,-90],[15,-85],[10,-75],[8,-77],[10,-85],[15,-92],[20,-105],[25,-110],[30,-115],[35,-120],[40,-124],[48,-125],[55,-130],[60,-140],[65,-168]],
  // Central America
  [[20,-90],[18,-88],[16,-88],[14,-87],[10,-84],[8,-80],[8,-77],[10,-75],[15,-85],[20,-90]],
  // South America
  [[12,-72],[10,-65],[7,-55],[2,-50],[-5,-35],[-10,-37],[-15,-39],[-20,-40],[-25,-48],[-30,-50],[-35,-57],[-40,-62],[-45,-65],[-50,-68],[-55,-68],[-55,-64],[-50,-60],[-40,-57],[-35,-55],[-30,-48],[-25,-42],[-20,-42],[-15,-47],[-10,-50],[-5,-52],[0,-50],[2,-55],[5,-60],[8,-63],[10,-67]],
  // Europe
  [[72,-25],[71,30],[70,40],[65,30],[60,30],[58,25],[55,20],[50,15],[48,5],[45,-1],[43,-8],[37,-8],[36,-5],[38,0],[40,2],[42,3],[43,5],[44,8],[42,12],[40,15],[38,20],[35,25],[40,28],[42,30],[45,30],[48,18],[50,20],[52,22],[55,25],[58,30],[60,32],[65,35],[70,40],[72,35]],
  // Africa
  [[37,-8],[35,-5],[35,0],[33,10],[30,32],[25,35],[20,38],[15,42],[12,44],[8,50],[5,42],[0,42],[-5,40],[-10,40],[-15,35],[-20,35],[-25,33],[-30,30],[-35,20],[-35,18],[-30,17],[-25,15],[-20,12],[-15,12],[-10,14],[-5,10],[0,10],[5,5],[5,0],[3,-5],[5,-8],[10,-15],[15,-17],[20,-17],[25,-15],[30,-10],[35,-5]],
  // Asia (main)
  [[72,40],[75,60],[75,90],[73,120],[70,140],[65,140],[60,135],[55,135],[50,130],[45,135],[40,140],[35,140],[30,130],[25,120],[22,115],[20,110],[15,108],[10,105],[5,100],[0,100],[-5,105],[-8,115],[-5,120],[0,118],[5,115],[10,110],[15,110],[20,107],[22,100],[20,95],[15,80],[10,78],[5,78],[8,75],[15,72],[22,70],[25,62],[30,50],[32,45],[35,38],[38,35],[40,40],[42,50],[45,55],[50,55],[55,60],[60,60],[65,55],[70,45]],
  // India
  [[32,72],[30,78],[28,82],[26,85],[23,88],[22,90],[20,87],[15,80],[10,78],[8,77],[8,75],[10,73],[15,72],[20,70],[22,68],[25,67],[28,68],[30,70]],
  // Japan
  [[45,140],[43,145],[40,141],[37,140],[35,136],[33,131],[31,131],[33,133],[35,135],[37,137],[39,140],[42,143],[45,145]],
  // Australia
  [[-12,130],[-12,135],[-15,140],[-18,145],[-23,150],[-28,153],[-33,152],[-37,150],[-38,145],[-37,140],[-35,137],[-32,134],[-30,130],[-25,128],[-22,114],[-20,115],[-18,122],[-15,130]],
  // Indonesia
  [[-2,100],[-5,105],[-7,110],[-8,115],[-8,120],[-5,120],[-3,115],[-2,110],[-1,105]],
  // UK/Ireland
  [[58,-6],[57,-2],[55,0],[53,1],[51,1],[50,-5],[51,-5],[52,-4],[54,-5],[56,-5]],
  // Greenland
  [[84,-30],[82,-20],[78,-18],[72,-22],[70,-25],[68,-30],[65,-45],[68,-55],[72,-58],[76,-60],[80,-50],[83,-40]],
  // Middle East
  [[38,35],[35,38],[30,48],[25,55],[20,45],[15,42],[15,50],[20,55],[25,56],[28,50],[30,48],[32,36]],
  // New Zealand
  [[-35,173],[-38,175],[-42,174],[-46,168],[-44,168],[-42,172],[-38,176],[-35,173]],
  // Sri Lanka
  [[10,80],[8,82],[7,80],[8,78],[10,80]],
  // Madagascar
  [[-12,49],[-16,47],[-20,44],[-24,44],[-25,47],[-20,49],[-16,50],[-12,49]],
]

// Point-in-polygon test (ray casting)
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1]
    const yj = polygon[j][0], xj = polygon[j][1]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function isLand(lat: number, lng: number): boolean {
  for (const poly of CONTINENTS) {
    if (pointInPolygon(lat, lng, poly)) return true
  }
  return false
}

// ═══════════════════════════════════════════════════════════════════════════
// DOT MATRIX EARTH — Stripe-style twinkling dots
// ═══════════════════════════════════════════════════════════════════════════
function DotEarth() {
  const { positions, colors, phases, count } = useMemo(() => {
    const DOT_DENSITY = 28000 // total candidate dots
    const pos: number[] = []
    const col: number[] = []
    const ph: number[] = []

    // Use Fibonacci sphere distribution for even spacing
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    
    for (let i = 0; i < DOT_DENSITY; i++) {
      const y = 1 - (i / (DOT_DENSITY - 1)) * 2 // -1 to 1
      const radius = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i
      
      const lat = Math.asin(y) * (180 / Math.PI)
      const lng = ((theta * 180 / Math.PI) % 360) - 180
      
      if (isLand(lat, lng)) {
        const v = latLngToVector3(lat, lng, 2.0)
        pos.push(v.x, v.y, v.z)
        
        // Warm white/cream color with slight variation
        const brightness = 0.6 + Math.random() * 0.4
        col.push(
          brightness * (0.9 + Math.random() * 0.1),
          brightness * (0.85 + Math.random() * 0.1),
          brightness * (0.7 + Math.random() * 0.15)
        )
        
        // Random phase for twinkling
        ph.push(Math.random() * Math.PI * 2)
      }
    }
    
    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(col),
      phases: new Float32Array(ph),
      count: pos.length / 3,
    }
  }, [])

  const pointsRef = useRef<THREE.Points>(null)
  const baseColors = useRef(colors)
  
  // Custom shader for twinkling
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 2.5 },
    },
    vertexShader: `
      attribute float phase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        // Twinkle: gentle brightness oscillation per dot
        float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + phase * 6.28);
        vAlpha = twinkle;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // Circular dot with soft edge
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.2, d) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta
  })

  return (
    <points ref={pointsRef} material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aColor" count={count} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-phase" count={count} array={phases} itemSize={1} />
      </bufferGeometry>
    </points>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OCEAN SPHERE — Dark base with subtle grid
// ═══════════════════════════════════════════════════════════════════════════
function OceanSphere() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        // Near-black ocean with very subtle blue
        vec3 ocean = vec3(0.008, 0.012, 0.025);
        
        // Faint grid
        float latLine = smoothstep(0.988, 1.0, abs(sin(vUv.y * 3.14159 * 18.0)));
        float lngLine = smoothstep(0.988, 1.0, abs(sin(vUv.x * 3.14159 * 36.0)));
        float grid = max(latLine, lngLine) * 0.03;
        ocean += vec3(grid * 0.4, grid * 0.35, grid * 0.2);
        
        // Fresnel rim
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 4.0);
        ocean += vec3(0.02, 0.03, 0.06) * fresnel;
        
        // Edge darkening
        float edgeDarken = pow(max(dot(viewDir, vNormal), 0.0), 0.6);
        ocean *= mix(0.4, 1.0, edgeDarken);
        
        gl_FragColor = vec4(ocean, 1.0);
      }
    `,
  }), [])

  return (
    <mesh material={material}>
      <sphereGeometry args={[1.99, 64, 64]} />
    </mesh>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ATMOSPHERE — Subtle warm glow
// ═══════════════════════════════════════════════════════════════════════════
function Atmosphere() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.5);
        vec3 color = mix(vec3(0.04, 0.06, 0.15), vec3(0.2, 0.15, 0.05), fresnel);
        gl_FragColor = vec4(color, fresnel * 0.35);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), [])

  return (
    <mesh material={material}>
      <sphereGeometry args={[2.12, 48, 48]} />
    </mesh>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE LINES — Gold arcs
// ═══════════════════════════════════════════════════════════════════════════
function RouteLine({ from, to, progress = 1 }: {
  from: { lat: number; lng: number }; to: { lat: number; lng: number }; progress?: number
}) {
  const geometry = useMemo(() => {
    const start = latLngToVector3(from.lat, from.lng, 2.01)
    const end = latLngToVector3(to.lat, to.lng, 2.01)
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const distance = start.distanceTo(end)
    mid.normalize().multiplyScalar(2.01 + distance * 0.2)
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const pts = curve.getPoints(80)
    const count = Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))
    return new THREE.BufferGeometry().setFromPoints(pts.slice(0, count))
  }, [from, to, progress])

  if (progress <= 0) return null
  return (
    <group>
      <line geometry={geometry}>
        <lineBasicMaterial color="#c9a227" transparent opacity={Math.min(progress * 2, 0.85)} />
      </line>
      <line geometry={geometry}>
        <lineBasicMaterial color="#e8d48a" transparent opacity={Math.min(progress, 0.15)} />
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
    <group>{visibleRoutes.map((r, i) => <RouteLine key={i} from={r.from} to={r.to} progress={r.progress} />)}</group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CITY MARKERS — Clean dots with pulse
// ═══════════════════════════════════════════════════════════════════════════
function CityMarker({ lat, lng, isPeak = false, isOrigin = false, isActive = false }: {
  lat: number; lng: number; isPeak?: boolean; isOrigin?: boolean; isActive?: boolean
}) {
  const glowRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  const color = isOrigin ? '#f5f3ef' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.025 : isPeak ? 0.03 : 0.018

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (glowRef.current && (isActive || isPeak)) {
      glowRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.3)
    }
    if (pulseRef.current && isActive) {
      const c = (t * 0.6) % 1
      pulseRef.current.scale.setScalar(1 + c * 6);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - c) * 0.4
    }
  })

  return (
    <group position={position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={isActive ? 1 : 0.7} />
      </mesh>
      {isActive && (
        <mesh ref={pulseRef}>
          <ringGeometry args={[size * 2, size * 3, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL-DRIVEN CAMERA — FAST transitions (leads the cards)
// ═══════════════════════════════════════════════════════════════════════════
function ScrollCamera({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree()
  const chapters = journey.chapters

  const targets = useMemo(() => {
    const allCoords = [origin, ...chapters.map(c => c.coordinates)]
    return allCoords.map((coord) => {
      const surface = latLngToVector3(coord.lat, coord.lng, 2.0)
      const camPos = surface.clone().normalize().multiplyScalar(4.5)
      camPos.y += 0.4
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

    // FAST damping — globe leads the cards
    const lambda = 6.0
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
      <ambientLight intensity={0.05} />
      <OceanSphere />
      <DotEarth />
      <Atmosphere />
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
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ background: '#0a0a0f' }}
      >
        <color attach="background" args={['#0a0a0f']} />
        <Scene scrollProgress={scrollProgress} activeIndex={activeIndex} />
      </Canvas>
    </div>
  )
}
