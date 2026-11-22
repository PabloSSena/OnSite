import { speechLevel } from './speechMotion'

export function createMicrophoneMeter(stream: MediaStream) {
  const context = new AudioContext()
  try {
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    const samples = new Float32Array(analyser.fftSize)
    // No destination connection: analysing must never play our mic through speakers.
    source.connect(analyser)
    let disposed = false
    const resume = () => {
      if (!disposed && context.state === 'suspended') void context.resume().catch(() => {})
    }
    resume()
    return {
      resume,
      level() {
        if (disposed || context.state !== 'running'
          || !stream.getAudioTracks().some(track => track.enabled && track.readyState === 'live' && !track.muted)) return 0
        analyser.getFloatTimeDomainData(samples)
        return speechLevel(samples)
      },
      dispose() {
        if (disposed) return
        disposed = true
        source.disconnect()
        analyser.disconnect()
        void context.close().catch(() => {})
      },
    }
  } catch (error) {
    void context.close().catch(() => {})
    throw error
  }
}
