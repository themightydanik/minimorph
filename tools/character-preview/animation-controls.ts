import * as pc from 'playcanvas';
export function animationControls(app: pc.Application, root: pc.Entity, canvas: HTMLCanvasElement, signal: AbortSignal) {
  const asset = app.assets.find('Character model', 'container');
  const resource = asset?.resource as pc.ContainerResource | undefined;
  if (!resource?.animations.length) throw new Error('Animated GLB contains no loaded clips');
  root.addComponent('anim', { activate: true });
  const anim = root.anim!;
  const loopable = new Set(['Idle', 'Run', 'Fall']);
  const tracks = new Map(resource.animations.map(asset => [asset.name, asset.resource as pc.AnimTrack]));
  // Container animation asset names may include a prefix; tracks keep glTF clip names.
  const named = new Map([...tracks].map(([name, track]) => [track.name || name, track]));
  const select = document.querySelector<HTMLSelectElement>('#clip')!;
  const loop = document.querySelector<HTMLInputElement>('#loop')!;
  const speed = document.querySelector<HTMLInputElement>('#speed')!;
  const button = document.querySelector<HTMLButtonElement>('#play')!;
  const nodes = [root, ...root.find(() => true) as pc.Entity[]];
  const neutral = nodes.map(node => ({ node, p: node.getLocalPosition().clone(), q: node.getLocalRotation().clone(), s: node.getLocalScale().clone() }));
  for (const name of ['Idle', 'Run', 'Jump', 'Fall', 'Land', 'Victory']) {
    const track = named.get(name);
    if (!track) throw new Error(`Missing loaded track ${name}: ${[...named.keys()]}`);
    anim.assignAnimation(name, track, undefined, 1, loopable.has(name));
  }
  function choose() {
    const name = select.value;
    anim.enabled = true;
    anim.playing = true;
    anim.speed = Number(speed.value);
    loop.disabled = !loopable.has(name);
    loop.checked = loopable.has(name);
    anim.baseLayer!.transition(name, 0, 0);
    button.textContent = 'Pause';
    canvas.dataset.clip = name;
  }
  select.addEventListener('change', choose, { signal });
  button.addEventListener('click', () => { if (!anim.enabled) { choose(); return; } anim.playing = !anim.playing; button.textContent = anim.playing ? 'Pause' : 'Play'; }, { signal });
  speed.addEventListener('input', () => { anim.speed = Number(speed.value); }, { signal });
  loop.addEventListener('change', () => {
    const name = select.value;
    anim.assignAnimation(name, named.get(name)!, undefined, 1, loop.checked && loopable.has(name));
  }, { signal });
  document.querySelector('#neutral')!.addEventListener('click', () => {
    anim.playing = false; anim.enabled = false;
    for (const { node, p, q, s } of neutral) { node.setLocalPosition(p); node.setLocalRotation(q); node.setLocalScale(s); }
    canvas.dataset.clip = 'Neutral'; button.textContent = 'Play';
  }, { signal });
  const update = () => {
    const hand = root.findByName('Hand.L');
    canvas.dataset.handPosition = hand ? hand.getPosition().toString() : '';
    canvas.dataset.activeAnimation = anim.baseLayer!.activeState;
    canvas.dataset.animationTime = String(anim.baseLayer!.activeStateCurrentTime);
    canvas.dataset.playing = String(anim.playing && anim.enabled);
    canvas.dataset.animationSpeed = String(anim.speed);
  };
  app.on('update', update);
  signal.addEventListener('abort', () => app.off('update', update), { once: true });
  choose();
  canvas.dataset.animationClips = String(named.size);
}
