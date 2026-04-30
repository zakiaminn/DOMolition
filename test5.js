const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const html2canvasScript = fs.readFileSync(path.join(__dirname, 'node_modules/html2canvas/dist/html2canvas.js'), 'utf8');

  // Let's create an exact reproduction of what could go wrong
  // SVG linear gradients? CSS Animations?
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        :root { --my-color: lab(50% 40 40); }
        .test-svg {
           fill: var(--my-color);
           color: var(--my-color);
        }
        .test-div {
           background-color: lab(50% 40 40);
        }
        /* What about SVG gradients? */
      </style>
    </head>
    <body style="background: lab(10% 10 10)">
      <div id="target" class="test-div">
         <svg class="test-svg">
            <defs>
              <linearGradient id="grad1">
                <stop offset="0%" stop-color="lab(60% 50 50)" />
                <stop offset="100%" style="stop-color:lab(70% 60 60)" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill="url(#grad1)" />
         </svg>
         
         <!-- What about CSS variables directly? -->
         <div style="--local-color: lab(80% 10 10); background: var(--local-color);">Test</div>
      </div>

      <script>${html2canvasScript}</script>
      <script>
        ${fs.readFileSync(path.join(__dirname, 'dist/index.js'), 'utf8')}
      </script>
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
        
        let parent = element.parentElement;
        while (parent) {
          if (!originalElements.includes(parent)) {
            originalElements.push(parent);
          }
          parent = parent.parentElement;
        }
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
          styleMap.forEach((fixes, id) => {
            const clonedEl = doc.querySelector('[data-domolition-id="' + id + '"]');
            if (clonedEl) {
              Object.entries(fixes).forEach(([prop, val]) => {
                clonedEl.style.setProperty(prop, val, 'important');
              });
            }
          });

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
