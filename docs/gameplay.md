# Gameplay and character foundation

## Controls and course

WASD/arrows move relative to the camera. Space jumps; Q/E or ↶/↷ orbit. On touch screens hold a direction and tap Jump with a second finger; orbit buttons also use pointer capture. Releasing/cancelling a pointer clears that input. The launch pad and five-island route remain shared by Telegram and Minima.

Secure the first amber checkpoint on island 2, jump diagonally right to island 3, then jump across the sweeping amber block and left toward island 4's checkpoint. Cross the last gap into the cyan arch. Waiting, jumping over the block, or timing its sideways sweep are all valid. Both checkpoints must be secured before the finish activates. Checkpoint pads turn cyan and pulse; the HUD announces progress. The finish freezes the timer, cheers the cat and plays a small looping particle celebration until Restart.

Falls below the recovery threshold and obstacle hits start a 0.4 second shrink/recovery transition. They increment Recoveries once, preserve elapsed time and checkpoint progress, clear jump/velocity state, and return to the most recent safe pad with a brief 0.65 second collision grace period. Restart resets time, checkpoint progress, recoveries, hazards and celebration, while keeping the existing camera view and orbit heading so the camera does not teleport.

## Controller tuning

| Setting                | Value                     | Purpose                                   |
| ---------------------- | ------------------------- | ----------------------------------------- |
| Fixed step             | 1/120 s                   | Deterministic physics and obstacle timing |
| Run speed              | 6 units/s                 | Same reachable gaps as the foundation     |
| Acceleration / braking | 34 / 42 units/s²          | Short, responsive ramp-up and stop        |
| Coyote window          | 100 ms                    | Forgives jumping just after a ledge       |
| Jump buffer            | 120 ms                    | Retains a press shortly before landing    |
| Jump / gravity         | 8.5 units/s / 18 units/s² | Existing jump envelope                    |

Only rising jump edges enter the buffer; holding the button cannot repeatedly jump. Consumed coyote/buffer timers prevent midair double jumps. Sweeper bounds include the player's foot radius, with a conservative swept horizontal obstacle range per tick. This is sufficient for the slow authored obstacle, not a general collision engine for arbitrarily fast hazards.

## Manual verification

1. Run `npm ci`, `npm run dev:telegram` or `npm run dev:minima`. Try gentle starts, reversals and letting go; the cat should turn smoothly, stop promptly, breathe at idle and stride while running.
2. Jump at a ledge just after leaving it; press Jump shortly before landing; verify one jump triggers and holding does not repeat it. Check the airborne pose and landing squash.
3. Rotate the camera using Q/E or its buttons, then move forward/sideways; movement should follow its heading. Jump at portrait and landscape sizes: the character should stay visible. Fall/restart from late in the course and check that the camera returns smoothly.
4. Secure each checkpoint, observe cyan feedback, deliberately fall and verify recovery there. Walk into the amber sweeper for collision feedback, then jump over it on another attempt. Finish with both checkpoints, check the timer/cheer/sparkles, then Restart and verify all progress resets.
5. On a physical phone, use simultaneous movement/jump, drag outside a pressed button, cancel pointers, rotate, switch apps and return. Confirm no page scroll, browser overscroll or controls under a notch. Check short landscape views and thermal/frame-time behavior on a low-end device.
6. Follow [deployment](deployment.md) for a real Telegram client and classic MDS installation. MDS must remain READ-only and request only `status`. No transactions or account features are involved.

Automated Chromium tests cover production builds with desktop/mobile emulation and host mocks. Full-course tests use Playwright's controlled animation clock and ordinary keyboard events; separate tests use real simultaneous touch input. These are not physical-device, live Telegram or live-node claims. The replacement visual lifecycle is unit-tested with asynchronous sources; an actual approved GLB/rig and real-device performance remain future integration work.
