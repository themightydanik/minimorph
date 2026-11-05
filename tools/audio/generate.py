"""Original Minimorph synth cues and compositions, CC0. No samples or third-party music."""
from pathlib import Path
import numpy as np
import wave, json, hashlib
ROOT = Path(__file__).resolve().parents[2] / 'assets/audio'
ROOT.mkdir(parents=True, exist_ok=True)
RATE = 22050
rng = np.random.default_rng(102026)
manifest = {}
def save(name, data):
    data = np.asarray(data)
    data *= min(1, .82 / max(.001, float(abs(data).max())))
    # Short fade guards prevent clicks; loops have no un-decayed last note.
    fade = min(220, len(data)//4)
    data[:fade] *= np.linspace(0,1,fade)[:,None] if data.ndim>1 else np.linspace(0,1,fade)
    data[-fade:] *= np.linspace(1,0,fade)[:,None] if data.ndim>1 else np.linspace(1,0,fade)
    pcm = (np.clip(data,-1,1)*32767).astype('<i2')
    path = ROOT / (name+'.wav')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2 if data.ndim>1 else 1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm.tobytes())
    manifest[name] = {'seconds':len(data)/RATE,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
def cue(name, duration, frequencies, noise=0):
    t=np.arange(int(RATE*duration))/RATE
    phase=2*np.pi*np.cumsum(np.linspace(frequencies[0],frequencies[-1],len(t)))/RATE
    env=np.minimum(1,t/.008)*np.exp(-t/(duration*.32))
    data=(np.sin(phase)*.48+np.sin(phase*2)*.1+rng.normal(0,noise,len(t)))*env
    save(name,data)
for args in [('jump',.26,[270,760],0),('land',.2,[110,55],.08),('dive',.3,[650,120],.045),('slide',.6,[180,90],.12),('collision',.35,[160,50],.2),('checkpoint',.65,[520,1040],0),('countdown',.14,[440,440],0),('start',.45,[660,1320],0),('finish',.9,[520,1560],0),('victory',1.3,[660,1320],0)]: cue(*args)
def note(midi): return 440*2**((midi-69)/12)
def music(name,bpm,bars,roots,melody):
    beat=60/bpm; length=int(RATE*beat*4*bars); data=np.zeros((length,2),dtype=np.float64)
    def add(start,duration,freq,volume,pan=0,bass=False):
        n=min(int(duration*RATE),length-int(start*RATE)); t=np.arange(n)/RATE
        env=np.minimum(1,t/.025)*np.exp(-t/(duration*.36))
        tone=(np.sin(2*np.pi*freq*t)+.13*np.sin(2*np.pi*freq*2*t)+(.05 if not bass else .02)*np.sin(2*np.pi*freq*3*t))*env*volume
        at=int(start*RATE); data[at:at+n,0]+=tone*(1-pan*.35); data[at:at+n,1]+=tone*(1+pan*.35)
    for bar in range(bars):
        root=roots[bar%len(roots)]
        for offset in [0,4,7]: add(bar*4*beat,3.7*beat,note(root+offset),.045,(offset-3)/8)
        for b in range(4):
            add((bar*4+b)*beat,.8*beat,note(root-12),.09,bass=True)
            if name=='race':
                add((bar*4+b)*beat,.12,55,.16,bass=True)
                if b%2: add((bar*4+b+.5)*beat,.055,3200,.018)
        for step,m in enumerate(melody[bar%len(melody)]):
            if m is not None: add((bar*4+step*.5)*beat,.43*beat,note(m),.075,(-1 if step%2 else 1)*.4)
    save(name,data)
# Original eight-bar motifs in a bright major pentatonic palette.
melody=[[72,76,79,None,81,79,76,None],[74,77,81,None,79,77,74,None],[76,79,83,81,79,None,76,None],[74,72,67,None,69,71,72,None]]
music('menu',96,8,[48,53,57,55],melody)
music('race',116,8,[48,53,57,55],melody)
music('results',104,4,[48,53,55,48],[[72,76,79,84,None,79,76,None],[77,81,84,None,81,79,77,None],[79,83,86,None,83,79,77,None],[84,None,79,None,76,None,72,None]])
(ROOT/'manifest.json').write_text(json.dumps({'license':'CC0-1.0','generator':'tools/audio/generate.py','assets':manifest},indent=2)+'\n')
