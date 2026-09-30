type NavigationClick = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
};

/** The persistent book shell owns page motion, including talent navigation. */
export function navigateTalentPage(click: NavigationClick, _href: string, navigate: () => void) {
  if (click.defaultPrevented || click.button !== 0 || click.altKey || click.ctrlKey || click.metaKey || click.shiftKey) return false;
  click.preventDefault();
  navigate();
  return true;
}
