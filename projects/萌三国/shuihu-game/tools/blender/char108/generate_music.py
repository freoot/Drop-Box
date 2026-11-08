#!/usr/bin/env python3
"""Generate original Chinese-style (国风) game music loops using numpy + scipy.

Two tracks:
  - liangshan_city.mp3 : Liangshan main city theme (leisurely, pipa + dizi)
  - battle_theme.mp3   : Battle theme (intense, drums + guzheng)

All sounds are synthesized — no samples, no copyrighted material.
Output: assets/releases/CHAR-108/audio/

Run: python3 tools/blender/char108/generate_music.py
"""
import numpy as np
from scipy.io import wavfile
import subprocess, os
from pathlib import Path

OUT = Path(__file__).resolve().parents[3] / 'assets' / 'releases' / 'CHAR-108' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 44100
BPM = 90  # city theme; battle uses 120

# ---------- synthesis helpers ----------
def envelope(attack=0.01, decay=0.1, sustain=0.6, release=0.3, duration=1.0):
    """ADSR envelope."""
    total_samples = int(SAMPLE_RATE * duration)
    env = np.zeros(total_samples)
    a = int(SAMPLE_RATE * attack)
    d = int(SAMPLE_RATE * decay)
    s = max(0, total_samples - a - d - int(SAMPLE_RATE * release))
    r = total_samples - a - d - s

    if a > 0: env[:a] = np.linspace(0, 1, a)
    if d > 0: env[a:a+d] = np.linspace(1, sustain, d)
    if s > 0: env[a+d:a+d+s] = sustain
    if r > 0: env[a+d+s:] = np.linspace(sustain, 0, r)
    return env

def sine(freq, duration, amp=0.3):
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)

def pluck(freq, duration, amp=0.4, brightness=0.7):
    """Karplus-Strong like plucked string (pipa/guzheng)."""
    n = int(SAMPLE_RATE * duration)
    period = int(SAMPLE_RATE / freq)
    # noise burst seed
    seed = np.random.randn(period) * 0.5
    output = np.zeros(n)
    # simple waveguide
    buf = seed.copy()
    for i in range(n):
        output[i] = buf[i % period]
        # low-pass filter + decay
        buf[i % period] = 0.995 * (buf[i % period] + buf[(i+1) % period]) * 0.5
    # envelope
    env = envelope(0.005, 0.08, 0.3, duration*0.7, duration)
    return output[:n] * env * amp * brightness

def flute(freq, duration, amp=0.3):
    """Flute-like sound (sine + breath noise + vibrato)."""
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    # vibrato
    vibrato = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
    tone = np.sin(2 * np.pi * freq * vibrato * t)
    # breath noise
    breath = np.random.randn(len(t)) * 0.02
    # formant-like harmonics
    tone += 0.3 * np.sin(2 * np.pi * freq * 2 * vibrato * t)
    tone += 0.1 * np.sin(2 * np.pi * freq * 3 * vibrato * t)
    env = envelope(0.05, 0.1, 0.7, 0.2, duration)
    return (tone + breath) * env * amp

def drum(duration=0.15, amp=0.5, low=120, high=80):
    """Kick drum."""
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    # frequency sweep
    freq = low + (high - low) * np.exp(-t * 30)
    tone = np.sin(2 * np.pi * np.cumsum(freq) / SAMPLE_RATE)
    env = np.exp(-t * 15)
    # noise burst
    noise = np.random.randn(n) * np.exp(-t * 50) * 0.3
    return (tone + noise) * env * amp

def cymbal(duration=0.3, amp=0.2):
    """Hi-hat / cymbal."""
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    noise = np.random.randn(n)
    # bandpass-ish
    from scipy.signal import butter, lfilter
    b, a = butter(2, [0.3, 0.8], btype='band')
    noise = lfilter(b, a, noise)
    env = np.exp(-t * 8)
    return noise * env * amp

