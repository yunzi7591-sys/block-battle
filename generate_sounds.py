import wave, struct, math

def generate_tone(filename, freq_start, freq_end, duration_sec, volume=0.5):
    sample_rate = 44100
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        
        frames = []
        for i in range(int(sample_rate * duration_sec)):
            t = float(i) / sample_rate
            progress = i / (sample_rate * duration_sec)
            freq = freq_start + (freq_end - freq_start) * progress
            
            # envelope: fast attack, linear decay
            env = 1.0 - progress
            vol = volume * env
            
            value = int(32767.0 * vol * math.sin(2.0 * math.pi * freq * t))
            frames.append(struct.pack('<h', value))
            
        wav.writeframes(b''.join(frames))

generate_tone('assets/place.wav', 800, 400, 0.08, 0.6)
generate_tone('assets/clear.wav', 300, 1200, 0.3, 0.8)
generate_tone('assets/combo.wav', 600, 1800, 0.4, 0.9)
generate_tone('assets/error.wav', 150, 100, 0.15, 0.5)
generate_tone('assets/gameover.wav', 300, 100, 1.0, 0.8)

print("Sounds generated!")
