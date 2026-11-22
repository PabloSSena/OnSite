import { box, type Box } from './world'

export function Block({ data }: { data: Box }) {
  return <mesh position={data.position} castShadow receiveShadow>
    <boxGeometry args={data.size} />
    <meshStandardMaterial color={data.color} roughness={0.85} />
  </mesh>
}

export function Furnishing({ data }: { data: Box }) {
  if (!data.kind) return <Block data={data} />
  const [x, y, z] = data.position
  const [w, h, d] = data.size
  const seat = data.kind === 'chair'
  const top = seat ? h * 0.55 : h - 0.06
  // Parts are local to the piece so a chair's backrest turns with its facing,
  // staying behind whoever sits in it.
  return <group position={[x, 0, z]} rotation-y={data.facing ?? 0}>
    <Block data={box(0, y - h / 2 + top, 0, w, 0.12, d, data.color)} />
    {[-1, 1].flatMap(sx => [-1, 1].map(sz =>
      <Block key={`${sx}${sz}`} data={box(sx * (w / 2 - 0.12), y - h / 2 + top / 2,
        sz * (d / 2 - 0.12), 0.12, top, 0.12, '#665846')} />
    ))}
    {seat && <Block data={box(0, y + h * 0.25, d / 2 - 0.08, w, h * 0.5, 0.16, data.color)} />}
  </group>
}
