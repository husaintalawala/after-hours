// @ts-nocheck
'use client'

import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { journey, origin, MEDIA_BASE } from '@/data/journey'

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
}
function dampV(a, b, lambda, dt) { return THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt)) }

function Earth() {
  const dayTex = useLoader(THREE.TextureLoader, `/textures/earth-day.jpg`)
  const nightTex = useLoader(THREE.TextureLoader, `/textures/earth-night.jpg`)
  const material = useMemo(() => {
    dayTex.colorSpace = THREE.SRGBColorSpace
    nightTex.colorSpace = THREE.SRGBColorSpace
    return new THREE.ShaderMaterial({
      uniforms: { uDay: { value: dayTex }, uNight: { value: nightTex }, uSunDir: { value: new THREE.Vector3(0.6, 0.3, 0.8).normalize() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSunDir; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos; void main() { vec3 day = texture2D(uDay, vUv).rgb * 0.55; day = mix(day, day * vec3(1.05, 0.98, 0.85), 0.4); vec3 night = texture2D(uNight, vUv).rgb * vec3(1.0, 0.85, 0.6) * 1.2; float sunDot = dot(vNormal, uSunDir); float dayMix = smoothstep(-0.15, 0.25, sunDot); vec3 surface = mix(night, day, dayMix); float diffuse = max(sunDot, 0.0) * 0.3 + 0.7; surface *= mix(0.5, diffuse, dayMix); vec3 viewDir = normalize(cameraPosition - vPos); float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.5); vec3 rimColor = mix(vec3(0.05, 0.08, 0.2), vec3(0.3, 0.22, 0.08), dayMix); surface += rimColor * fresnel * 0.5; float spec = pow(max(dot(reflect(-uSunDir, vNormal), viewDir), 0.0), 40.0); surface += vec3(0.3, 0.25, 0.15) * spec * 0.15 * dayMix; float edgeDarken = pow(max(dot(viewDir, vNormal), 0.0), 0.7); surface *= mix(0.25, 1.0, edgeDarken); gl_FragColor = vec4(surface, 1.0); }',
    })
  }, [dayTex, nightTex])
  return <mesh material={material}><sphereGeometry args={[2, 64, 64]} /></mesh>
}

function Atmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){vN=normalize(normalMatrix*normal);vP=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){vec3 vd=normalize(cameraPosition-vP);float rim=pow(1.0-max(dot(vd,vN),0.0),3.0);vec3 col=mix(vec3(0.02,0.04,0.12),vec3(0.25,0.18,0.06),rim);gl_FragColor=vec4(col,rim*0.4);}',
    side: THREE.BackSide, transparent: true, depthWrite: false,
  }), [])
  return <mesh material={mat}><sphereGeometry args={[2.12, 48, 48]} /></mesh>
}

function RouteLine({ from, to, progress = 1 }) {
  const geo = useMemo(() => {
    const s = latLngToVector3(from.lat, from.lng, 2.01), e = latLngToVector3(to.lat, to.lng, 2.01)
    const m = s.clone().add(e).multiplyScalar(0.5); m.normalize().multiplyScalar(2.01 + s.distanceTo(e) * 0.2)
    const pts = new THREE.QuadraticBezierCurve3(s, m, e).getPoints(80)
    return new THREE.BufferGeometry().setFromPoints(pts.slice(0, Math.max(2, Math.floor(pts.length * Math.min(progress, 1)))))
  }, [from, to, progress])
  if (progress <= 0) return null
  return <group><line geometry={geo}><lineBasicMaterial color="#c9a227" transparent opacity={Math.min(progress*2,0.85)} /></line><line geometry={geo}><lineBasicMaterial color="#e8d48a" transparent opacity={Math.min(progress,0.15)} /></line></group>
}

