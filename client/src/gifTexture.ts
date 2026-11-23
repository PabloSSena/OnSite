import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

// WebCodecs is optional; other browsers still get a static image in the mirror.
type GIFFrame = CanvasImageSource & {
  displayWidth: number; displayHeight: number; duration: number | null; close(): void
}
type GIFDecoder = {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(options: { frameIndex: number }): Promise<{ image: GIFFrame }>
  close(): void
}
type DecoderConstructor = new (options: { data: ArrayBuffer; type: string }) => GIFDecoder

export function useGIFTexture(url: string) {
  const [source, setSource] = useState<{ texture: CanvasTexture; advance(): void } | null>(null)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 192
    const context = canvas.getContext('2d')!
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    const abort = new AbortController()
    let disposed = false
    let decoder: GIFDecoder | undefined
    let pending = false
    let frameIndex = 0
    let due = Infinity
    const background = () => {
      context.fillStyle = '#112132'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.strokeStyle = '#65dfbb'
      context.lineWidth = 6
      context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6)
    }
    const message = (text: string) => {
      background()
      context.fillStyle = '#ffffff'
      context.textAlign = 'center'
      context.font = '18px sans-serif'
      context.fillText(text, canvas.width / 2, canvas.height / 2)
      texture.needsUpdate = true
    }
    const draw = (image: CanvasImageSource, width: number, height: number) => {
      background()
      const scale = Math.min((canvas.width - 12) / width, (canvas.height - 12) / height)
      context.drawImage(image, (canvas.width - width * scale) / 2,
        (canvas.height - height * scale) / 2, width * scale, height * scale)
      texture.needsUpdate = true
    }
    const advance = async () => {
      if (disposed || pending || !decoder || performance.now() < due) return
      pending = true
      try {
        const { image } = await decoder.decode({ frameIndex })
        try {
          if (disposed) return
          draw(image, image.displayWidth, image.displayHeight)
          const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1)
          due = count > 1 ? performance.now() + Math.max(20, (image.duration ?? 100000) / 1000) : Infinity
          frameIndex = (frameIndex + 1) % count
        } finally {
          image.close()
        }
      } catch {
        if (!disposed) {
          due = Infinity
          message('GIF unavailable')
        }
      } finally {
        pending = false
      }
    }
    message('Loading GIF…')
    setSource({ texture, advance: () => { void advance() } })
    void (async () => {
      try {
        // WebGL requires CORS approval, even though ordinary DOM images do not.
        const response = await fetch(url, { signal: abort.signal, referrerPolicy: 'no-referrer' })
        if (!response.ok) throw new Error('GIF request failed')
        const data = await response.arrayBuffer()
        if (disposed) return
        const Decoder = (globalThis as unknown as { ImageDecoder?: DecoderConstructor }).ImageDecoder
        if (Decoder) {
          decoder = new Decoder({ data, type: 'image/gif' })
          await decoder.tracks.ready
          if (disposed) return
          due = 0
          await advance()
        } else {
          const image = await createImageBitmap(new Blob([data], { type: 'image/gif' }))
          try {
            if (!disposed) draw(image, image.width, image.height)
          } finally {
            image.close()
          }
        }
      } catch {
        if (!disposed) message('GIF unavailable')
      }
    })()
    return () => {
      disposed = true
      abort.abort()
      decoder?.close()
      texture.dispose()
    }
  }, [url])
  useFrame(() => source?.advance())
  return source?.texture ?? null
}
