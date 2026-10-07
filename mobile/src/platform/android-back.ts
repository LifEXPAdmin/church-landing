export type AndroidBackActions = {
  isKeyboardVisible: () => boolean;
  dismissKeyboard: () => void;
  goBack: () => boolean;
};

/** Handle committed Back events only; the OS owns gesture progress and cancellation. */
export function handleAndroidBack(actions: AndroidBackActions): boolean {
  // Android usually consumes IME Back first. If a JS event arrives while the
  // keyboard is still known to be visible, do not also pop the current screen.
  if (actions.isKeyboardVisible()) {
    actions.dismissKeyboard();
    return true;
  }
  return actions.goBack();
}
