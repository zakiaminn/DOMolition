// scripts/postinstall.js
const reset = "\x1b[0m";
const red = "\x1b[31m";
const white = "\x1b[37m";
const bold = "\x1b[1m";

const shatterArt = `
${red}${bold}     \\       /
      \\  _  /
   ---  ( )  ---  ${white}DOMolition Installed.${red}
      /  |  \\     ${white}Ready to break some UI.${red}
     /       \\
${reset}
`;

if (process.env.INIT_CWD) {
  console.log(shatterArt);
}