def guzheng_note(freq, duration, amp=0.35):
    """Guzheng-like: multiple plucked harmonics."""
    n = int(SAMPLE_RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    # fundamental + harmonics
    tone = np.zeros(n)
    harmonics = [(1, 1.0), (2, 0.5), (3, 0.25), (4, 0.12)]
    for mult, weight in harmonics:
        tone += weight * pluck(freq * mult, duration, amp=1.0, brightness=0.8)[:n]
    env = envelope(0.003, 0.15, 0.4, duration*0.8, duration)
    return tone * env * amp / 2

def silence(duration):
    return np.zeros(int(SAMPLE_RATE * duration))

# ---------- scales ----------
# Pentatonic scales (五声音阶) - 宫商角徵羽
PENTATONIC_MAJOR = [1, 9/8, 5/4, 3/2, 5/3, 2]  # 宫商角徵羽宫 (relative)
PENTATONIC_MINOR = [1, 6/5, 4/3, 3/2, 9/5, 2]  # 羽调式

def note_freq(midi_note):
    return 440 * (2 ** ((midi_note - 69) / 12))

# D major pentatonic: D E F# A B  (宫商角徵羽)
# MIDI: D4=62, E4=64, F#4=66, A4=69, B4=71, D5=74
D_PENTA_MAJOR = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]  # 2 octaves
# A minor pentatonic: A C D E G
A_PENTA_MINOR = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79]

# ---------- track: Liangshan city ----------
def make_city_theme():
    """Peaceful, flowing city theme — pipa + dizi + light percussion.
    D major pentatonic, 90 BPM, 16-bar loop.
    """
    beat = 60 / BPM  # seconds per beat
    bar = beat * 4
    total_bars = 16
    total_duration = bar * total_bars
    n_total = int(SAMPLE_RATE * total_duration)
    mix = np.zeros(n_total)

    # --- Melody (dizi / flute) ---
    # simple flowing melody in D pentatonic major
    melody_notes = [
        # bar 1-4: theme A
        [74, 76, 78, 76, 74, 71, 69, 66],   # bar 1
        [66, 69, 71, 69, 66, 64, 62, 64],   # bar 2
        [74, 76, 78, 81, 78, 76, 74, 71],   # bar 3
        [69, 71, 74, 71, 69, 66, 64, 62],   # bar 4
        # bar 5-8: variation
        [78, 76, 74, 71, 69, 71, 74, 76],   # bar 5
        [74, 71, 69, 66, 64, 66, 69, 71],   # bar 6
        [81, 78, 76, 74, 76, 78, 76, 74],   # bar 7
        [71, 69, 66, 64, 62, 64, 66, 69],   # bar 8
        # bar 9-12: theme B (higher register)
        [74, 78, 81, 78, 76, 74, 71, 69],   # bar 9
        [66, 69, 71, 74, 76, 74, 71, 69],   # bar 10
        [78, 81, 83, 81, 78, 76, 74, 71],   # bar 11
        [69, 71, 74, 76, 74, 71, 69, 66],   # bar 12
        # bar 13-16: closing
        [74, 76, 74, 71, 69, 71, 74, 76],   # bar 13
        [78, 76, 74, 69, 66, 69, 71, 74],   # bar 14
        [71, 69, 66, 64, 62, 64, 66, 69],   # bar 15
        [66, 64, 62, 0,  62, 64, 66, 62],   # bar 16 (resolve to 宫 D)
    ]

    note_dur = beat / 2  # eighth notes
    for bar_i, bar_notes in enumerate(melody_notes):
        for ni, midi in enumerate(bar_notes):
            if midi == 0: continue
            start = int((bar_i * bar + ni * note_dur) * SAMPLE_RATE)
            freq = note_freq(midi)
            note = flute(freq, note_dur * 1.1, amp=0.18)
            end = min(start + len(note), n_total)
            mix[start:end] += note[:end-start]

    # --- Pipa accompaniment (arpeggios) ---
    arp_patterns = [
        [62, 66, 69, 74, 69, 66],  # D (宫)
        [64, 69, 71, 76, 71, 69],  # E (商)
        [66, 71, 74, 78, 74, 71],  # F# (角)
        [69, 74, 78, 81, 78, 74],  # A (徵)
    ]
    for bar_i in range(total_bars):
        chord_idx = [0, 0, 3, 2, 0, 3, 1, 2, 0, 0, 3, 2, 0, 3, 0, 0][bar_i]
        pattern = arp_patterns[chord_idx]
        note_dur_p = beat / 2
        for ni, midi in enumerate(pattern):
            start = int((bar_i * bar + ni * (beat / 3)) * SAMPLE_RATE)
            if start >= n_total: break
            freq = note_freq(midi)
            note = pluck(freq, note_dur_p * 1.5, amp=0.12, brightness=0.7)
            end = min(start + len(note), n_total)
            mix[start:end] += note[:end-start]

    # --- Bass (low guzheng) ---
    bass_notes = [50, 50, 57, 54, 50, 57, 52, 54, 50, 50, 57, 54, 50, 57, 50, 50]  # D2, A2 etc.
    for bar_i, midi in enumerate(bass_notes[:total_bars]):
        start = int(bar_i * bar * SAMPLE_RATE)
        freq = note_freq(midi)
        note = guzheng_note(freq, bar * 0.9, amp=0.15)
        end = min(start + len(note), n_total)
        mix[start:end] += note[:end-start]

    # --- Light percussion (wood block / small drum) ---
    for bar_i in range(total_bars):
        for beat_i in range(4):
            if beat_i in (0, 2):  # beat 1 and 3
                start = int((bar_i * bar + beat_i * beat) * SAMPLE_RATE)
                d = drum(0.12, amp=0.08, low=200, high=100)
                end = min(start + len(d), n_total)
                mix[start:end] += d[:end-start]
            else:
                start = int((bar_i * bar + beat_i * beat) * SAMPLE_RATE)
                c = cymbal(0.08, amp=0.04)
                end = min(start + len(c), n_total)
                mix[start:end] += c[:end-start]

    # --- gentle reverb (simple delay) ---
    delay_samples = int(SAMPLE_RATE * 0.35)
    delay_mix = np.zeros_like(mix)
    delay_mix[delay_samples:] = mix[:-delay_samples] * 0.25
    mix = mix + delay_mix

    # normalize and soft clip
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.85
    # soft clip
    mix = np.tanh(mix * 1.2) * 0.8

    return mix, total_duration

