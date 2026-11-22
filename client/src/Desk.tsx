import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Furnishing, Block } from './Blocks'
import { DeskItemModel } from './DeskItems'
import { plateTexture, screenTexture, statusColor, topColor, type Desk } from './desks'
import { localPlayer } from './network'
import { box, deskChairs, desks, deskTables, monitors } from './world'
import './desks.css'

// Desktop-relative slots: back left, front left, front right.
const slots: [number, number][] = [[-1.0, -0.4], [-0.95, 0.35], [0.85, 0.35]]
const SURFACE = 0.84
const ANNOTATION_RANGE = 6

function Poster({ url, owner }: { url: string; owner: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  return <div className="desk-poster" aria-label={`${owner}'s desk poster`}>
    {failed ? <span>Poster unavailable</span> :
      <img src={url} alt={`${owner}'s poster`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </div>
}

export default function DeskView({ index, desk, annotations }: { index: number; desk?: Desk; annotations: boolean }) {
  const [x, z] = desks[index]
  const style = desk?.style ?? null
  const owner = desk?.ownerName ?? ''
  // Desk messages arrive as fresh objects; redraw textures only when the content changes.
  const styleKey = JSON.stringify(style)
  const screen = useMemo(() => screenTexture(style, owner), [styleKey, owner])
  const plate = useMemo(() => style ? plateTexture(style.plate) : null, [styleKey])
  useEffect(() => () => screen.dispose(), [screen])
  useEffect(() => () => plate?.dispose(), [plate])
  const near = useRef<HTMLDivElement[]>([])
  const shown = useRef(false)
  useFrame(() => {
    // Only nearby players load posters and see notes; toggled via the DOM, not React state.
    const visible = Math.hypot(localPlayer.x - x, localPlayer.z - z) < ANNOTATION_RANGE
    if (visible === shown.current) return
    shown.current = visible
    near.current = near.current.filter(el => el.isConnected)
    near.current.forEach(el => { el.style.display = visible ? '' : 'none' })
  })
  const keep = (el: HTMLDivElement | null) => {
    if (el && !near.current.includes(el)) {
      el.style.display = shown.current ? '' : 'none'
      near.current.push(el)
    }
  }
  useEffect(() => () => { near.current = [] }, [])
  const table = deskTables[index]
  const chair = deskChairs[index]
  const lamp = style?.lampOn ? style.lampColor : null
  const light = desk ? statusColor(desk) : '#7b8590'
  return <>
    <Furnishing data={{ ...table, color: style ? topColor(style.top) : table.color }} />
    <Furnishing data={{ ...chair, color: style?.chairColor ?? chair.color }} />
    <Block data={monitors[index]} />
    <group position={[x, 0, z]}>
      <Block data={box(0, 0.93, -0.25, 0.08, 0.3, 0.08, '#384f50')} />
      <mesh position={[0, 1.18, -0.25 + 0.046]}>
        <planeGeometry args={[1.0, 0.52]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <Block data={box(0, 0.86, 0.3, 0.8, 0.04, 0.25, style?.keyboardColor ?? '#ece2cd')} />
      {/* Desk lamp: base, arm, and a shade that glows when switched on. */}
      <group position={[1.05, SURFACE, -0.4]}>
        <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.04, 16]} /><meshStandardMaterial color="#3d4b56" /></mesh>
        <Block data={box(0, 0.2, 0, 0.03, 0.36, 0.03, '#3d4b56')} />
        <mesh position={[-0.06, 0.38, 0]} rotation={[0, 0, 0.5]} castShadow>
          <coneGeometry args={[0.1, 0.13, 16, 1, true]} />
          <meshStandardMaterial color={style?.lampColor ?? '#f2ddad'} emissive={lamp ?? '#000000'}
            emissiveIntensity={lamp ? 0.8 : 0} side={2} />
        </mesh>
        {/* A glowing pool instead of a real light: ten point lights would add per-pixel
            lighting to every material in the scene. */}
        {lamp && <mesh position={[-0.2, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.22, 24]} />
          <meshBasicMaterial color={lamp} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
        </mesh>}
      </group>
      {/* Status light on top of the monitor: green, red, yellow, or grey when offline. */}
      <mesh position={[0.48, 1.52, -0.25]}>
        <sphereGeometry args={[0.035, 12, 10]} />
        <meshStandardMaterial color={light} emissive={light} emissiveIntensity={desk?.online ? 1.2 : 0.2} />
      </mesh>
      {plate && <mesh position={[0, SURFACE + 0.05, 0.6]} rotation={[-0.35, 0, 0]}>
        <planeGeometry args={[0.55, 0.1]} />
        <meshBasicMaterial map={plate} toneMapped={false} />
      </mesh>}
      {style?.items.map((item, i) => <group key={i} position={[slots[i][0], SURFACE, slots[i][1]]}>
        <DeskItemModel item={item} />
      </group>)}
      {annotations && style?.poster && <Html position={[0, 2.15, -0.3]} center distanceFactor={9}
        style={{ pointerEvents: 'none' }}>
        <div ref={keep}><Poster url={style.poster} owner={owner} /></div>
      </Html>}
      {annotations && desk && desk.notes.length > 0 && <Html position={[-0.72, 1.3, -0.2]} center distanceFactor={7}
        style={{ pointerEvents: 'none' }}>
        <div ref={keep} className="desk-notes" aria-label={`Notes on ${owner}'s desk`}>
          {desk.notes.slice(-3).map(note => <p key={note.id}><span>{note.text}</span><b>{note.author}</b></p>)}
        </div>
      </Html>}
    </group>
  </>
}
