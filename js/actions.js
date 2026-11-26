/* Cancelling whatever the player is in the middle of. */

import { setMessage } from './state.js';
import { dismissMenus } from './wheel.js';
import { render } from './render.js';

// cancels the current mode or menu and clears the message
export function cancelMode() {
  dismissMenus();
  setMessage('');
  render();
}
