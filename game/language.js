// These locale codes are the columns of the shipped localization table.
export const languages=['ko','en','ja','zh-cn','zh-tw'];
const saved=localStorage.getItem('chill-language');
export let language=languages.includes(saved)?saved:'zh-cn';
document.documentElement.lang=language;

export function setLanguage(code){
  if(!languages.includes(code))return;
  language=code;
  document.documentElement.lang=code;
  localStorage.setItem('chill-language',code);
}
export function translated(table,key,fallback=''){
  return table[key]?.[language]||table[key]?.en||fallback;
}
