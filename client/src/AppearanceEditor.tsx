import { useId } from 'react'
import { CLOTHING_COLORS, HAIR_COLORS, HAT_COLORS, SKIN_TONES, type Appearance } from './appearance'
import CharacterPreview from './CharacterPreview'
import './appearance.css'

export default function AppearanceEditor({ value, onChange }: {
  value: Appearance; onChange: (next: Appearance) => void
}) {
  const prefix = useId()
  const select = (key: 'top' | 'bottom' | 'shoes' | 'hair' | 'hat' | 'face', label: string,
    options: readonly (readonly [string, string])[]) =>
    <div className="appearance-select"><label htmlFor={`${prefix}-${key}`}>{label}</label>
      <select id={`${prefix}-${key}`} value={value[key]} onChange={e => onChange({
        ...value, [key]: e.target.value,
        ...(key === 'hat' && e.target.value === 'engineer' ? { hatColor: '#ffd43b' } : {}),
      })}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </div>
  const palette = (key: 'topColor' | 'bottomColor' | 'shoeColor' | 'skin' | 'hairColor' | 'hatColor' | 'backpackColor',
    label: string, colors: readonly { label: string; value: string }[] = CLOTHING_COLORS) =>
    <fieldset className="appearance-palette"><legend>{label}</legend>
      {colors.map(color => <button key={color.value} type="button"
        aria-label={`${label}: ${color.label}`} title={color.label}
        aria-pressed={value[key] === color.value} style={{ backgroundColor: color.value }}
        onClick={() => onChange({ ...value, [key]: color.value })} />)}
    </fieldset>
  return <section className="appearance-editor" aria-label="Character appearance">
    <div className="appearance-preview">
      <CharacterPreview appearance={value} />
      <p>Make it yours.<br /><small>Saved automatically on this browser.</small></p>
    </div>
    <div className="appearance-options">
      <div className="appearance-selects">
        {select('top', 'Top', [['tee', 'T-shirt'], ['hoodie', 'Hoodie'], ['jacket', 'Jacket']])}
        {select('bottom', 'Bottoms', [['trousers', 'Trousers'], ['shorts', 'Shorts']])}
        {select('shoes', 'Shoes', [['boots', 'Boots'], ['sneakers', 'Sneakers']])}
      </div>
      {palette('topColor', 'Top color')}
      {palette('bottomColor', 'Bottoms color')}
      {palette('shoeColor', 'Shoe color')}
      {palette('skin', 'Skin tone', SKIN_TONES)}
      <div className="appearance-selects">
        {select('hair', 'Hair', [['short', 'Short'], ['bob', 'Bob'], ['none', 'No hair']])}
        {select('hat', 'Hat', [['none', 'No hat'], ['engineer', 'Engineer hard hat'],
          ['cowboy', 'Cowboy hat'], ['feather', 'Feather headband'], ['beanie', 'Beanie'], ['cap', 'Cap']])}
        {select('face', 'Face', [['smile', 'Smile'], ['neutral', 'Neutral'], ['surprised', 'Surprised']])}
      </div>
      {palette('hairColor', 'Hair color', HAIR_COLORS)}
      {palette('hatColor', 'Hat color', HAT_COLORS)}
      <label className="appearance-backpack"><input type="checkbox" checked={value.backpack}
        onChange={e => onChange({ ...value, backpack: e.target.checked })} /> Wear backpack</label>
      {palette('backpackColor', 'Backpack color')}
    </div>
  </section>
}
