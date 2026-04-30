const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const html2canvasScript = fs.readFileSync(path.join(__dirname, 'node_modules/html2canvas/dist/html2canvas.js'), 'utf8');

  const html = `
    <!DOCTYPE html>
    <html style="background-color: oklab(0.9 0.05 200);">
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body style="color: oklab(0.5 0.1 200);">
      <div id="target">
         <div>Hello</div>
      </div>

      <script>${html2canvasScript}</script>
    </body>
    </html>
  `;

  await page.setContent(html);

  const error = await page.evaluate(async () => {
    try {
      const target = document.getElementById('target');
      
      const sanitizeColorsAndCloneLocal = async (element, html2canvas, options) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        const resolveColor = (colorStr) => {
          tempCtx.clearRect(0, 0, 1, 1);
          tempCtx.fillStyle = colorStr;
          tempCtx.fillRect(0, 0, 1, 1);
          const data = tempCtx.getImageData(0, 0, 1, 1).data;
          return "rgba(" + data[0] + ", " + data[1] + ", " + data[2] + ", " + (data[3] / 255) + ")";
        };

        const originalElements = [element, ...Array.from(element.querySelectorAll('*'))];
        
        // Add all ancestors
        let parent = element.parentElement;
        while (parent) {
          if (!originalElements.includes(parent)) {
            originalElements.push(parent);
          }
          parent = parent.parentElement;
        }
        
        // Always include body and html to be safe, html2canvas reads them for background
        if (!originalElements.includes(document.body)) originalElements.push(document.body);
        if (!originalElements.includes(document.documentElement)) originalElements.push(document.documentElement);

        const styleMap = new Map();
        let idCounter = 0;
        const colorRegex = /(oklab|oklch|color|lch|lab)\s*\([^)]+\)/gi;

        originalElements.forEach((el) => {
          const computed = window.getComputedStyle(el);
          const needsFix = {};
          let hasFix = false;

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
            const id = "domolition-" + Date.now() + "-" + (idCounter++);
            el.setAttribute('data-domolition-id', id);
            styleMap.set(id, needsFix);
          }
        });

        const customOnClone = (doc) => {
          // Fix regular elements
          styleMap.forEach((fixes, id) => {
            const clonedEl = doc.querySelector('[data-domolition-id="' + id + '"]');
            if (clonedEl) {
              Object.entries(fixes).forEach(([prop, val]) => {
                clonedEl.style.setProperty(prop, val, 'important');
              });
            }
          });

          // Fix html2canvas pseudo-elements!
          doc.querySelectorAll('html2canvaspseudoelement').forEach(el => {
             const style = el.style;
             for (let i = 0; i < style.length; i++) {
               const prop = style[i];
               const val = style.getPropertyValue(prop);
               if (val && colorRegex.test(val)) {
                 colorRegex.lastIndex = 0;
                 const newVal = val.replace(colorRegex, match => resolveColor(match));
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

        originalElements.forEach((el) => {
          if (el.hasAttribute('data-domolition-id')) {
            el.removeAttribute('data-domolition-id');
          }
        });

        return result;
      };

      await sanitizeColorsAndCloneLocal(target, html2canvas, {});
      return "SUCCESS";
    } catch (err) {
      return err.stack || err.message;
    }
  });

  console.log(error);
  await browser.close();
})();
