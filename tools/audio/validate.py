"""Validate original bundled audio: manifest, format, safe peaks and loop boundaries."""
import hashlib, json, wave
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]/'assets/audio'
manifest=json.loads((root/'manifest.json').read_text())
assert manifest['license']=='CC0-1.0'
assert (root/'LICENSE.md').is_file()
assert set(manifest['assets'])=={'jump','land','dive','slide','collision','checkpoint','countdown','start','finish','victory','menu','race','results'}
for name,info in manifest['assets'].items():
    path=root/(name+'.wav')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==info['sha256'],name
    with wave.open(str(path),'rb') as f:
        assert f.getframerate()==22050 and f.getsampwidth()==2,name
        assert f.getnchannels()==(2 if name in ['menu','race','results'] else 1),name
        assert abs(f.getnframes()/22050-info['seconds'])<1e-8,name
        pcm=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2')
        assert len(pcm)>0 and 0<abs(pcm.astype(float)).max()<27000,name
        assert abs(int(pcm[0]))<2 and abs(int(pcm[-1]))<2,name
print('13 original audio assets: hashes, PCM format, peaks, fades and CC0 manifest verified')
