import type { RefObject } from 'react'
import type { Group } from 'three'
import { box, desks, furniture, monitors, planters, trees, walls, type Box } from './world'

function Block({ data }: { data: Box }) {
  return <mesh position={data.position} castShadow receiveShadow>
    <boxGeometry args={data.size} />
    <meshStandardMaterial color={data.color} roughness={0.85} />
  </mesh>
}

function Furnishing({ data }: { data: Box }) {
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

const surfaces = [
  box(0, -0.12, 0, 48, 0.2, 48, '#80966b'),
  box(0, -0.025, -6, 32, 0.15, 20, '#d6b88d'),
  box(-9, 0.06, -11, 13.6, 0.03, 9.5, '#c3ac87'),
  box(9, 0.06, -11, 13.6, 0.03, 9.5, '#b6b9a4'),
  box(-9, 0.06, -1, 13.6, 0.03, 9.5, '#e1c9a5'),
  box(9, 0.06, -1, 13.6, 0.03, 9.5, '#d9cdb6'),
  box(0, 0.025, 6.4, 12, 0.05, 4.5, '#c19d77'),
  box(0, 0.015, 15, 3, 0.03, 13, '#d5cdb5'),
  box(-7, 0.015, 11, 14, 0.03, 5.5, '#c9c2a8'),
  box(10, 0.015, 11, 10, 0.03, 7, '#c9c2a8'),
  box(-10, 0.09, -0.8, 7, 0.025, 6, '#bf9f80'),
]

const details: Box[] = [
  // Ceiling-free architecture, window frames, and warm wood floorboards.
  ...Array.from({ length: 31 }, (_, i) => box(i - 15, 0.058, -6, 0.018, 0.008, 19.7, '#a98c68')),
  ...[-15.78, 15.78].flatMap(x => [-12, -2].flatMap(z => [
    box(x, 1.65, z, 0.06, 1.5, 3.8, '#789a9c'),
    box(x, 1.65, z, 0.1, 1.6, 0.08, '#f7ebd2'),
    box(x, 0.87, z, 0.12, 0.12, 4, '#f7ebd2'),
    box(x, 2.43, z, 0.12, 0.12, 4, '#f7ebd2'),
  ])),
  ...desks.flatMap(([x, z]) => [
    box(x, 0.93, z - 0.25, 0.08, 0.3, 0.08, '#384f50'),
    box(x, 0.87, z + 0.3, 0.8, 0.04, 0.25, '#ece2cd'),
    box(x + 1.1, 0.96, z, 0.18, 0.23, 0.18, '#f2ddad'),
  ]),
  box(9, 1.8, -15.8, 5, 1.6, 0.08, '#f5efdc'),
  box(9, 1.8, -15.73, 3.7, 0.035, 0.02, '#b2c3ad'),
  box(-9, 1.8, -15.8, 3, 1.3, 0.08, '#4e766b'),
  box(-9, 1.8, -15.74, 1.5, 0.08, 0.02, '#efd69e'),
  // Kitchen worktop, sink, coffee machine, and open shelving.
  box(10, 1.13, -4.9, 9.2, 0.1, 1.5, '#f2e7d1'),
  box(11.5, 1.19, -4.9, 1.3, 0.025, 0.9, '#7d9390'),
  box(6.5, 1.4, -4.9, 0.6, 0.5, 0.5, '#3d4b46'),
  box(8.8, 1.9, -5.75, 4.8, 0.1, 0.4, '#a47c53'),
  ...[7.2, 8, 8.8, 9.6, 10.4].map(x => box(x, 2.07, -5.75, 0.25, 0.25, 0.25, '#e5c99a')),
  // Sofa backs and pillows give the lounge a softer silhouette.
  box(-11, 0.95, -3.4, 6, 0.65, 0.3, '#587761'),
  box(-14.6, 0.95, -0.5, 0.3, 0.65, 3, '#587761'),
  ...[-12.7, -10.9, -9.1].map(x => box(x, 0.98, -2.8, 0.65, 0.3, 0.55, '#e3bd7e')),
  box(-9.2, 0.48, 0, 0.8, 0.06, 0.5, '#68897c'),
  box(10, 0.75, 13.5, 4.6, 0.6, 0.3, '#5e7e6d'),
  // Porch posts frame the wide, permanently open entrance.
  ...[-2.1, 2.1].map(x => box(x, 1.55, 4, 0.22, 3.1, 0.3, '#a77d54')),
  box(0, 3.05, 4, 4.5, 0.25, 0.4, '#a77d54'),
  // Raised beds at the far end of the garden.
  ...[-15, 15].flatMap(x => [
    box(x, 0.2, 20, 4, 0.4, 2, '#a47c53'),
    box(x, 0.43, 20, 3.7, 0.06, 1.7, '#5f513c'),
    ...[-1.2, 0, 1.2].map(dx => box(x + dx, 0.65, 20, 0.6, 0.45, 1.3, '#527a4b')),
  ]),
]

export function OfficeWorld({ obstacles }: { obstacles: RefObject<Group | null> }) {
  return <>
    {surfaces.map((data, i) => <Block key={`floor${i}`} data={data} />)}
    <group ref={obstacles}>
      {walls.map((data, i) => <Block key={`wall${i}`} data={data} />)}
      {furniture.map((data, i) => <Furnishing key={`furniture${i}`} data={data} />)}
      {monitors.map((data, i) => <Block key={`monitor${i}`} data={data} />)}
    </group>
    {details.map((data, i) => <Block key={`detail${i}`} data={data} />)}
    {trees.map(([x, z], i) => <group key={`tree${i}`} position={[x, 0, z]}>
      <mesh position={[0, 3.5, 0]} castShadow>
        <icosahedronGeometry args={[2, 1]} />
        <meshStandardMaterial color={i % 2 ? '#648357' : '#476e51'} roughness={1} />
      </mesh>
      <mesh position={[0.7, 2.8, 0.2]} castShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial color="#78925f" roughness={1} />
      </mesh>
    </group>)}
    {planters.map(([x, z]) => <mesh key={`plant${x}${z}`} position={[x, 1.15, z]} castShadow>
      <icosahedronGeometry args={[0.7, 1]} />
      <meshStandardMaterial color="#547b52" />
    </mesh>)}
  </>
}
