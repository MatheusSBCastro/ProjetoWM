/* Motion recipes from the local animate skill; compositor-only, no dependency. */
const wmMotion = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const curves = getComputedStyle(document.documentElement);
  const ease = curves.getPropertyValue('--ease-out').trim();
  const moveEase = curves.getPropertyValue('--ease-in-out').trim();
  const animations = new Set();
  const transitions = new Set();
  const layers = new Set();
  let input = 'pointer';
  let toastExit;
  let motionPaused = localStorage.getItem('wm_motion_paused') === 'true';
  const allowed = () => !reduced.matches && !motionPaused && input !== 'keyboard';

  function play(element, frames, options = {}) {
    if (!element || !allowed()) return null;
    const animation = element.animate(frames, { duration: 250, easing: ease, ...options });
    animation.id = 'wm-motion';
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    return animation;
  }
  function finish(animation, callback) {
    if (!animation) { callback(); return; }
    animation.finished.then(callback, callback);
  }
  function stopTransitions() {
    transitions.forEach(animation => animation.cancel());
    transitions.clear();
    layers.forEach(layer => layer.remove());
    layers.clear();
  }
  function transition(element, frames, options) {
    const animation = play(element, frames, options);
    if (animation) {
      transitions.add(animation);
      animation.finished.then(() => transitions.delete(animation), () => transitions.delete(animation));
    }
    return animation;
  }
  function snapshot(element) {
    if (!element?.getClientRects().length || !element.childElementCount) return null;
    const box = element.getBoundingClientRect();
    const layer = element.cloneNode(true);
    layer.querySelectorAll('.wm-ripple').forEach(node => node.remove());
    [layer, ...layer.querySelectorAll('*')].forEach(node => {
      node.removeAttribute('id');
      node.removeAttribute('autofocus');
      [...node.attributes].filter(a => a.name.startsWith('on')).forEach(a => node.removeAttribute(a.name));
    });
    layer.inert = true;
    layer.setAttribute('aria-hidden', 'true');
    layer.classList.add('wm-transition-layer');
    Object.assign(layer.style, {
      position: 'fixed', top: box.top + 'px', left: box.left + 'px',
      width: box.width + 'px', height: box.height + 'px', maxWidth: 'none',
      maxHeight: Math.max(0, innerHeight - box.top) + 'px', margin: '0',
      overflow: 'hidden', pointerEvents: 'none', zIndex: '40',
    });
    document.body.append(layer);
    layers.add(layer);
    return layer;
  }
  function swapAccess(update, direction = 1) {
    stopTransitions();
    const source = document.querySelector('.access-panel > section:not([hidden])');
    const layer = allowed() ? snapshot(source) : null;
    update();
    const target = document.querySelector('.access-panel > section:not([hidden])');
    if (!allowed()) return;
    if (layer) finish(transition(layer, [
      { opacity: 1, transform: 'translateX(0) scale(1)' },
      { opacity: 0, transform: `translateX(${-24 * direction}px) scale(.98)` },
    ], { duration: 160 }), () => { layer.remove(); layers.delete(layer); });
    transition(target, [
      { opacity: 0, transform: `translateX(${32 * direction}px) scale(.98)` },
      { opacity: 1, transform: 'translateX(0) scale(1)' },
    ], { duration: 480 });
    if (target?.id === 'portalPicker') stagger([...target.querySelectorAll('.portal-grid button')], 45, 360);
  }
  function stagger(elements, spacing = 45, duration = 400) {
    elements.slice(0, 7).forEach((element, index) => transition(element, [
      { opacity: 0, transform: 'translateY(24px) scale(.985)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration, delay: Math.min(index * spacing, 200), fill: 'backwards' }));
  }
  function swapContent(update, changed) {
    stopTransitions();
    const content = document.getElementById('content');
    const layer = allowed() && changed ? snapshot(content) : null;
    update();
    moveIndicator();
    if (!allowed() || !changed) return;
    if (layer) finish(transition(layer, [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-12px)' },
    ], { duration: 140 }), () => { layer.remove(); layers.delete(layer); });
    transition(content.querySelector('.hero'), [
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 480 });
    const entries = [...content.querySelectorAll('.dashboard-stats, .dashboard-columns > section > .card, .dashboard-columns > aside > *, .tree > .card, .grid > .card, .professor-student-card, .link-group, .empty-state, .premium')];
    // Nested lists animate only their outer cards, keeping exercise data steady.
    stagger(entries.filter(node => !entries.some(parent => parent !== node && parent.contains(node))));
    revealOnScroll(content);
  }
  function moveIndicator(instant = false) {
    const nav = document.getElementById('nav');
    const active = nav?.querySelector('button.active');
    if (!active) return;
    let indicator = nav.querySelector('.wm-nav-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'wm-nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      nav.prepend(indicator);
    }
    const previous = indicator.getBoundingClientRect();
    indicator.getAnimations().forEach(a => a.cancel());
    const first = !indicator.dataset.ready;
    Object.assign(indicator.style, {
      left: active.offsetLeft + 'px', top: active.offsetTop + 'px',
      width: active.offsetWidth + 'px', height: active.offsetHeight + 'px',
    });
    nav.dataset.motion = 'true';
    indicator.dataset.ready = 'true';
    if (!first && !instant && allowed()) {
      const target = indicator.getBoundingClientRect();
      play(indicator, [
        { transform: `translate(${previous.left - target.left}px, ${previous.top - target.top}px) scale(${previous.width / target.width}, ${previous.height / target.height})` },
        { transform: 'translate(0, 0) scale(1, 1)' },
      ], { duration: 420, easing: ease });
    }
  }
  function workspace() {
    const sidebar = document.querySelector('.app-sidebar');
    play(sidebar, [{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 280 });
    play(document.querySelector('.app-header'), [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250 });
  }
  function modalEnter(modal) {
    modal.wmAnimated = allowed();
    play(modal, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    play(modal.querySelector('.media-dialog'), [
      { opacity: 0, transform: 'translateY(24px) scale(.96)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 280 });
  }
  function modalExit(modal, remove) {
    if (!allowed() || !modal.wmAnimated) { remove(); return; }
    if (modal.dataset.closing) return;
    modal.dataset.closing = 'true';
    const dialog = modal.querySelector('.media-dialog');
    const from = getComputedStyle(dialog).transform;
    const opacity = getComputedStyle(dialog).opacity;
    const backdropOpacity = getComputedStyle(modal).opacity;
    dialog.getAnimations().forEach(animation => animation.cancel());
    modal.getAnimations().forEach(animation => animation.cancel());
    play(dialog, [{ opacity, transform: from }, { opacity: 0, transform: 'translateY(24px) scale(.96)' }], { duration: 160 });
    finish(play(modal, [{ opacity: backdropOpacity }, { opacity: 0 }], { duration: 160 }), remove);
  }
  function toastIn(toast) {
    if (toastExit) { toastExit.cancel(); toastExit = null; }
    const visible = !toast.hidden;
    const start = visible ? getComputedStyle(toast).transform : 'translate(-50%, 28px) scale(.96)';
    const opacity = visible ? getComputedStyle(toast).opacity : 0;
    toast.getAnimations().forEach(a => a.cancel());
    toast.hidden = false;
    play(toast, [{ opacity, transform: start }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: 280 });
  }
  function toastOut(toast) {
    toastExit = play(toast, [
      { opacity: 1, transform: getComputedStyle(toast).transform },
      { opacity: 0, transform: 'translate(-50%, 28px) scale(.96)' },
    ], { duration: 180 });
    const exiting = toastExit;
    finish(exiting, () => { if (toastExit === exiting) { toast.hidden = true; toastExit = null; } });
  }
  function stars(button) {
    button?.getAnimations().forEach(a => a.cancel());
    play(button, [{ transform: 'scale(.9)' }, { transform: 'scale(1.18)', offset: .5 }, { transform: 'scale(1)' }], { duration: 250 });
  }
  function landing() {
    if (document.getElementById('login').hidden || !allowed()) return;
    play(document.querySelector('.story-copy > .eyebrow'), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 700 });
    [...document.querySelectorAll('.story-copy h1 > span, .story-copy h1 > em')].forEach((line, index) => play(line, [
      { opacity: 0, transform: 'translateY(45px) rotateX(12deg)' },
      { opacity: 1, transform: 'translateY(0) rotateX(0)' },
    ], { duration: 1000, delay: 90 + index * 130, fill: 'backwards' }));
    play(document.querySelector('.story-copy > p:not(.eyebrow)'), [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 800, delay: 220, fill: 'backwards' });
    play(document.querySelector('.movement-stage'), [
      { opacity: 0, transform: 'translateY(50px) scale(.88) rotate(-5deg)' },
      { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)' },
    ], { duration: 1400, delay: 120, fill: 'backwards' });
    stagger([...document.querySelectorAll('.portal-grid button')], 65, 620);
    play(document.querySelector('#portalPicker > h2'), [{ opacity: 0, transform: 'translateY(25px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 850 });
  }
  const revealed = new WeakSet();
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealObserver.unobserve(entry.target);
      if (revealed.has(entry.target)) continue;
      revealed.add(entry.target);
      play(entry.target, [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650 });
    }
  }, { threshold: .12 });
  function revealOnScroll(content) {
    revealObserver.disconnect();
    if (!allowed()) return;
    content.querySelectorAll('.card, .premium-teaser, .empty-state').forEach(card => {
      if (card.getBoundingClientRect().top > innerHeight - 24) revealObserver.observe(card);
    });
  }
  const story = document.querySelector('.login-story');
  const sculpture = document.querySelector('.movement-object');
  const sculptureImage = sculpture?.querySelector('img');
  const motionToggle = document.getElementById('motionToggle');
  let sceneVisible = true, pointerFrame = 0;
  function pauseScene() {
    document.body.dataset.motionPaused = String(motionPaused);
    if (sculptureImage) sculptureImage.style.animationPlayState = document.hidden || !sceneVisible || reduced.matches || motionPaused ? 'paused' : 'running';
    motionToggle.hidden = reduced.matches;
    motionToggle.setAttribute('aria-pressed', String(motionPaused));
    const label = motionPaused ? 'Retomar animação' : 'Pausar animação';
    motionToggle.setAttribute('aria-label', label);
    motionToggle.lastElementChild.textContent = label;
  }
  motionToggle.addEventListener('click', () => {
    motionPaused = !motionPaused;
    localStorage.setItem('wm_motion_paused', String(motionPaused));
    if (motionPaused) { stopTransitions(); revealObserver.disconnect(); animations.forEach(a => { try { a.finish(); } catch { a.cancel(); } }); }
    pauseScene();
  });
  pauseScene();
  new IntersectionObserver(entries => { sceneVisible = entries[0].isIntersecting; pauseScene(); }).observe(story);
  document.addEventListener('visibilitychange', pauseScene);
  story.addEventListener('pointermove', event => {
    if (!hover.matches || !allowed() || !sculpture || pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      const bounds = story.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      sculpture.style.setProperty('--scene-x', `${x * 22}px`);
      sculpture.style.setProperty('--scene-y', `${y * 16}px`);
      sculpture.style.setProperty('--scene-rotate', `${x * 3}deg`);
      pointerFrame = 0;
    });
  }, { passive: true });
  story.addEventListener('pointerleave', () => {
    cancelAnimationFrame(pointerFrame); pointerFrame = 0;
    sculpture?.style.removeProperty('--scene-x');
    sculpture?.style.removeProperty('--scene-y');
    sculpture?.style.removeProperty('--scene-rotate');
  });
  document.querySelectorAll('.portal-grid button').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (!hover.matches || !allowed()) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--card-x', `${(event.clientY - bounds.top - bounds.height / 2) / bounds.height * -5}deg`);
      card.style.setProperty('--card-y', `${(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 4}deg`);
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.removeProperty('--card-x'); card.style.removeProperty('--card-y'); });
  });
  document.addEventListener('keydown', () => {
    input = 'keyboard';
    document.body.dataset.input = 'keyboard';
    stopTransitions();
    animations.forEach(a => { try { a.finish(); } catch { a.cancel(); } });
  }, true);
  document.addEventListener('pointerdown', event => {
    input = 'pointer';
    document.body.dataset.input = 'pointer';
    const button = event.target.closest('button');
    if (!button || button.disabled || !allowed() || button.classList.contains('exercise-media')) return;
    const bounds = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'wm-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const size = Math.max(bounds.width, bounds.height) * 1.6;
    Object.assign(ripple.style, { width: size + 'px', height: size + 'px', left: event.clientX - bounds.left - size / 2 + 'px', top: event.clientY - bounds.top - size / 2 + 'px' });
    button.append(ripple);
    finish(play(ripple, [{ opacity: .22, transform: 'scale(.1)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 280 }), () => ripple.remove());
  }, true);
  // Pointer input restores hover motion after using the keyboard.
  document.addEventListener('pointermove', () => { if (hover.matches) { input = 'pointer'; document.body.dataset.input = 'pointer'; } }, { passive: true });
  reduced.addEventListener('change', () => { pauseScene(); if (reduced.matches) { revealObserver.disconnect(); stopTransitions(); animations.forEach(a => a.cancel()); } });
  const nav = document.getElementById('nav');
  new ResizeObserver(() => moveIndicator(true)).observe(nav);
  new MutationObserver(records => {
    if (records.some(record => record.target.closest?.('.nav-label') || record.target.parentElement?.closest('.nav-label'))) moveIndicator(true);
  }).observe(nav, { childList: true, characterData: true, subtree: true });
  const sidebar = document.querySelector('.app-sidebar');
  new ResizeObserver(() => {
    if (sidebar.getClientRects().length) document.documentElement.style.setProperty('--wm-sidebar-height', sidebar.getBoundingClientRect().height + 'px');
  }).observe(sidebar);
  addEventListener('resize', () => { stopTransitions(); moveIndicator(true); });
  return { swapAccess, swapContent, workspace, modalEnter, modalExit, toastIn, toastOut, stars, landing };
})();
requestAnimationFrame(() => wmMotion.landing());
