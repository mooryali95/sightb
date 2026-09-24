/**
 * The animation features the landing and login pages use, loaded on demand.
 *
 * Those pages render framer-motion's lightweight `m` components under the
 * LazyMotion in App, so the first download carries no animation engine; this
 * module, and the engine with it, arrives in its own chunk once a page asks.
 * `domAnimation` covers what they use: enter, exit and transitions.
 */
import { domAnimation } from 'framer-motion';

export default domAnimation;
