// @ts-nocheck
'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { journey, origin } from '@/data/journey'

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function dampV(a, b, lambda, dt) {
  return THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt))
}

const CONTINENTS = [
  [[70,-165],[72,-130],[70,-100],[65,-85],[60,-80],[55,-65],[48,-55],[45,-65],[42,-70],[30,-80],[25,-80],[20,-90],[15,-85],[10,-75],[8,-77],[10,-85],[15,-92],[20,-105],[25,-110],[30,-115],[35,-120],[40,-124],[48,-125],[55,-130],[60,-140],[65,-168]],
  [[20,-90],[18,-88],[16,-88],[14,-87],[10,-84],[8,-80],[8,-77],[10,-75],[15,-85],[20,-90]],
  [[12,-72],[10,-65],[7,-55],[2,-50],[-5,-35],[-10,-37],[-15,-39],[-20,-40],[-25,-48],[-30,-50],[-35,-57],[-40,-62],[-45,-65],[-50,-68],[-55,-68],[-55,-64],[-50,-60],[-40,-57],[-35,-55],[-30,-48],[-25,-42],[-20,-42],[-15,-47],[-10,-50],[-5,-52],[0,-50],[2,-55],[5,-60],[8,-63],[10,-67]],
  [[72,-25],[71,30],[70,40],[65,30],[60,30],[58,25],[55,20],[50,15],[48,5],[45,-1],[43,-8],[37,-8],[36,-5],[38,0],[40,2],[42,3],[43,5],[44,8],[42,12],[40,15],[38,20],[35,25],[40,28],[42,30],[45,30],[48,18],[50,20],[52,22],[55,25],[58,30],[60,32],[65,35],[70,40],[72,35]],
  [[37,-8],[35,-5],[35,0],[33,10],[30,32],[25,35],[20,38],[15,42],[12,44],[8,50],[5,42],[0,42],[-5,40],[-10,40],[-15,35],[-20,35],[-25,33],[-30,30],[-35,20],[-35,18],[-30,17],[-25,15],[-20,12],[-15,12],[-10,14],[-5,10],[0,10],[5,5],[5,0],[3,-5],[5,-8],[10,-15],[15,-17],[20,-17],[25,-15],[30,-10],[35,-5]],
  [[72,40],[75,60],[75,90],[73,120],[70,140],[65,140],[60,135],[55,135],[50,130],[45,135],[40,140],[35,140],[30,130],[25,120],[22,115],[20,110],[15,108],[10,105],[5,100],[0,100],[-5,105],[-8,115],[-5,120],[0,118],[5,115],[10,110],[15,110],[20,107],[22,100],[20,95],[15,80],[10,78],[5,78],[8,75],[15,72],[22,70],[25,62],[30,50],[32,45],[35,38],[38,35],[40,40],[42,50],[45,55],[50,55],[55,60],[60,60],[65,55],[70,45]],
  [[32,72],[30,78],[28,82],[26,85],[23,88],[22,90],[20,87],[15,80],[10,78],[8,77],[8,75],[10,73],[15,72],[20,70],[22,68],[25,67],[28,68],[30,70]],
  [[45,140],[43,145],[40,141],[37,140],[35,136],[33,131],[31,131],[33,133],[35,135],[37,137],[39,140],[42,143],[45,145]],
  [[-12,130],[-12,135],[-15,140],[-18,145],[-23,150],[-28,153],[-33,152],[-37,150],[-38,145],[-37,140],[-35,137],[-32,134],[-30,130],[-25,128],[-22,114],[-20,115],[-18,122],[-15,130]],
  [[-2,100],[-5,105],[-7,110],[-8,115],[-8,120],[-5,120],[-3,115],[-2,110],[-1,105]],
  [[58,-6],[57,-2],[55,0],[53,1],[51,1],[50,-5],[51,-5],[52,-4],[54,-5],[56,-5]],
  [[84,-30],[82,-20],[78,-18],[72,-22],[70,-25],[68,-30],[65,-45],[68,-55],[72,-58],[76,-60],[80,-50],[83,-40]],
  [[38,35],[35,38],[30,48],[25,55],[20,45],[15,42],[15,50],[20,55],[25,56],[28,50],[30,48],[32,36]],
  [[-35,173],[-38,175],[-42,174],[-46,168],[-44,168],[-42,172],[-38,176]],
  [[10,80],[8,82],[7,80],[8,78]],
  [[-12,49],[-16,47],[-20,44],[-24,44],[-25,47],[-20,49],[-16,50]],
]

function pointInPolygon(lat, lng, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1]
    const yj = poly[j][0], xj = poly[j][1]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

function isLand(lat, lng) {
  for (const poly of CONTINENTS) { if (pointInPolygon(lat, lng, poly)) return true }
  return false
}

