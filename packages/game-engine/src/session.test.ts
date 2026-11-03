import { it, expect } from 'vitest';
import { RaceSession } from './session';
import { LevelManager } from './levels';
it('covers selection, briefing, countdown, racing, pause/resume, result and next arena', () => {
 const race=new RaceSession('cosmic-sprint'), levels=new LevelManager();
 expect(race.phase).toBe('selection'); race.select(levels.current.id); expect(race.phase).toBe('prepare');
 race.start(); race.tick(1); expect(race.snapshot().countdown).toBe(2); expect(race.phase).toBe('countdown');
 race.tick(2); expect(race.phase).toBe('racing'); expect(race.snapshot().go).toBe(true);
 race.pause(); race.tick(10); expect(race.phase).toBe('paused');
 race.start(); race.tick(3); expect(race.phase).toBe('racing'); race.finish(); expect(race.phase).toBe('finished');
 levels.load(levels.next()!.id); race.select(levels.current.id); expect(race.arenaId).toBe('orbit-chaos'); expect(race.phase).toBe('prepare');
 expect(()=>levels.load('invalid')).toThrow(); expect(levels.current.id).toBe('orbit-chaos');
 race.choose(); expect(race.phase).toBe('selection');
});
