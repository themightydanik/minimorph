import { it, expect, vi } from 'vitest';
import { connectMds, hasMdsSession } from './index';
it('distinguishes browser practice from an MDS session hint', () => {
  expect(hasMdsSession('')).toBe(false); expect(hasMdsSession('?uid=0x00')).toBe(false); expect(hasMdsSession('?uid=hello')).toBe(false); expect(hasMdsSession('?uid=0x123abc')).toBe(true);
});
it('requests only read-only status once and ignores callbacks after disposal', () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  let event: (msg: { event?: string }) => void = () => {};
  let result: (r: { status?: boolean; response?: { chain?: { block?: number } } }) => void = () => {};
  const bridge = { init: vi.fn(callback => { event = callback; }), cmd: vi.fn((command, callback) => { expect(command).toBe('status'); result = callback; }) };
  const report = vi.fn(); const dispose = connectMds(bridge, report);
  event({ event: 'inited' }); event({ event: 'inited' }); expect(bridge.cmd).toHaveBeenCalledTimes(1);
  result({ status: true, response: { chain: { block: 42 } } }); expect(report).toHaveBeenLastCalledWith('Minima node · block 42 · read only');
  dispose(); report.mockClear(); result({ status: false }); expect(report).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
it('reports unavailable node responses without claiming connection', () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const report = vi.fn(); const dispose = connectMds({ init: cb => cb({ event: 'inited' }), cmd: (_cmd, cb) => cb({ status: false }) }, report);
  expect(report).toHaveBeenCalledWith('Node status unavailable · practice still works'); dispose(); vi.unstubAllGlobals();
});
