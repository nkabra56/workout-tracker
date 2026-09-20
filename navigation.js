export const sections = {
  workout: [['log','Log workout'],['routines','Routines'],['history','History']],
  progress: [['body','Body weight'],['exercises','Exercises'],['activity','Activity']],
};
export function routeFor(hash) {
  const [rawArea, rawSection, id] = hash.replace(/^#/,'').split('/');
  const area = ['today','workout','progress','settings'].includes(rawArea) ? rawArea : 'today';
  const allowed = {workout:['log','routines','history','session'],progress:['body','exercises','activity']};
  const section = allowed[area]?.includes(rawSection) ? rawSection : sections[area]?.[0][0];
  return {area,section,id:section==='session'&&/^[-a-zA-Z0-9]+$/.test(id||'')?id:null};
}
export function sectionLinks(area, section) {
  const selected = section;
  return `<div class="section-nav" role="navigation" aria-label="${area} sections">${(sections[area]||[]).map(([id,label])=>`<a href="#${area}/${id}" ${selected===id?'aria-current="page"':''}>${label}</a>`).join('')}</div>`;
}
