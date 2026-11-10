import words from '../data/views/chat-words.json' with {type:'json'};

// These are the three cased alphabets present in this snapshot. Its ordinal
// comparer uppercases one UTF-16 char (8d32e0). Mono's invariant char table
// leaves dotless i and long s unchanged, and never expands ß into two chars.
const folded=text=>text.replace(/[a-zⓐ-ⓩａ-ｚ]/g,c=>c.toUpperCase());
const denied=new Set(words.denied.map(folded));
const lengths=[...new Set([...denied].map(word=>word.length))].sort((a,b)=>b-a);

function mask(text){
  const input=folded(text),allowed=[];
  for(const word of words.allowed){
    for(let start=input.indexOf(word);start>=0;start=input.indexOf(word,start+1)){
      allowed.push({start,end:start+word.length});
    }
  }
  let output='',cursor=0;
  // Search.MoveNext (8d4060) yields increasing end positions, longest suffix
  // first on ties. ReplaceBanWord (4265f00) skips starts before its last cut.
  for(let end=1;end<=input.length;end++){
    for(const length of lengths){
      const start=end-length;
      if(start<cursor||!denied.has(input.slice(start,end)))continue;
      if(allowed.some(a=>a.start<=start&&end<=a.end))continue;
      output+=text.slice(cursor,start)+'*'.repeat(length);
      cursor=end;
      break;
    }
  }
  return cursor?output+text.slice(cursor):text;
}

// BanWordService.SanitizeMessage (a17560) caps the .NET string before stripping invisible characters.
export function chatText(value){
  if(typeof value!=='string')return '';
  let s=value.slice(0,50);
  if(value.length>50&&/[\uD800-\uDBFF]$/.test(s))s=s.slice(0,-1);
  s=s.replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF\u00A0]/g,'')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,'').trim();
  return mask(s);
}
