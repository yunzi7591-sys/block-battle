import wave, struct, math, random

def save_wav(filename, samples, sample_rate=44100):
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = []
        for s in samples:
            # clip to avoid extreme distortion
            s = max(-1.0, min(1.0, s))
            frames.append(struct.pack('<h', int(32767.0 * s)))
        wav.writeframes(b''.join(frames))

def gen_place():
    # Wooden "kon" - short thump with thud
    sr = 44100
    dur = 0.08
    samples = []
    for i in range(int(sr * dur)):
        t = i / sr
        env = math.exp(-t * 60) # Fast decay
        # mix of 350Hz, 700Hz, and a tiny bit of noise for wood texture
        s1 = math.sin(2 * math.pi * 350 * t)
        s2 = math.sin(2 * math.pi * 700 * t) * 0.5
        noise = random.uniform(-1, 1) * 0.1
        samples.append((s1 + s2 + noise) * env * 0.8)
    save_wav('assets/place.wav', samples)

def gen_clear():
    # "Parin! Zudon!" - Glass break (high burst) + explosion (low punch)
    sr = 44100
    dur = 0.45
    samples = []
    for i in range(int(sr * dur)):
        t = i / sr
        
        # Explosion part: low sine sweep 180Hz -> 40Hz with slowish decay
        freq_exp = max(40, 180 - t * 400)
        env_exp = math.exp(-t * 8)
        exp_snd = math.sin(2 * math.pi * freq_exp * t) * env_exp
        
        # Glass part: high frequency burst with noise, very fast decay
        env_glass = math.exp(-t * 30)
        glass_snd = (math.sin(2 * math.pi * 4000 * t) * 0.5 + random.uniform(-1, 1)) * env_glass
        
        # Mix
        samples.append((exp_snd * 0.9 + glass_snd * 0.4) * 0.9)
    save_wav('assets/clear.wav', samples)

def gen_error():
    # "Bubu" - low sawtooth
    sr = 44100
    dur = 0.15
    samples = []
    for i in range(int(sr * dur)):
        t = i / sr
        env = math.exp(-t * 15)
        freq = 120
        # Sawtooth approx
        val = 2.0 * (t * freq - math.floor(t * freq + 0.5))
        samples.append(val * env * 0.5)
    save_wav('assets/error.wav', samples)

def gen_combo():
    # Unused now, we will pitch-shift clear.wav dynamically.
    save_wav('assets/combo.wav', [0])

gen_place()
gen_clear()
gen_error()
gen_combo() # empty

print("V2 Layered Sounds Generated!")
