/* Shared local SVG icons; no icon font or UI dependency. */
const wmIconPaths = {
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-8h6v8"/>',
  dumbbell:'<path d="m6 7 11 11M3 8l5-5m8 18 5-5M2 5l3-3m14 20 3-3M5 10l5-5m4 14 5-5"/>',
  star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9L12 3Z"/>',
  link:'<path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-11 4h4"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M21 12H9"/>',
};
function wmIcon(name) { return `<svg class="wm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${wmIconPaths[name] || wmIconPaths.activity}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = wmIcon(el.dataset.icon); }); }
let toastTimer;
function notify(message) {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  wmMotion.toastIn(toast);
  toastTimer = setTimeout(() => { wmMotion.toastOut(toast); }, 4500);
}
function setupMediaDialog(modal) {
  const dialog = modal.querySelector('.media-dialog');
  const heading = dialog.querySelector('h2');
  heading.id = 'mediaDialogTitle';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', heading.id);
  modal.returnFocus = document.activeElement;
  modal.previousOverflow = document.body.style.overflow;
  document.getElementById('app').inert = true;
  document.body.style.overflow = 'hidden';
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeMedia(modal); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.querySelector('.modal-close').focus({ preventScroll: true });
  wmMotion.modalEnter(modal);
}
function closeMedia(modal, immediate = false) {
  if (!modal) return;
  const remove = () => {
    modal.remove();
    const hasModal = !!document.querySelector('.media-modal');
    document.getElementById('app').inert = hasModal;
    if (!hasModal) document.body.style.overflow = modal.previousOverflow || '';
    if (!hasModal && modal.returnFocus?.isConnected) modal.returnFocus.focus({ preventScroll: true });
  };
  if (immediate) remove();
  else wmMotion.modalExit(modal, remove);
}
hydrateIcons();
