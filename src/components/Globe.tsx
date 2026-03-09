'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { journey, origin } from '@/data/journey'

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Convert lat/lng to 3D coordinates on sphere
// ═══════════════════════════════════════════════════════════════════════════
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  
  return new THREE.Vector3(x, y, z)
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM SHADERS — Procedural earth, no texture dependencies
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
  
  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  void main() {
    vec2 sphereUv = vUv * vec2(4.0, 2.0);
    
    // Multi-octave noise for continents
    float n1 = snoise(sphereUv * 1.5 + 0.5) * 0.5;
    float n2 = snoise(sphereUv * 3.0 + 1.2) * 0.25;
    float n3 = snoise(sphereUv * 6.0 + 2.7) * 0.125;
    float continent = n1 + n2 + n3;
    
    // Ocean colors — deep and moody
    vec3 oceanDeep = vec3(0.02, 0.04, 0.10);
    vec3 oceanShallow = vec3(0.04, 0.08, 0.18);
    
    // Land colors — muted, elegant
    vec3 landLow = vec3(0.08, 0.10, 0.06);
    vec3 landMid = vec3(0.10, 0.12, 0.08);
    vec3 landHigh = vec3(0.14, 0.13, 0.10);
    
    // Mix ocean
    vec3 ocean = mix(oceanDeep, oceanShallow, snoise(sphereUv * 8.0) * 0.5 + 0.5);
    
    // Mix land elevation
    float elev = smoothstep(0.0, 0.5, continent);
    vec3 land = mix(landLow, mix(landMid, landHigh, elev), elev);
    
    // Combine
    float isLand = smoothstep(-0.02, 0.05, continent);
    vec3 surface = mix(ocean, land, isLand);
    
    // Subtle grid lines (latitude/longitude)
    float latLine = smoothstep(0.98, 1.0, abs(sin(vUv.y * 3.14159 * 12.0)));
    float lngLine = smoothstep(0.98, 1.0, abs(sin(vUv.x * 3.14159 * 24.0)));
    float grid = max(latLine, lngLine) * 0.04;
    surface += vec3(grid) * vec3(0.8, 0.7, 0.4);
    
    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 0.3, 1.0));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.15;
    
    // Fresnel rim
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
    
    // Specular on ocean
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
// EARTH — Procedural, no textures needed
// ═══════════════════════════════════════════════════════════════════════════
function Earth() {
  const earthRef = useRef<THREE.Mesh>(null)
  
  const earthMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      uTime: { value: 0 },
    },
  }), [])
  
  const atmosphereMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), [])
  
  useFrame((state, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.015
    }
    earthMaterial.uniforms.uTime.value += delta
  })
  
  return (
    <group>
      <mesh ref={earthRef} material={earthMaterial}>
        <sphereGeometry args={[2, 128, 128]} />
      </mesh>
      
      {/* Atmosphere glow */}
      <mesh material={atmosphereMaterial}>
        <sphereGeometry args={[2.08, 64, 64]} />
      </mesh>
      
      {/* Outer haze */}
      <mesh>
        <sphereGeometry args={[2.2, 64, 64]} />
        <meshBasicMaterial
          color="#1a2a5a"
          transparent
          opacity={0.04}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED ARC — Glowing route lines
// ═══════════════════════════════════════════════════════════════════════════
function RouteLine({ 
  from, 
  to, 
  progress = 1,
  color = '#c9a227',
}: { 
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  progress?: number
  color?: string
}) {
  const curve = useMemo(() => {
    const start = latLngToVector3(from.lat, from.lng, 2.01)
    const end = latLngToVector3(to.lat, to.lng, 2.01)
    
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const distance = start.distanceTo(end)
    mid.normalize().multiplyScalar(2.01 + distance * 0.2)
    
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to])
  
  const points = useMemo(() => {
    const pts = curve.getPoints(80)
    const count = Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))
    return pts.slice(0, count)
  }, [curve, progress])
  
  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [points])

  if (progress <= 0) return null
  
  return (
    <group>
      <line geometry={geometry}>
        <lineBasicMaterial 
          color={color} 
          transparent 
          opacity={Math.min(progress * 2, 0.9)} 
        />
      </line>
      <line geometry={geometry}>
        <lineBasicMaterial 
          color={color} 
          transparent 
          opacity={Math.min(progress * 1.5, 0.3)} 
        />
      </line>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CITY MARKERS — Pulsing dots with glow rings
// ═══════════════════════════════════════════════════════════════════════════
function CityMarker({ 
  lat, 
  lng, 
  isPeak = false,
  isOrigin = false,
  isActive = false,
}: { 
  lat: number
  lng: number
  isPeak?: boolean
  isOrigin?: boolean
  isActive?: boolean
}) {
  const markerRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  
  const color = isOrigin ? '#ffffff' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.035 : isPeak ? 0.04 : 0.025
  
  useFrame((state) => {
    if (markerRef.current && (isActive || isPeak)) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.2
      markerRef.current.scale.setScalar(scale)
    }
    if (ringRef.current && isActive) {
      const ringScale = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.3
      ringRef.current.scale.setScalar(ringScale)
      const mat = ringRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 1.5) * 0.15
    }
  })
  
  return (
    <group position={position}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color}
          emissiveIntensity={isActive ? 1.2 : isPeak ? 0.6 : 0.2}
        />
      </mesh>
      
      {(isActive || isPeak) && (
        <mesh ref={ringRef}>
          <ringGeometry args={[size * 1.8, size * 2.5, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY ROUTES
// ═══════════════════════════════════════════════════════════════════════════
function JourneyRoutes({ scrollProgress }: { scrollProgress: number }) {
  const chapters = journey.chapters
  
  const routes = useMemo(() => {
    const segments: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = []
    
    segments.push({ from: origin, to: chapters[0].coordinates })
    
    for (let i = 0; i < chapters.length - 1; i++) {
      segments.push({
        from: chapters[i].coordinates,
        to: chapters[i + 1].coordinates,
      })
    }
    
    return segments
  }, [chapters])
  
  const visibleRoutes = useMemo(() => {
    const totalRoutes = routes.length
    const activeRoutes = Math.floor(scrollProgress * totalRoutes)
    const partialProgress = (scrollProgress * totalRoutes) % 1
    
    return routes.map((route, i) => ({
      ...route,
      progress: i < activeRoutes ? 1 : i === activeRoutes ? partialProgress : 0,
    }))
  }, [routes, scrollProgress])
  
  return (
    <group>
      {visibleRoutes.map((route, i) => (
        <RouteLine
          key={i}
          from={route.from}
          to={route.to}
          progress={route.progress}
        />
      ))}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE
// ═══════════════════════════════════════════════════════════════════════════
function Scene({ scrollProgress }: { scrollProgress: number }) {
  const chapters = journey.chapters
  const activeChapterIndex = Math.floor(scrollProgress * chapters.length)
  
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
      {chapters.map((chapter, i) => (
        <CityMarker
          key={chapter.id}
          lat={chapter.coordinates.lat}
          lng={chapter.coordinates.lng}
          isPeak={chapter.isPeak}
          isActive={i === activeChapterIndex}
        />
      ))}
      
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.25}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.7}
        autoRotate
        autoRotateSpeed={0.1}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBE — Exported component
// ═══════════════════════════════════════════════════════════════════════════
export default function Globe({ scrollProgress = 0 }: { scrollProgress?: number }) {
  return (
    <div className="globe-canvas">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
      >
        <Scene scrollProgress={scrollProgress} />
      </Canvas>
    </div>
  )
}