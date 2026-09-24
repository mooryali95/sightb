/**
 * Runs the frame guard the moment it is imported. main.tsx imports it first,
 * and ES modules evaluate in import order, so the guard has decided, and the
 * notice is on screen, before any other module runs; one that fails as it
 * loads (storage refused to a third-party frame, say) cannot stop it.
 */
import { allowedToRender } from './frame-guard';

export const renderAllowed = allowedToRender(window, document.getElementById('root'));
