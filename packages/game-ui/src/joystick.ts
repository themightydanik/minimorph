/** Radial dead zone with continuous intensity outside it, clamped to the unit circle. */
export function analogVector(dx: number, dz: number, radius: number, deadZone = 0.14) {
  const length = Math.hypot(dx, dz);
  const raw = Math.min(1, length / Math.max(1, radius));
  const strength = Math.max(0, (raw - deadZone) / (1 - deadZone));
  return length > 0 ? { x: dx / length * strength, z: dz / length * strength } : { x: 0, z: 0 };
}
/** One captured pointer owns the stick; other fingers remain available for jump/dive/camera. */
export function mountJoystick(element: HTMLElement, signal: AbortSignal) {
  let pointer: number | undefined;
  let value = { x: 0, z: 0 };
  const knob = element.querySelector<HTMLElement>('.joystick-knob')!;
  const reset = () => {
    const previous = pointer;
    pointer = undefined;
    value = { x: 0, z: 0 };
    knob.style.transform = 'translate(0px,0px)';
    element.classList.remove('pressed');
    element.dataset.x = element.dataset.z = '0';
    if (previous !== undefined && element.hasPointerCapture(previous)) element.releasePointerCapture(previous);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dz = event.clientY - rect.top - rect.height / 2;
    value = analogVector(dx, dz, radius);
    const clamp = Math.min(1, radius / Math.max(1, Math.hypot(dx, dz)));
    knob.style.transform = `translate(${dx * clamp}px,${dz * clamp}px)`;
    element.dataset.x = String(value.x); element.dataset.z = String(value.z);
  };
  element.addEventListener('pointerdown', event => {
    if (pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    element.setPointerCapture(pointer);
    element.classList.add('pressed');
    move(event);
  }, { signal });
  element.addEventListener('pointermove', move, { signal });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    element.addEventListener(name, event => { if (event.pointerId === pointer) reset(); }, { signal });
  signal.addEventListener('abort', reset, { once: true });
  return { read: () => value, reset };
}