# ---------- track: battle theme ----------
def make_battle_theme():
    """Intense battle theme — driving drums + low guzheng + urgent flute.
    A minor pentatonic (羽调式), 120 BPM, 8-bar loop.
    """
    bpm = 120
    beat = 60 / bpm
    bar = beat * 4
    total_bars = 8
    total_duration = bar * total_bars
    n_total = int(SAMPLE_RATE * total_duration)
    mix = np.zeros(n_total)

    # --- Urgent melody (high dizi, short notes) ---
    melody = [
        # bar 1-2
        [81, 79, 76, 74, 72, 74, 76, 79],
        [76, 74, 72, 69, 72, 74, 76, 72],
        # bar 3-4
        [83, 81, 79, 76, 79, 81, 79, 76],
        [74, 76, 79, 74, 72, 69, 72, 69],
        # bar 5-6
        [81, 76, 81, 79, 76, 74, 72, 69],
        [72, 74, 76, 79, 76, 74, 72, 69],
        # bar 7-8 (climax + resolve)
        [83, 81, 79, 81, 83, 81, 79, 76],
        [79, 76, 72, 69, 72, 76, 79, 69],
    ]

    note_dur = beat / 2
    for bar_i, bar_notes in enumerate(melody):
        for ni, midi in enumerate(bar_notes):
            start = int((bar_i * bar + ni * note_dur) * SAMPLE_RATE)
            freq = note_freq(midi)
            note = flute(freq, note_dur * 0.9, amp=0.22)
            # sharper attack
            env_len = len(note)
            env = envelope(0.01, 0.05, 0.7, 0.08, note_dur * 0.9)
            note = note[:len(env)] * env
            end = min(start + len(note), n_total)
            mix[start:end] += note[:end-start]

    # --- Low guzheng / bass ostinato ---
    ostinato = [
        [45, 0, 52, 0, 45, 0, 57, 0],  # bar 1: A2 E3 A3
        [45, 0, 52, 0, 48, 0, 55, 0],  # bar 2
        [50, 0, 57, 0, 50, 0, 62, 0],  # bar 3: D3 A3 D4
        [48, 0, 55, 0, 45, 0, 57, 0],  # bar 4
        [45, 0, 52, 0, 45, 0, 57, 0],  # bar 5
        [43, 0, 50, 0, 47, 0, 55, 0],  # bar 6
        [50, 0, 57, 0, 50, 0, 62, 0],  # bar 7
        [45, 0, 52, 0, 45, 0, 0, 0],   # bar 8 (resolve)
    ]
    for bar_i, bar_notes in enumerate(ostinato):
        for ni, midi in enumerate(bar_notes):
            if midi == 0: continue
            start = int((bar_i * bar + ni * (beat / 2)) * SAMPLE_RATE)
            freq = note_freq(midi)
            note = guzheng_note(freq, beat * 0.6, amp=0.2)
            end = min(start + len(note), n_total)
            mix[start:end] += note[:end-start]

    # --- Battle drums ---
    for bar_i in range(total_bars):
        for beat_i in range(4):
            t_start = bar_i * bar + beat_i * beat
            start = int(t_start * SAMPLE_RATE)

            # kick on 1 and 3
            if beat_i in (0, 2):
                d = drum(0.2, amp=0.5, low=100, high=60)
                end = min(start + len(d), n_total)
                mix[start:end] += d[:end-start]

            # snare-ish on 2 and 4
            if beat_i in (1, 3):
                n_snare = int(0.15 * SAMPLE_RATE)
                t_s = np.linspace(0, 0.15, n_snare, endpoint=False)
                noise = np.random.randn(n_snare) * np.exp(-t_s * 20) * 0.25
                # tone
                tone = np.sin(2 * np.pi * 200 * t_s) * np.exp(-t_s * 25) * 0.15
                snare = noise + tone
                end = min(start + len(snare), n_total)
                mix[start:end] += snare[:end-start]

            # hi-hat eighth notes
            for sub in range(2):
                h_start = int((t_start + sub * beat / 2) * SAMPLE_RATE)
                hh = cymbal(0.05, amp=0.06)
                end = min(h_start + len(hh), n_total)
                mix[h_start:end] += hh[:end-h_start]

    # --- battle cry / horn stabs on bar 1 and 5 ---
    for bar_i in [0, 4]:
        start = int(bar_i * bar * SAMPLE_RATE)
        # low brass-like (sawtooth + lowpass)
        dur = beat * 1.5
        n = int(dur * SAMPLE_RATE)
        t = np.linspace(0, dur, n, endpoint=False)
        freq = note_freq(57)  # A3
        saw = 2 * (t * freq - np.floor(0.5 + t * freq))
        env = envelope(0.02, 0.1, 0.6, 0.3, dur)
        horn = saw * env * 0.15
        end = min(start + len(horn), n_total)
        mix[start:end] += horn[:end-start]

    # normalize
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.88
    mix = np.tanh(mix * 1.3) * 0.78

    return mix, total_duration

