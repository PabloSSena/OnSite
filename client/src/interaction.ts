import { create } from 'zustand'
import type { Holding } from './network'

export type InteractAction = 'toggle-fridge' | 'take-beer'

// What pressing E does at the fridge: open → take a beer → close.
export function fridgeAction(open: boolean, holding: Holding): InteractAction {
  return open && holding === 'none' ? 'take-beer' : 'toggle-fridge'
}

export function fridgePrompt(open: boolean, holding: Holding) {
  if (!open) return 'Open fridge'
  return holding === 'none' ? 'Take a beer' : 'Close fridge'
}

// Written by the render loop only when the text changes, never every frame.
export type InteractionHint = { prompt: string | null; holding: boolean }
export const useInteraction = create<InteractionHint>(() => ({ prompt: null, holding: false }))

export function setInteractionHint(next: InteractionHint) {
  const current = useInteraction.getState()
  if (current.prompt !== next.prompt || current.holding !== next.holding) useInteraction.setState(next)
}
