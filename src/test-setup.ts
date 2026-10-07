import { MotionGlobalConfig } from 'motion/react'

// Tests check what the screen ends up showing, not the motion on the way. With animations skipped, a sheet that is closing
// is gone straight away instead of waiting on frame timing, which jsdom does not give reliably.
MotionGlobalConfig.skipAnimations = true
