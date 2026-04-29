export const sanitizeColorsAndClone = async (element: HTMLElement, html2canvas: any, options: any) => {
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    return html2canvas(element, options);
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

  if (!tempCtx) {
    return html2canvas(element, options);
  }

  const resolveColor = (colorStr: string): string => {
    tempCtx.clearRect(0, 0, 1, 1);
    tempCtx.fillStyle = colorStr;
    tempCtx.fillRect(0, 0, 1, 1);
    const data = tempCtx.getImageData(0, 0, 1, 1).data;
    return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})`;
  };

  const originalElements = [element, ...Array.from(element.querySelectorAll('*'))] as (HTMLElement | SVGElement)[];
  const styleMap = new Map<string, Record<string, string>>();
  let idCounter = 0;

  const colorRegex = /(oklab|oklch|color|lch|lab)\s*\([^)]+\)/gi;

  originalElements.forEach((el) => {
    const computed = window.getComputedStyle(el);
    const needsFix: Record<string, string> = {};
    let hasFix = false;

    // Iterate through all explicitly computed property names
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
      const id = `domolition-${Date.now()}-${idCounter++}`;
      el.setAttribute('data-domolition-id', id);
      styleMap.set(id, needsFix);
    }
  });

  const customOnClone = (doc: Document) => {
    styleMap.forEach((fixes, id) => {
      const clonedEl = doc.querySelector(`[data-domolition-id="${id}"]`) as HTMLElement | SVGElement | null;
      if (clonedEl) {
        Object.entries(fixes).forEach(([prop, val]) => {
          clonedEl.style.setProperty(prop, val, 'important');
        });
      }
    });

    // html2canvas converts pseudo-elements into <html2canvaspseudoelement> tags during cloning
    // and copies their computed styles inline. We must manually fix any unsupported colors on them.
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

  const result = await html2canvas(element, {
    ...options,
    onclone: customOnClone,
  });

  // Cleanup the original DOM so we don't leave data attributes behind
  originalElements.forEach((el) => {
    if (el.hasAttribute('data-domolition-id')) {
      el.removeAttribute('data-domolition-id');
    }
  });

  return result;
};
