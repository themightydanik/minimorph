import { mountGame } from '@minimorph/game-ui';
import '@minimorph/game-ui/style.css';
import { hasMdsSession, connectMds } from '@minimorph/minima-adapter';
const game = mountGame(document.querySelector<HTMLElement>('#app')!, 'MINIMA / PRACTICE');
let disconnect: (() => void) | undefined, destroyed = false;
game.setHostStatus('Browser practice · no Minima node connected');
if (hasMdsSession(window.location.search)) {
  game.setHostStatus('Connecting to MDS · read only…');
  const script = document.createElement('script'); script.src = './mds.js';
  script.onload = () => { if (!destroyed) { if (window.MDS) disconnect = connectMds(window.MDS, text => game.setHostStatus(text)); else game.setHostStatus('MDS bridge unavailable · practice still works'); } };
  script.onerror = () => { if (!destroyed) game.setHostStatus('MDS bridge unavailable · practice still works'); };
  document.head.append(script);
}
window.addEventListener('pagehide', () => { destroyed = true; disconnect?.(); game.destroy(); }, { once: true });
window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });
