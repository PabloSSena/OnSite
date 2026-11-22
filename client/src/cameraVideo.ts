import { useEffect, useState } from 'react'
import { SRGBColorSpace, VideoTexture } from 'three'

type CameraVideo = {
  video: HTMLVideoElement
  texture: VideoTexture
  references: number
}

const sources = new WeakMap<MediaStream, CameraVideo>()

// These elements decode streams only; webcam.ts exclusively owns capture tracks.
function acquire(stream: MediaStream): CameraVideo {
  const existing = sources.get(stream)
  if (existing) {
    existing.references++
    return existing
  }
  const video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  video.hidden = true
  video.dataset.worldCamera = ''
  video.srcObject = stream
  document.body.append(video)
  void video.play().catch(() => {})
  const texture = new VideoTexture(video)
  texture.colorSpace = SRGBColorSpace
  const source = { video, texture, references: 1 }
  sources.set(stream, source)
  return source
}

function release(stream: MediaStream, source: CameraVideo) {
  if (--source.references !== 0) return
  sources.delete(stream)
  source.video.pause()
  source.video.srcObject = null
  source.video.remove()
  source.texture.dispose()
}

export function useCameraVideo(stream: MediaStream, label: string) {
  const [current, setCurrent] = useState<{ stream: MediaStream; source: CameraVideo } | null>(null)
  useEffect(() => {
    const source = acquire(stream)
    setCurrent({ stream, source })
    return () => release(stream, source)
  }, [stream])
  const source = current?.stream === stream ? current.source : null
  useEffect(() => {
    source?.video.setAttribute('aria-label', label)
  }, [source, label])
  return source?.texture ?? null
}
