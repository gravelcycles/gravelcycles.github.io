// Latin spellings of Cyrillic and Greek text for search. Station names come
// from each national feed in its own script (Bulgarian, Serbian, Macedonian
// and Greek stations are often published only in Cyrillic or Greek), while
// travellers type either script. This maps letters, never place names.
// Cyrillic gets two spellings: the Bulgarian/Russian one (zh, ch, sh, ya:
// "София" -> "sofia", "Пловдив" -> "plovdiv") and the Serbo-Croatian one
// that matches Latin feeds after accents are removed (ž z, č c, š s, ja:
// "Београд" -> "beograd", "Чачак" -> "cacak").
const SHARED={а:'a',б:'b',в:'v',г:'g',ґ:'g',д:'d',е:'e',ё:'e',є:'e',з:'z',и:'i',і:'i',ї:'i',й:'y',ј:'j',к:'k',л:'l',љ:'lj',м:'m',н:'n',њ:'nj',о:'o',п:'p',р:'r',с:'s',т:'t',ќ:'k',ѓ:'g',ѕ:'dz',у:'u',ў:'u',ф:'f',х:'h',ы:'y',ь:'',э:'e'};
const EAST={...SHARED,ж:'zh',ц:'ts',ч:'ch',ш:'sh',щ:'sht',ъ:'a',ю:'yu',я:'ya',ђ:'dj',ћ:'c',џ:'dzh'};
const SOUTH={...SHARED,ж:'z',ц:'c',ч:'c',ш:'s',щ:'st',ъ:'a',ю:'ju',я:'ja',ђ:'dj',ћ:'c',џ:'dz',х:'h'};
const GREEK={α:'a',β:'v',γ:'g',δ:'d',ε:'e',ζ:'z',η:'i',θ:'th',ι:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o'};
const SCRIPT=/[Ͱ-ϿЀ-ӿ]/;
function map(text,table){
  // Greek "ου" is one sound; Bulgarian word-final "ия" is written "ia" (София -> Sofia).
  return text.replace(/ου/g,'ou').replace(/ия(?=\s|$)/g,table===EAST?'ia':'ija').replace(/[Ͱ-ϿЀ-ӿ]/g,ch=>table[ch]??GREEK[ch]??ch);
}
// For text already folded by atlas-core normalize() (lower case, no accents).
// Returns the Latin spellings that differ from the text, or [] for Latin text.
export function latinSpellings(text){
  if(!SCRIPT.test(text))return[];
  return[...new Set([map(text,EAST),map(text,SOUTH)])].filter(value=>value!==text);
}
