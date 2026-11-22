export const CLOTHING_COLORS = [
  { label: 'Mint', value: '#52d6b1' },
  { label: 'Apricot', value: '#ffb86b' },
  { label: 'Lavender', value: '#b69cff' },
  { label: 'Sky', value: '#72baff' },
  { label: 'Rose', value: '#ff7c9a' },
  { label: 'Ink', value: '#25333e' },
  { label: 'Cream', value: '#fff0d3' },
  { label: 'Caramel', value: '#b58453' },
] as const

export const SKIN_TONES = [
  { label: 'Porcelain', value: '#f7dfcf' },
  { label: 'Peach', value: '#efc9a9' },
  { label: 'Warm beige', value: '#d9a47c' },
  { label: 'Tan', value: '#b97953' },
  { label: 'Brown', value: '#885438' },
  { label: 'Deep brown', value: '#533528' },
] as const

export const HAIR_COLORS = [
  { label: 'Auburn', value: '#a65d45' },
  { label: 'Black', value: '#25333e' },
  { label: 'Dark brown', value: '#51382c' },
  { label: 'Brown', value: '#805539' },
  { label: 'Blond', value: '#d5b477' },
  { label: 'Silver', value: '#c4c5c3' },
] as const

export type Appearance = {
  top: 'tee' | 'hoodie' | 'jacket'
  bottom: 'trousers' | 'shorts'
  shoes: 'boots' | 'sneakers'
  topColor: string
  bottomColor: string
  shoeColor: string
  skin: string
  hair: 'short' | 'bob' | 'none'
  hairColor: string
  hat: 'none' | 'beanie' | 'cap'
  hatColor: string
  backpack: boolean
  backpackColor: string
  face: 'smile' | 'neutral' | 'surprised'
}

const clothingColor = (value: unknown) => CLOTHING_COLORS.some(color => color.value === value)
const storageKey = 'office-appearance-v1'

export function defaultAppearance(color?: string): Appearance {
  return {
    top: 'tee', bottom: 'trousers', shoes: 'boots',
    topColor: clothingColor(color) ? color! : '#52d6b1',
    bottomColor: '#25333e', shoeColor: '#b58453', skin: '#efc9a9',
    hair: 'short', hairColor: '#a65d45', hat: 'none', hatColor: '#25333e',
    backpack: true, backpackColor: '#b58453', face: 'smile',
  }
}

export function parseAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const a = value as Record<string, unknown>
  const keys = Object.keys(defaultAppearance())
  if (Object.keys(a).length !== keys.length || !keys.every(key => Object.hasOwn(a, key))) return null
  if (!['tee', 'hoodie', 'jacket'].includes(a.top as string) ||
      !['trousers', 'shorts'].includes(a.bottom as string) ||
      !['boots', 'sneakers'].includes(a.shoes as string) ||
      !['short', 'bob', 'none'].includes(a.hair as string) ||
      !['none', 'beanie', 'cap'].includes(a.hat as string) ||
      !['smile', 'neutral', 'surprised'].includes(a.face as string) ||
      typeof a.backpack !== 'boolean' ||
      !['topColor', 'bottomColor', 'shoeColor', 'hatColor', 'backpackColor'].every(key => clothingColor(a[key])) ||
      !SKIN_TONES.some(color => color.value === a.skin) ||
      !HAIR_COLORS.some(color => color.value === a.hairColor)) return null
  return { ...a } as Appearance
}

export function loadAppearance(): Appearance {
  try {
    return parseAppearance(JSON.parse(localStorage.getItem(storageKey) ?? 'null')) ?? defaultAppearance()
  } catch {
    return defaultAppearance()
  }
}

export function saveAppearance(appearance: Appearance): void {
  const valid = parseAppearance(appearance)
  if (!valid) return
  try {
    localStorage.setItem(storageKey, JSON.stringify(valid))
  } catch {
    // The caller keeps its in-memory selection when storage is unavailable.
  }
}
