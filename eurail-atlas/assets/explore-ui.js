// Small helpers shared by the Explore views. Kept apart from explore-app.js,
// the page entry point, so view modules never import the entry module.
export const fmt=n=>Math.round(n).toLocaleString('en-GB');
export const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}

export function attachStationSearch(input,list,search,onPick){
  let items=[],active=-1;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;}
  function render(){list.innerHTML=items.map((e,i)=>`<li role="option" id="${list.id}-${i}" aria-selected="${i===active}" data-i="${i}"><span>${esc(e.name)}${e.kind==='city'?' <small>all stations</small>':''}</span><small>${esc(e.country||'')}</small></li>`).join('');list.hidden=!items.length;input.setAttribute('aria-expanded',String(!!items.length));if(active>=0)input.setAttribute('aria-activedescendant',`${list.id}-${active}`);}
  function pick(i){const e=items[i];if(!e)return;input.value=e.name;close();onPick(e);}
  input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');
  input.addEventListener('input',()=>{items=search(input.value);active=items.length?0:-1;render();});
  input.addEventListener('keydown',e=>{if(list.hidden)return;if(e.key==='ArrowDown'){active=Math.min(items.length-1,active+1);render();e.preventDefault();}else if(e.key==='ArrowUp'){active=Math.max(0,active-1);render();e.preventDefault();}else if(e.key==='Enter'){pick(active);e.preventDefault();}else if(e.key==='Escape')close();});
  list.addEventListener('mousedown',e=>{const li=e.target.closest('li');if(li){e.preventDefault();pick(+li.dataset.i);}});
  input.addEventListener('blur',()=>setTimeout(close,120));
  // A filled field is replaced, not appended to, when the reader returns to it.
  input.addEventListener('focus',()=>{if(input.value)input.select();});
}

export function fillDaySelect(select,dates,selected){select.innerHTML=dates.map(d=>`<option value="${d.index}"${d.index===selected?' selected':''}>${esc(d.label)}</option>`).join('');}


// Explore links: #<view> or #<view>/<section> (a section is an element id in that view).
export function exploreHash(hash){const[view='',section='']=String(hash||'').replace(/^#/,'').split('/');return[view,/^[A-Za-z][\w-]{0,40}$/.test(section)?section:''];}