function DotEarth() {
  const ref = useRef(null)
  const geometry = useMemo(() => {
    const positions = []
    const COUNT = 20000
    const ga = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = ga * i
      const lat = Math.asin(y) * (180 / Math.PI)
      const lng = ((theta * 180 / Math.PI) % 360) - 180
      if (isLand(lat, lng)) {
        const v = latLngToVector3(lat, lng, 2.0)
        positions.push(v.x, v.y, v.z)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [])
  const material = useMemo(() => new THREE.PointsMaterial({
    color: new THREE.Color('#e8dcc8'),
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])
  return <points ref={ref} geometry={geometry} material={material} />
}

function OceanSphere() {
  return <mesh><sphereGeometry args={[1.98, 64, 64]} /><meshBasicMaterial color="#060610" /></mesh>
}

function Atmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){vN=normalize(normalMatrix*normal);vP=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){vec3 vd=normalize(cameraPosition-vP);float rim=pow(1.0-max(dot(vd,vN),0.0),2.5);vec3 c=mix(vec3(0.03,0.05,0.12),vec3(0.18,0.14,0.05),rim);gl_FragColor=vec4(c,rim*0.35);}`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  }), [])
  return <mesh material={mat}><sphereGeometry args={[2.15, 48, 48]} /></mesh>
}

function RouteLine({ from, to, progress = 1 }) {
  const geo = useMemo(() => {
    const s = latLngToVector3(from.lat, from.lng, 2.01)
    const e = latLngToVector3(to.lat, to.lng, 2.01)
    const m = s.clone().add(e).multiplyScalar(0.5)
    m.normalize().multiplyScalar(2.01 + s.distanceTo(e) * 0.2)
    const pts = new THREE.QuadraticBezierCurve3(s, m, e).getPoints(80)
    const n = Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))
    return new THREE.BufferGeometry().setFromPoints(pts.slice(0, n))
  }, [from, to, progress])
  if (progress <= 0) return null
  return <group>
    <line geometry={geo}><lineBasicMaterial color="#c9a227" transparent opacity={Math.min(progress * 2, 0.85)} /></line>
    <line geometry={geo}><lineBasicMaterial color="#e8d48a" transparent opacity={Math.min(progress, 0.15)} /></line>
  </group>
}

function JourneyRoutes({ scrollProgress }) {
  const ch = journey.chapters
  const routes = useMemo(() => {
    const s = [{ from: origin, to: ch[0].coordinates }]
    for (let i = 0; i < ch.length - 1; i++) s.push({ from: ch[i].coordinates, to: ch[i + 1].coordinates })
    return s
  }, [ch])
  const vis = useMemo(() => {
    const n = routes.length, a = Math.floor(scrollProgress * n), p = (scrollProgress * n) % 1
    return routes.map((r, i) => ({ ...r, progress: i < a ? 1 : i === a ? p : 0 }))
  }, [routes, scrollProgress])
  return <group>{vis.map((r, i) => <RouteLine key={i} from={r.from} to={r.to} progress={r.progress} />)}</group>
}

function CityMarker({ lat, lng, isPeak = false, isOrigin = false, isActive = false }) {
  const glowRef = useRef(null)
  const pulseRef = useRef(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  const color = isOrigin ? '#f5f3ef' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.025 : isPeak ? 0.03 : 0.018
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (glowRef.current && (isActive || isPeak)) glowRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.3)
    if (pulseRef.current && isActive) {
      const c = (t * 0.6) % 1
      pulseRef.current.scale.setScalar(1 + c * 6)
      pulseRef.current.material.opacity = (1 - c) * 0.4
    }
  })
  return <group position={position}>
    <mesh ref={glowRef}><sphereGeometry args={[size, 12, 12]} /><meshBasicMaterial color={color} transparent opacity={isActive ? 1 : 0.7} /></mesh>
    {isActive && <mesh ref={pulseRef}><ringGeometry args={[size * 2, size * 3, 32]} /><meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} /></mesh>}
  </group>
}

function ScrollCamera({ scrollProgress }) {
  const { camera } = useThree()
  const ch = journey.chapters
  const targets = useMemo(() => [origin, ...ch.map(c => c.coordinates)].map(coord => {
    const p = latLngToVector3(coord.lat, coord.lng, 2.0).normalize().multiplyScalar(4.5)
    p.y += 0.4
    return p
  }), [ch])
  const pos = useRef(new THREE.Vector3(0, 0, 5))
  useFrame((_, dt) => {
    const n = targets.length, ri = scrollProgress * (n - 1), idx = Math.floor(ri), t = ri - idx
    const f = targets[Math.min(idx, n - 1)], to = targets[Math.min(idx + 1, n - 1)]
    const tgt = f.clone().lerp(to, t * t * (3 - 2 * t))
    pos.current.x = dampV(pos.current.x, tgt.x, 6, dt)
    pos.current.y = dampV(pos.current.y, tgt.y, 6, dt)
    pos.current.z = dampV(pos.current.z, tgt.z, 6, dt)
    camera.position.copy(pos.current)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Scene({ scrollProgress, activeIndex }) {
  const ch = journey.chapters
  return <>
    <ambientLight intensity={0.05} />
    <OceanSphere />
    <DotEarth />
    <Atmosphere />
    <JourneyRoutes scrollProgress={scrollProgress} />
    <CityMarker lat={origin.lat} lng={origin.lng} isOrigin />
    {ch.map((c, i) => <CityMarker key={c.id} lat={c.coordinates.lat} lng={c.coordinates.lng} isPeak={c.isPeak} isActive={i === activeIndex} />)}
    <ScrollCamera scrollProgress={scrollProgress} />
  </>
}

export default function Globe({ scrollProgress = 0, activeIndex = 0 }) {
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