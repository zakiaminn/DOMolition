const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const html2canvasScript = fs.readFileSync(path.join(__dirname, 'node_modules/html2canvas/dist/html2canvas.js'), 'utf8');

  // We need to simulate the component html.
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 p-8">
      <div id="target" class="w-full max-w-[1400px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[800px]">
        <header class="w-full h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 relative">
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-blue-600 shadow-sm flex items-center justify-center">
                <span class="text-white font-bold">L</span>
              </div>
              <span class="font-bold text-xl text-slate-800 tracking-tight">LuminaHQ</span>
            </div>
            <div class="hidden md:flex relative ml-4">
              <input type="text" placeholder="Search across workspace..." class="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full w-64 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
              <div class="absolute left-3 top-2.5 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <button class="relative p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div class="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-slate-500 font-bold text-sm">
              ZK
            </div>
          </div>
        </header>

        <!-- More target HTML could go here, but SVG might be the key -->
      </div>

      <script>${html2canvasScript}</script>
      <script>
        ${fs.readFileSync(path.join(__dirname, 'dist/index.js'), 'utf8')}
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);

  // We need to inject sanitizeColors somehow, or just run it via the domolition build
  // But wait, the user's component code provides the html, let's just inject the built script.
  // Wait, I can just copy the sanitizeColors logic into the puppeteer context for quick testing.

  const error = await page.evaluate(async () => {
    // Paste sanitizeColors directly
    const sanitizeColors = (element) => {
      if (typeof window === 'undefined' || !window.getComputedStyle) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 1;
      tempCanvas.height = 1;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

      if (!tempCtx) return;

      const resolveColor = (colorStr) => {
        tempCtx.clearRect(0, 0, 1, 1);
        tempCtx.fillStyle = colorStr;
        tempCtx.fillRect(0, 0, 1, 1);
        const data = tempCtx.getImageData(0, 0, 1, 1).data;
        return "rgba(" + data[0] + ", " + data[1] + ", " + data[2] + ", " + (data[3] / 255) + ")";
      };

      const exactColorProps = [
        'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
        'borderBottomColor', 'borderLeftColor', 'textDecorationColor',
        'columnRuleColor', 'outlineColor', 'fill', 'stroke', 'stopColor',
        'webkitTextStrokeColor'
      ];

      const complexColorProps = [
        'backgroundImage', 'background', 'boxShadow', 'textShadow'
      ];

      const elements = element.querySelectorAll('*');
      const allElements = [element, ...Array.from(elements)];

      const colorRegex = /(oklab|oklch|color|lch|lab)\\s*\\([^)]+\\)/gi;

      allElements.forEach((el) => {
        const view = el.ownerDocument.defaultView || window;
        const computed = view.getComputedStyle(el);
        if (el.tagName === 'BODY') console.log('Body view', !!el.ownerDocument.defaultView, !!computed);
        
        exactColorProps.forEach((prop) => {
          const val = computed[prop];
          if (val && colorRegex.test(val)) {
            colorRegex.lastIndex = 0;
            const match = val.match(colorRegex)?.[0];
            if (match) {
              const newColor = resolveColor(match);
              el.style.setProperty(
                prop.replace(/([A-Z])/g, '-$1').toLowerCase(), 
                newColor,
                'important'
              );
            }
          }
        });

        complexColorProps.forEach((prop) => {
          const val = computed[prop];
          if (val && val !== 'none') {
            colorRegex.lastIndex = 0;
            if (colorRegex.test(val)) {
              colorRegex.lastIndex = 0;
              const newVal = val.replace(colorRegex, (match) => resolveColor(match));
              el.style.setProperty(
                prop.replace(/([A-Z])/g, '-$1').toLowerCase(), 
                newVal,
                'important'
              );
            }
          }
        });
      });
    };

    try {
      const target = document.getElementById('target');
      target.style.backgroundColor = 'oklch(0.9 0.05 200)';
      
      const svg = document.querySelector('svg');
      svg.style.color = 'lab(50% 40 40)';
      svg.style.stroke = 'lab(50% 40 40)';
      svg.style.fill = 'lab(50% 40 40)';

      const exactColorProps = [
        'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
        'borderBottomColor', 'borderLeftColor', 'textDecorationColor',
        'columnRuleColor', 'outlineColor', 'fill', 'stroke', 'stopColor',
        'webkitTextStrokeColor'
      ];
      const complexColorProps = [
        'backgroundImage', 'background', 'boxShadow', 'textShadow'
      ];
      const colorRegex = /(oklab|oklch|color|lch|lab)\s*\([^)]+\)/gi;

      const resolveColor = (colorStr) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCtx.fillStyle = colorStr;
        tempCtx.fillRect(0, 0, 1, 1);
        const data = tempCtx.getImageData(0, 0, 1, 1).data;
        return "rgba(" + data[0] + ", " + data[1] + ", " + data[2] + ", " + (data[3] / 255) + ")";
      };

      // 1. Tag original elements and compute styles
      const originalElements = [target, ...Array.from(target.querySelectorAll('*'))];
      const styleMap = new Map();
      let idCounter = 0;

      originalElements.forEach((el) => {
        const computed = window.getComputedStyle(el);
        const needsFix = {};
        let hasFix = false;

        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i];
          const val = computed.getPropertyValue(prop);
          
          if (val && colorRegex.test(val)) {
            colorRegex.lastIndex = 0;
            // Simple replace for any property, catching all complex and simple ones
            const newVal = val.replace(colorRegex, (match) => resolveColor(match));
            if (newVal !== val) {
              needsFix[prop] = newVal;
              hasFix = true;
            }
          }
        }

        if (hasFix) {
          const id = "domolition-" + idCounter++;
          el.setAttribute('data-domolition-id', id);
          styleMap.set(id, needsFix);
        }
      });

      await html2canvas(target, {
        onclone: (doc) => {
          // 2. Apply fixes to cloned document
          styleMap.forEach((fixes, id) => {
            const clonedEl = doc.querySelector('[data-domolition-id="' + id + '"]');
            if (clonedEl) {
              Object.entries(fixes).forEach(([prop, val]) => {
                clonedEl.style.setProperty(prop, val, 'important');
              });
            }
          });
        }
      });

      // 3. Cleanup original DOM
      originalElements.forEach(el => {
        if (el.hasAttribute('data-domolition-id')) {
          el.removeAttribute('data-domolition-id');
        }
      });

      return "SUCCESS";
    } catch (err) {
      return err.stack || err.message;
    }
  });

  console.log(error);
  await browser.close();
})();