// scripts/postinstall.js
// Skip the banner in CI / non-interactive installs so we don't spam build logs.
if (process.env.CI || !process.stdout.isTTY) {
  process.exit(0);
}

const shatterArt = `
     \\       /
      \\  _  /
   ---  ( )  ---  DOMolition Installed.
      /  |  \\     Ready to break some UI.
     /       \\
`;

console.log(shatterArt);