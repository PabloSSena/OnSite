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
  return <>
    <Block data={box(x, y - h / 2 + top, z, w, 0.12, d, data.color)} />
    {[-1, 1].flatMap(sx => [-1, 1].map(sz =>
      <Block key={`${sx}${sz}`} data={box(x + sx * (w / 2 - 0.12), y - h / 2 + top / 2,
        z + sz * (d / 2 - 0.12), 0.12, top, 0.12, '#665846')} />
    ))}
    {seat && <Block data={box(x, y + h * 0.25, z + d / 2 - 0.08, w, h * 0.5, 0.16, data.color)} />}
  </>
}
