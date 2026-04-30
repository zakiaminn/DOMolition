// This whole file exists mostly because `html2canvas` is severely outdated 
// and will outright fail or render black boxes if it encounters modern CSS 
// color spaces like `oklch` or `lab`. 

export const sanitizeColorsAndClone = async (element: HTMLElement, html2canvas: any, options: any) => {
  // Bail out if we are SSRing
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    return html2canvas(element, options);
  }

  // Create a tiny 1x1 canvas in memory. We'll use this to "read" what a color looks like.
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

  if (!tempCtx) {
    return html2canvas(element, options);
  }

  // Hacky but brilliant: if we draw an `oklch` color onto a 2D canvas, the browser 
  // converts it to raw RGBA pixels natively. Then we just read the pixel data back out.
  const resolveColor = (colorStr: string): string => {
    tempCtx.clearRect(0, 0, 1, 1);
    tempCtx.fillStyle = colorStr;
    tempCtx.fillRect(0, 0, 1, 1);
    const data = tempCtx.getImageData(0, 0, 1, 1).data;
    return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})`;
  };

  const originalElements = [element, ...Array.from(element.querySelectorAll('*'))] as (HTMLElement | SVGElement)[];

  // html2canvas actually walks *up* the ancestor tree to figure out stacking contexts 
  // and grabs body/html background colors. So we have to sanitize the parents too, 
  // not just the target element.
  let currentParent = element.parentElement;
  while (currentParent) {
    if (!originalElements.includes(currentParent)) {
      originalElements.push(currentParent);
    }
    currentParent = currentParent.parentElement;
  }
  if (!originalElements.includes(document.body)) originalElements.push(document.body);
  if (!originalElements.includes(document.documentElement)) originalElements.push(document.documentElement);

  // We don't want to actually mutate the live DOM (users might notice a flash or stutter),
  // so we keep track of what needs fixing and apply it *during* the clone phase.
  const styleMap = new Map<string, Record<string, string>>();
  let idCounter = 0;

  const colorRegex = /(oklab|oklch|color|lch|lab)\s*\([^)]+\)/gi;

  originalElements.forEach((el) => {
    const computed = window.getComputedStyle(el);
    const needsFix: Record<string, string> = {};
    let hasFix = false;

    // This is a bit heavy, but we literally have to iterate through every computed 
    // CSS property to see if any of them contain an unsupported color string.
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      const val = computed.getPropertyValue(prop);

      if (val && colorRegex.test(val)) {
        colorRegex.lastIndex = 0;
        const newVal = val.replace(colorRegex, (match) => resolveColor(match));
        if (newVal !== val) {
          needsFix[prop] = newVal;
          hasFix = true;
        }
      }
    }

    if (hasFix) {
      // Tag the real DOM node with an ID so we can find it in the cloned iframe later
      const id = `domolition-${Date.now()}-${idCounter++}`;
      el.setAttribute('data-domolition-id', id);
      styleMap.set(id, needsFix);
    }
  });

  // html2canvas calls this right after it duplicates the DOM but before it renders
  const customOnClone = (doc: Document) => {
    styleMap.forEach((fixes, id) => {
      const clonedEl = doc.querySelector(`[data-domolition-id="${id}"]`) as HTMLElement | SVGElement | null;
      if (clonedEl) {
        Object.entries(fixes).forEach(([prop, val]) => {
          // Apply the converted RGBA values inline via important so they override CSS classes
          clonedEl.style.setProperty(prop, val, 'important');
        });
      }
    });

    // Edge Case: html2canvas turns `::before` and `::after` pseudo-elements into 
    // literal `<html2canvaspseudoelement>` tags during the clone process and dumps 
    // their computed styles inline. We have to catch those and patch them separately.
    const pseudoElements = doc.querySelectorAll('html2canvaspseudoelement');
    pseudoElements.forEach((el) => {
      const style = (el as HTMLElement).style;
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        const val = style.getPropertyValue(prop);
        if (val && colorRegex.test(val)) {
          colorRegex.lastIndex = 0;
          const newVal = val.replace(colorRegex, (match) => resolveColor(match));
          style.setProperty(prop, newVal, 'important');
        }
      }
    });

    if (options.onclone) {
      options.onclone(doc);
    }
  };

  // Trigger the actual snapshot
  const result = await html2canvas(element, {
    ...options,
    onclone: customOnClone,
  });

  // Wipe our fingerprints off the original DOM so we don't leave random data attributes everywhere
  originalElements.forEach((el) => {
    if (el.hasAttribute('data-domolition-id')) {
      el.removeAttribute('data-domolition-id');
    }
  });

  return result;
};
