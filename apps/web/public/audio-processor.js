class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(0)
    this.batchSize = 4000 // 250ms at 16kHz
    this.frameCount = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0] // Float32, mono channel

    // Append to buffer
    const newBuffer = new Float32Array(this.buffer.length + samples.length)
    newBuffer.set(this.buffer)
    newBuffer.set(samples, this.buffer.length)
    this.buffer = newBuffer

    // When we have enough for a batch
    while (this.buffer.length >= this.batchSize) {
      const batch = this.buffer.slice(0, this.batchSize)
      this.buffer = this.buffer.slice(this.batchSize)

      // Convert Float32 → Int16
      const pcm = new Int16Array(this.batchSize)
      let sumSq = 0
      let maxAbs = 0
      for (let i = 0; i < this.batchSize; i++) {
        const s = batch[i]
        const clamped = Math.max(-1, Math.min(1, s))
        pcm[i] = clamped < 0 ? clamped * 32768 : clamped * 32767
        sumSq += clamped * clamped
        const abs = Math.abs(clamped)
        if (abs > maxAbs) maxAbs = abs
      }

      // Send PCM audio data
      this.port.postMessage({ type: "audio", buffer: pcm.buffer }, [pcm.buffer])

      // Send level data every 4th batch (~15Hz)
      this.frameCount++
      if (this.frameCount % 4 === 0) {
        const rms = Math.sqrt(sumSq / this.batchSize)
        const peak = maxAbs
        this.port.postMessage({ type: "level", rms, peak })
      }
    }

    return true
  }
}

registerProcessor("pcm-processor", PCMProcessor)