function JourneyRoutes({ scrollProgress }) {
  const ch = journey.chapters
  const routes = useMemo(() => { const s = [{ from: origin, to: ch[0].coordinates }]; for (let i = 0; i < ch.length - 1; i++) s.push({ from: ch[i].coordinates, to: ch[i+1].coordinates }); return s }, [ch])
  const vis = useMemo(() => { const n = routes.length, a = Math.floor(scrollProgress*n), p = (scrollProgress*n)%1; return routes.map((r,i)=>({...r, progress: i<a?1:i===a?p:0})) }, [routes, scrollProgress])
  return <group>{vis.map((r,i)=><RouteLine key={i} from={r.from} to={r.to} progress={r.progress} />)}</group>
}

function CityMarker({ lat, lng, isPeak=false, isOrigin=false, isActive=false }) {
  const glowRef = useRef(null), pulseRef = useRef(null)
  const position = useMemo(() => latLngToVector3(lat, lng, 2.02), [lat, lng])
  const color = isOrigin ? '#f5f3ef' : isPeak ? '#c9a227' : '#b87333'
  const size = isOrigin ? 0.025 : isPeak ? 0.03 : 0.018
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (glowRef.current && (isActive || isPeak)) glowRef.current.scale.setScalar(1 + Math.sin(t*3)*0.3)
    if (pulseRef.current && isActive) { const c = (t*0.6)%1; pulseRef.current.scale.setScalar(1+c*6); pulseRef.current.material.opacity = (1-c)*0.4 }
  })
  return <group position={position}>
    <mesh ref={glowRef}><sphereGeometry args={[size,12,12]} /><meshBasicMaterial color={color} transparent opacity={isActive?1:0.7} /></mesh>
    {isActive && <mesh ref={pulseRef}><ringGeometry args={[size*2,size*3,32]} /><meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} /></mesh>}
  </group>
}

function ScrollCamera({ scrollProgress }) {
  const { camera } = useThree()
  const ch = journey.chapters
  const targets = useMemo(() => [origin, ...ch.map(c=>c.coordinates)].map(coord => { const p = latLngToVector3(coord.lat,coord.lng,2.0).normalize().multiplyScalar(4.5); p.y+=0.4; return p }), [ch])
  const pos = useRef(new THREE.Vector3(0,0,5))
  useFrame((_,dt) => {
    const n=targets.length, ri=scrollProgress*(n-1), idx=Math.floor(ri), t=ri-idx
    const f=targets[Math.min(idx,n-1)], to=targets[Math.min(idx+1,n-1)]
    const tgt=f.clone().lerp(to, t*t*(3-2*t))
    pos.current.x=dampV(pos.current.x,tgt.x,6,dt); pos.current.y=dampV(pos.current.y,tgt.y,6,dt); pos.current.z=dampV(pos.current.z,tgt.z,6,dt)
    camera.position.copy(pos.current); camera.lookAt(0,0,0)
  })
  return null
}

function Scene({ scrollProgress, activeIndex }) {
  const ch = journey.chapters
  return <>
    <ambientLight intensity={0.08} />
    <directionalLight position={[6,3,8]} intensity={0.3} color="#f0e6d0" />
    <Earth />
    <Atmosphere />
    <JourneyRoutes scrollProgress={scrollProgress} />
    <CityMarker lat={origin.lat} lng={origin.lng} isOrigin />
    {ch.map((c,i)=><CityMarker key={c.id} lat={c.coordinates.lat} lng={c.coordinates.lng} isPeak={c.isPeak} isActive={i===activeIndex} />)}
    <ScrollCamera scrollProgress={scrollProgress} />
  </>
}

function GlobeLoader() { return <mesh><sphereGeometry args={[2,32,32]} /><meshBasicMaterial color="#0a0a12" /></mesh> }

export default function Globe({ scrollProgress = 0, activeIndex = 0 }) {
  return (
    <div className="globe-canvas">
      <Canvas camera={{position:[0,0,5],fov:45}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} dpr={[1,1.5]} style={{background:'#0a0a0f'}}>
        <color attach="background" args={['#0a0a0f']} />
        <Suspense fallback={<GlobeLoader />}>
          <Scene scrollProgress={scrollProgress} activeIndex={activeIndex} />
        </Suspense>
      </Canvas>
    </div>
  )
}
