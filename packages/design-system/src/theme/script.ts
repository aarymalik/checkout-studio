import {
  CONTRAST_ATTRIBUTE,
  CONTRAST_STORAGE_KEY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "./preferences"

/**
 * The pre-paint theme script.
 *
 * Inlined into `<head>` and deliberately blocking. The alternative — resolving
 * the theme in React — paints the light interface first and corrects it a
 * frame later, which is the flash of incorrect theme the spec forbids
 * (docs/theme-system.md § Mode Application).
 *
 * It is written as a string rather than a module because it must execute
 * before anything is downloaded, which rules out an import. Everything inside
 * it is wrapped in try/catch: local storage throws in a private window with
 * site data blocked, and a theme preference is never worth a blank page.
 *
 * The resolution rules match `resolveMode` and `resolveContrast`, which are
 * tested directly; this string is tested by running it.
 */
export const themeScript = `(function(){try{
var d=document.documentElement;
var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var c=localStorage.getItem(${JSON.stringify(CONTRAST_STORAGE_KEY)});
var q=function(x){return window.matchMedia&&window.matchMedia(x).matches};
d.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},m==="light"||m==="dark"?m:q("(prefers-color-scheme: dark)")?"dark":"light");
d.setAttribute(${JSON.stringify(CONTRAST_ATTRIBUTE)},c==="normal"||c==="high"?c:q("(prefers-contrast: more)")?"high":"normal");
}catch(e){
document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},"light");
document.documentElement.setAttribute(${JSON.stringify(CONTRAST_ATTRIBUTE)},"normal");
}})();`
