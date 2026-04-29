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
    <html>
    <head>
      <style>
        :root {
           --my-color: lab(50% 40 40);
        }
        .test-svg {
           fill: var(--my-color);
           color: var(--my-color);
        }
        .test-div {
           background-color: lab(50% 40 40);
        }
      </style>
    </head>
    <body>
      <div id="target" class="test-div">
         <svg class="test-svg"><path d="M0 0h10v10H0z"/></svg>
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
      
      const { sanitizeColorsAndClone } = window.domolition || {};
      
      // I'll just paste sanitizeColorsAndClone directly here to be sure
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