# ---------- save helpers ----------
def save_wav(samples, path):
    # convert to int16
    int_samples = (samples * 32767).astype(np.int16)
    wavfile.write(str(path), SAMPLE_RATE, int_samples)

def convert_to_mp3(wav_path, mp3_path):
    subprocess.run([
        'ffmpeg', '-y', '-i', str(wav_path),
        '-codec:a', 'libmp3lame', '-qscale:a', '2',
        str(mp3_path)
    ], capture_output=True)

def make_loopable(samples, crossfade_beats=1, bpm=90):
    """Make the end crossfade into the beginning for seamless looping."""
    beat = 60 / bpm
    cf_samples = int(SAMPLE_RATE * beat * crossfade_beats)
    if cf_samples >= len(samples) // 2:
        return samples

    # take beginning and end, crossfade them
    beginning = samples[:cf_samples]
    ending = samples[-cf_samples:]
    # fade out ending, fade in beginning, sum
    fade_out = np.linspace(1, 0, cf_samples)
    fade_in = np.linspace(0, 1, cf_samples)
    crossfaded = ending * fade_out + beginning * fade_in

    # replace beginning with crossfaded section, keep middle
    result = samples.copy()
    result[:cf_samples] = crossfaded
    # trim to loop length (keep the crossfaded start, drop the tail that was used)
    return result[:len(samples) - cf_samples]

# ---------- main ----------
def main():
    print('=== Generating Liangshan city theme ===')
    city, city_dur = make_city_theme()
    city = make_loopable(city, crossfade_beats=2, bpm=90)
    city_wav = OUT / 'liangshan_city.wav'
    city_mp3 = OUT / 'liangshan_city.mp3'
    save_wav(city, city_wav)
    convert_to_mp3(city_wav, city_mp3)
    print(f'  City theme: {city_dur:.1f}s -> {city_mp3}')

    print('=== Generating battle theme ===')
    battle, battle_dur = make_battle_theme()
    battle = make_loopable(battle, crossfade_beats=1, bpm=120)
    battle_wav = OUT / 'battle_theme.wav'
    battle_mp3 = OUT / 'battle_theme.mp3'
    save_wav(battle, battle_wav)
    convert_to_mp3(battle_wav, battle_mp3)
    print(f'  Battle theme: {battle_dur:.1f}s -> {battle_mp3}')

    # clean up wav files
    for w in [city_wav, battle_wav]:
        try: w.unlink()
        except: pass

    print('\nDone! All music generated.')

if __name__ == '__main__':
    main()
