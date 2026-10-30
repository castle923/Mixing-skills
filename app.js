'use strict';
const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="workbench-token"]').content;
let catalogue, selected = [], category = '전체', currentReport = null, checkRevision = 0, searchRevision = 0, recommendRevision = 0;
const TAB_NAMES = ['skills','docs','recommend'];
let messageTimer;
let detailRevision = 0;
const node = (tag, text, className) => {const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n;};
const button = (text, fn, className) => {const b = node('button', text, className); b.type = 'button'; b.addEventListener('click', () => Promise.resolve(fn()).catch(showError)); return b;};
function message(text) { $('message').textContent = text; $('message').hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(() => $('message').hidden = true, 5000); }
function showError(error) { message(error.message || String(error)); }
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json','X-Workbench-Token':token}, body:JSON.stringify(data)});
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '요청에 실패했습니다.'); return value;
}
function draft() {
  try { localStorage.setItem('skill-workbench-draft', JSON.stringify({names:selected,goal:$('goal').value})); }
  catch { $('save-state').textContent = '브라우저 저장이 제한되어 있습니다. Codex에 선택 저장을 눌러주세요.'; }
}
function invalidate() { invalidateAI(); checkRevision++; currentReport = null; $('compatibility').replaceChildren(node('p','선택이 바뀌었습니다. 조합 조건을 다시 확인하세요.','hint')); $('save-state').textContent = '저장되지 않은 변경이 있습니다.'; }
function toggle(name) {
  if (selected.includes(name)) selected = selected.filter(n => n !== name);
  else if (selected.length < 20) selected.push(name);
  else return message('한 조합에는 최대 20개까지 담을 수 있습니다.');
  invalidate(); draft(); renderSkills(); renderBasket();
}
function renderCategories() {
  const counts = new Map(); for (const s of catalogue.skills) counts.set(s.category, (counts.get(s.category)||0)+1);
  $('categories').replaceChildren();
  for (const name of ['전체',...counts.keys()]) {
    const b = button(name, () => {category=name; renderCategories(); renderSkills();});
    b.setAttribute('aria-pressed', String(category===name)); b.append(node('span', name==='전체'?catalogue.skills.length:counts.get(name))); $('categories').append(b);
  }
}
function renderSkills() {
  const q=$('filter').value.trim().toLowerCase();
  const skills=catalogue.skills.filter(s => (category==='전체'||s.category===category)&&[s.name,s.command,s.description,s.original_description].join(' ').toLowerCase().includes(q));
  $('category-title').textContent=category==='전체'?'전체 스킬':category; $('result-count').textContent=`${skills.length}개 표시`;
  $('skills').replaceChildren();
  if (!skills.length) { $('skills').append(node('p','일치하는 스킬이 없습니다. 검색어를 바꾸거나 초기화하세요.','empty')); return; }
  for (const s of skills) {
    const row=node('article',undefined,'skill-row'); row.dataset.skill=s.name;
    const content=node('div'); content.append(node('h3',s.name),node('p',s.description));
    const tags=node('div',undefined,'tags'); tags.append(node('span',s.category,'tag'),node('span',s.active?'등록됨 · 실행 상태 미확인':'비활성',s.active?'':'tag warn'));
    if(s.locations.length>1) tags.append(node('span',`등록 경로 ${s.locations.length}곳`));
    if(s.korean?.stale) tags.append(node('span','원문 변경 · 번역 확인 필요','tag warn'));
    content.append(tags);
    const actions=node('div',undefined,'row-actions');
    const add=button(selected.includes(s.name)?'담김 ✓':'+ 담기',()=>toggle(s.name),'add'); add.setAttribute('aria-pressed',String(selected.includes(s.name))); add.setAttribute('aria-label',`${s.name} ${selected.includes(s.name)?'장바구니에서 빼기':'장바구니에 담기'}`);
    actions.append(add,button('설명서',()=>detail(s.name),'detail')); row.append(content,actions); $('skills').append(row);
  }
}
function renderBasket() {
  $('basket-count').textContent=`${selected.length} / 20`; $('basket-items').replaceChildren();
  selected.forEach((name,index)=>{
    const s=catalogue.skills.find(s=>s.name===name); const li=node('li');
    const text=node('span',name,'item-name');text.append(node('small',s?.category||'현재 설치 목록에 없음'));
    const remove=button('×',()=>toggle(name)); remove.setAttribute('aria-label',`${name} 빼기`);
    li.append(node('span',String(index+1).padStart(2,'0'),'order'),text,remove); $('basket-items').append(li);
  });
  if(!selected.length) $('basket-items').append(node('li','카테고리에서 필요한 스킬을 담아보세요.','empty'));
  for(const id of ['check','save','copy','download']) $(id).disabled=!selected.length;
}
function evidence(items) {
  const valid=items.filter(Boolean); if(!valid.length)return node('p','직접 원문 확인이 필요합니다.','hint');
  const details=node('details',undefined,'evidence');details.append(node('summary',`원문 근거 ${valid.length}개`));
  valid.forEach(ev=>{details.append(node('code',`${ev.path}:${ev.line}`),node('blockquote',ev.quote));});return details;
}
function renderReport(report) {
  const box=$('compatibility');box.replaceChildren();
  const cls=report.status==='문서상 조합 가능'?'':report.status==='확인 필요'?'review':'blocked';
  box.append(node('div',`${cls==='blocked'?'!':cls==='review'?'△':'✓'} ${report.status}`,'status '+cls));
  for(const f of [...report.findings,...report.pairs]) {
    const block=node('article',undefined,'finding '+f.level);
    block.append(node('span',({supported:'연결 근거 있음',review:'확인할 조건',blocked:'사용 제한'})[f.level],'finding-label'),node('h3',f.skills.join(' + ')),node('p',f.message),evidence(f.evidence));box.append(block);
  }
  if(report.unknown_pairs.length){const details=node('details',undefined,'unknown');details.append(node('summary',`근거가 부족한 조합 ${report.unknown_pairs.length}쌍`));const ul=node('ul');report.unknown_pairs.forEach(p=>ul.append(node('li',p.join(' + '))));details.append(node('p','충돌이 없다는 뜻이 아닙니다. 원문과 실제 프로젝트 환경을 확인하세요.'),ul);box.append(details);}
  if(selected.length===1)box.append(node('p','스킬 1개를 선택했습니다. 두 개 이상일 때 조합 관계도 확인합니다.','hint'));
  box.append(node('p',report.notice,'hint'));
}
async function runCheck() {
  const rev=++checkRevision; $('check').disabled=true; $('check').textContent='확인 중…';
  try {const report=await api('/api/check',{names:[...selected]});if(rev===checkRevision){currentReport=report;renderReport(report);}}
  finally {$('check').disabled=!selected.length;$('check').textContent='조합 조건 확인';}
}
async function detail(name) {
  const revision=++detailRevision;$('detail-title').textContent=name;$('detail-body').replaceChildren(node('p','설명서를 불러오는 중…','hint'));if(!$('detail').open)$('detail').showModal();
  const s=await api('/api/skill?name='+encodeURIComponent(name));
  const koreanDoc=s.korean?await api('/api/document?id='+encodeURIComponent(s.korean.doc_id)+'&start=1'):null;
  if(revision!==detailRevision||!$('detail').open)return;
  $('detail-title').textContent=s.name;$('detail-body').replaceChildren(node('p',s.description,'dialog-help'),node('p',s.command,'dialog-help'));
  if(s.korean){
    $('detail-body').append(node('span',s.korean.kind,'tag'));
    if(s.korean.stale)$('detail-body').append(node('p','원문이 번역 작성 이후 변경되었습니다. 아래 안내와 현재 원문을 대조하세요.','unknown'));
    $('detail-body').append(node('pre',koreanDoc.body,'manual korean-manual'));
  }
  for(const [index,loc] of s.locations.entries()) {
    const d=node('div',undefined,'location');d.append(node('strong',`등록본 ${index+1} · ${loc.disabled?'비활성':loc.origin==='synced'?'개인 동기화':'개인 설치'}`),node('p',loc.path));
    const doc=s.documents.find(x=>x.path.toLowerCase().replaceAll('\\','/')===loc.path.toLowerCase().replaceAll('\\','/'));
    if(doc)d.append(button('원문 읽기',()=>openDocument(doc.id,1,s.name)));$('detail-body').append(d);
  }
  $('detail-body').append(node('p','등록은 실행 준비 완료를 뜻하지 않습니다. 선택 전에 원문과 필요한 도구를 확인하세요.','dialog-help'));
}
async function openDocument(id,start,title) {
  const revision=++detailRevision;$('detail-title').textContent=title||'문서 보기';$('detail-body').replaceChildren(node('p','문서를 불러오는 중…','hint'));if(!$('detail').open)$('detail').showModal();
  const doc=await api(`/api/document?id=${encodeURIComponent(id)}&start=${start}`);
  if(revision!==detailRevision||!$('detail').open)return;
  const pre=node('pre',doc.body,'manual'); const nav=node('div',undefined,'manual-nav');
  const prev=button('이전 100줄',()=>openDocument(id,Math.max(1,start-100),title));prev.disabled=start<=1;
  const next=button('다음 100줄',()=>openDocument(id,start+100,title));next.disabled=doc.end<start+99;
  if(catalogue.skills.some(s=>s.name===title&&s.korean))nav.append(button('한국어 설명으로',()=>detail(title)));
  nav.append(prev,node('span',`${doc.start}–${doc.end}줄`),next);$('detail-body').replaceChildren(node('p',doc.path,'location'),nav,pre);
}
function tab(which) {
  for(const name of TAB_NAMES){const active=name===which;$(name+'-panel').hidden=!active;$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;}
}
for(const name of TAB_NAMES) {
  $(name+'-tab').addEventListener('click',()=>tab(name));
  $(name+'-tab').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const index=TAB_NAMES.indexOf(name);const next=e.key==='Home'?TAB_NAMES[0]:e.key==='End'?TAB_NAMES.at(-1):TAB_NAMES[(index+(e.key==='ArrowRight'?1:-1)+TAB_NAMES.length)%TAB_NAMES.length];tab(next);$(next+'-tab').focus();}});
}
$('filter').addEventListener('input',renderSkills);
$('clear-filter').addEventListener('click',()=>{$('filter').value='';category='전체';renderCategories();renderSkills();});
$('goal').addEventListener('input',()=>{draft();$('save-state').textContent='작업 목표가 바뀌었습니다. Codex에 선택 저장을 눌러주세요.';});
$('close-detail').addEventListener('click',()=>$('detail').close());
$('detail').addEventListener('close',()=>detailRevision++);
$('clear-basket').addEventListener('click',()=>{selected=[];invalidate();draft();renderBasket();renderSkills();});
$('check').addEventListener('click',()=>runCheck().catch(showError));
$('save').addEventListener('click',async()=>{try{await api('/api/basket',{names:selected,goal:$('goal').value});$('save-state').textContent='저장 완료 · Codex가 선택한 목록을 읽을 수 있습니다.';message('선택 목록을 저장했습니다. 스킬은 실행하지 않았습니다.');}catch(e){showError(e);}});
async function exportText(){return (await api('/api/export',{names:selected,goal:$('goal').value})).text;}
async function copyText(text){try{await navigator.clipboard.writeText(text);message('Codex에 붙여 넣을 요청문을 복사했습니다.');}catch{$('detail-title').textContent='요청문 복사';const area=node('textarea',undefined,'copy-area');area.rows=18;area.value=text;area.readOnly=true;$('detail-body').replaceChildren(node('p','아래 텍스트를 선택한 뒤 Ctrl+C로 복사하세요.','hint'),area);if(!$('detail').open)$('detail').showModal();area.focus();area.select();}}
$('copy').addEventListener('click',async()=>{try{await copyText(await exportText());}catch(e){showError(e);}});
$('download').addEventListener('click',async()=>{try{const text=await exportText();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));a.download='스킬-조합-요청.md';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);message('선택한 조합과 근거를 내보냈습니다.');}catch(e){showError(e);}});
$('search-form').addEventListener('submit',async e=>{
  e.preventDefault();const rev=++searchRevision;$('documents').replaceChildren(node('p','문서를 찾는 중…','empty'));
  try{const result=await api('/api/search?q='+encodeURIComponent($('query').value)+'&kind='+$('kind').value);if(rev!==searchRevision)return;$('documents').replaceChildren();
    if(!result.results.length)$('documents').append(node('p','일치하는 문서가 없습니다. 핵심 단어로 다시 검색하세요.','empty'));
    for(const doc of result.results){const item=node('article',undefined,'document');const label=doc.kind==='skill'?(doc.title.includes('한국어 사용 설명서')?'한국어 사용 설명 · 요약본':'스킬 원문'):'프로젝트 문서';item.append(node('span',label,'tag'),node('h3',doc.title),node('p',`${doc.path}:${doc.start}–${doc.end}`,'source'),node('pre',doc.body),button('문서 이어 읽기',()=>openDocument(doc.doc_id,doc.start,doc.title)));$('documents').append(item);}
  }catch(error){if(rev===searchRevision)$('documents').replaceChildren(node('p',error.message,'empty error'));}
});
function renderCatalogue() {
  $('skill-count').textContent=catalogue.skills.length;$('doc-count').textContent=catalogue.document_count;
  $('updated').textContent=`설치 확인 ${new Date(catalogue.updated).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 원본 ${catalogue.file_count}개`;
  $('scope').replaceChildren(node('p',catalogue.scope));for(const root of catalogue.roots)$('scope').append(node('code',root));
  $('scope').append(node('p',`프로젝트 문서 ${catalogue.project_document_count}개 · 제외/오류 ${catalogue.skipped.length}개. 문서 변경은 검색 시 반영합니다. PDF·Office 파일은 Markdown 변환 후 추가하세요.`));
  if(catalogue.skipped.length){const d=node('details');d.append(node('summary','제외 내역'));catalogue.skipped.forEach(s=>d.append(node('p',s.path+' — '+s.reason)));$('scope').append(d);}
  renderCategories();renderSkills();renderBasket();
}
function renderRecommendations(result){
  const target=$('recommend-results');target.replaceChildren(node('p',result.notice,'hint'));
  if(!result.plans.length){target.append(node('p','맞는 작업 유형을 찾지 못했습니다. '+result.next_step,'empty'));return;}
  result.plans.forEach((plan,index)=>{
    const card=node('article',undefined,'recommend-plan');card.dataset.plan=plan.id;
    card.append(node('span',index===0?'우선 검토할 후보':'다른 작업 방식','tag'),node('h3',plan.title),node('p','요청에서 확인한 단어: '+plan.matched_terms.join(', '),'hint'));
    const list=node('ol',undefined,'recommend-roles');
    for(const item of plan.items){const li=node('li');li.append(node('span',item.role,'role-label'),node('h4',item.name),node('p',item.description),node('p',item.reason,'reason'),node('p','필요 조건: '+item.conditions,'conditions'));if(item.korean?.stale)li.append(node('p','원문 변경 · 한국어 안내 확인 필요','unknown'));li.append(evidence(item.evidence),button('한국어 설명서',()=>detail(item.name),'small-button'));list.append(li);}
    card.append(list);
    for(const missing of plan.missing)card.append(node('p',missing,'unknown'));
    if(plan.compatibility){
      const report=plan.compatibility;card.append(node('p',`조합 검사: ${report.status}`,'plan-status'));
      const details=node('details',undefined,'plan-conditions');details.append(node('summary','조합 조건과 미확인 관계 보기'));
      for(const f of [...report.findings,...report.pairs]){const block=node('div',undefined,'finding '+f.level);block.append(node('h4',f.skills.join(' + ')),node('p',f.message),evidence(f.evidence));details.append(block);}
      if(report.unknown_pairs.length)details.append(node('p',`문서 근거가 부족한 조합 ${report.unknown_pairs.length}쌍: `+report.unknown_pairs.map(p=>p.join(' + ')).join('; '),'hint'));
      card.append(details);
    }
    if(plan.items.length){
      const actions=node('div',undefined,'recommend-actions');
      actions.append(button('이 조합 담기',async()=>{
        const next=[...new Set([...selected,...plan.items.map(s=>s.name)])];if(next.length>20)return message('기존 선택과 합치면 20개를 넘습니다. 일부 스킬을 뺀 뒤 다시 담아주세요.');
        selected=next;if(!$('goal').value.trim())$('goal').value=result.goal;invalidate();draft();renderBasket();renderSkills();await runCheck();message('기존 선택을 유지하고 추천 스킬을 담았습니다. 저장·실행은 하지 않았습니다.');
      },'primary'),button('Codex 검토 요청문 복사',async()=>{
        const prompt=(await api('/api/export',{names:plan.items.map(s=>s.name),goal:result.goal})).text;
        await copyText(prompt+'\n\n로컬 추천 후보를 출발점으로, 현재 설치 스킬의 원문과 프로젝트 조건을 확인해 이 작업에 더 적합한 조합·순서를 검토해 주세요. 확인되지 않은 조건은 명시해 주세요.');
      }));card.append(actions);
    }
    target.append(card);
  });
}
$('recommend-form').addEventListener('submit',async e=>{
  e.preventDefault();const revision=++recommendRevision;const b=$('recommend-submit');b.disabled=true;b.textContent='조합 찾는 중…';$('recommend-results').replaceChildren(node('p','현재 설치 목록과 작업별 역할을 비교하고 있습니다.','empty'));
  try{const result=await api('/api/recommend',{goal:$('task-goal').value});if(revision===recommendRevision)renderRecommendations(result);}
  catch(error){if(revision===recommendRevision)$('recommend-results').replaceChildren(node('p',error.message,'empty error'));}
  finally{if(revision===recommendRevision){b.disabled=false;b.textContent='추천 조합 찾기';}}
});
for(const b of $('recommend-examples').querySelectorAll('button'))b.addEventListener('click',()=>{$('task-goal').value=b.textContent;invalidateAI();$('recommend-form').requestSubmit();});
$('refresh').addEventListener('click',async()=>{const b=$('refresh');b.disabled=true;b.textContent='확인 중…';try{catalogue=await api('/api/refresh',{});invalidate();renderCatalogue();message('현재 설치 목록과 문서 인덱스를 갱신했습니다.');}catch(e){showError(e);}finally{b.disabled=false;b.textContent='목록 새로고침';}});
async function init(){
  try{const [cat,saved]=await Promise.all([api('/api/catalogue'),api('/api/basket')]);catalogue=cat;let initial=saved;
    try{const local=JSON.parse(localStorage.getItem('skill-workbench-draft')||'null');if(local&&Array.isArray(local.names))initial=local;}catch{}
    selected=[...new Set((initial.names||[]).filter(n=>typeof n==='string'))].slice(0,20);$('goal').value=typeof initial.goal==='string'?initial.goal.slice(0,2000):'';
    renderCatalogue();if(selected.length)await runCheck();
  }catch(e){$('skills').replaceChildren(node('p',`불러오지 못했습니다: ${e.message}. 목록 새로고침으로 다시 시도하세요.`,'empty error'));showError(e);}
}
let aiRevision=0, aiPreview=null, aiController=null, aiRequestId=null, aiBusy=false, aiKey=false;
function renderAIBudget(budget,usage){
  const b=budget||{};const number=n=>typeof n==='number'?n.toLocaleString('ko-KR'):'미계산';
  const exceeded=(b.exceeded||[]).map(x=>({input_tokens:'입력 토큰 한도 초과',estimated_cost_usd:'예상 최대 비용 한도 초과'})[x]).filter(Boolean);
  $('ai-budget').textContent=`사전 계산 입력 토큰: ${number(b.input_tokens)} / ${number(b.input_token_limit??32000)} · 출력 ${usage?.output_tokens!=null?'토큰: '+number(usage.output_tokens)+' / ':'한도: '}${number(b.output_token_limit??8192)} · 예상 최대 비용: ${typeof b.estimated_max_cost_usd==='number'?'$'+b.estimated_max_cost_usd:'미계산'} / $${b.cost_limit_usd??0.01}${exceeded.length?' · '+exceeded.join(' · '):''}`;
}
function aiDiagnostics(details){
  const d=details||{}, usage=d.usage||{}, reason=typeof d.stop_reason==='string'?d.stop_reason:null;
  const labels=new Map([['max_tokens','출력 한도 도달'],['refusal','모델 거부'],['end_turn','정상 생성 종료 (후속 검증 오류)'],['model_context_window_exceeded','모델 컨텍스트 한도 도달'],['stop_sequence','중지 문자열 도달'],['tool_use','도구 사용 요청'],['pause_turn','생성 일시 중단']]);
  const label=labels.get(reason)||'알 수 없는 종료 이유';
  const value=x=>x===null||x===undefined?'미제공/확인 불가':String(x);
  return node('p',`종료 이유: ${label} (${value(reason)}) · 실제 입력 토큰: ${value(usage.input_tokens)} · 실제 출력 토큰: ${value(usage.output_tokens)} · 사전 계산 입력 토큰: ${value(d.counted_input_tokens)} · 요청 ID: ${value(d.request_id)} · 모델: ${value(d.model)}`,'hint');
}
function aiControls(){ $('ai-preview').disabled=aiBusy; $('ai-submit').disabled=aiBusy||!aiPreview||!aiKey; $('ai-cancel').hidden=!aiRequestId; }
function invalidateAI(){
  aiRevision++; aiPreview=null;
  if(aiController) aiController.abort();
  if(aiRequestId) api('/api/ai/cancel',{request_id:aiRequestId}).catch(()=>{});
  aiController=null; aiRequestId=null; aiBusy=false; renderAIBudget();
  $('ai-output').replaceChildren(node('p','작업이나 선택이 바뀌었습니다. 전송할 근거를 다시 확인하세요.','empty')); aiControls();
}
async function aiFetch(path,data,signal){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':token},body:JSON.stringify(data),signal});
  const value=await response.json(); if(!response.ok){const error=new Error(typeof value.error==='string'?value.error:'요청에 실패했습니다.');error.details=value.details;throw error;} return value;
}
function aiSources(sources){
  const wrap=node('div',undefined,'ai-sources');
  for(const source of sources||[]){const d=node('details');d.append(node('summary',`${source.title||source.id} (${source.source_type||'문서'})`));
    if(source.path)d.append(node('p',`${source.path}:${source.start||1}–${source.end||source.start||1}`,'hint'));
    if(source.body)d.append(node('pre',source.body,'manual'));
    if(source.doc_id)d.append(button('원문 읽기',()=>openDocument(source.doc_id,source.start||1,source.title),'small-button'));wrap.append(d);}
  return wrap;
}
function renderAIPreview(value){
  const out=$('ai-output');out.replaceChildren(node('h3','전송할 근거'),node('p',value.disclosure||value.notice||'아래 근거와 작업 내용을 Anthropic에 전송합니다.','hint'));
  out.append(node('p','전송할 작업: '+(value.goal||''),'ai-answer'));
  const list=node('ul');for(const c of value.candidates||[])list.append(node('li',`${c.title||c.name||c.skill_id||c.id}${c.description?' — '+c.description:''}`));
  if(list.childNodes.length)out.append(node('h4','후보 스킬'),list);else out.append(node('p','후보 스킬이 없습니다.','hint'));out.append(aiSources(value.sources));
}
function renderAIResult(value){
  renderAIBudget(value.budget,value.usage);
  const out=$('ai-output');out.replaceChildren(node('h3','Haiku 5.5 답변'),node('p',value.answer||'답변 내용이 없습니다.','ai-answer'));
  const list=node('ol',undefined,'recommend-roles');
  for(const item of value.recommended_skills||[]){const li=node('li');li.append(node('span',item.role||'추천','role-label'),node('h4',item.skill_id),node('p',item.reason||''));
    for(const ref of item.evidence_refs||[]){const source=(value.sources||[]).find(s=>s.id===(typeof ref==='string'?ref:ref.id));if(source?.doc_id)li.append(button(`근거: ${source.title||source.id}`,()=>openDocument(source.doc_id,source.start||1,source.title),'small-button'));}list.append(li);}
  if(list.childNodes.length)out.append(list);
  for(const [title,items] of [['확인할 질문',value.questions],['불확실한 점',value.uncertainties]])if(items?.length){out.append(node('h4',title));const ul=node('ul');items.forEach(x=>ul.append(node('li',typeof x==='string'?x:JSON.stringify(x))));out.append(ul);}
  if(value.compatibility){const report=value.compatibility;out.append(node('p',`서버 조합 검사: ${report.status}`,'plan-status'));const details=node('details',undefined,'plan-conditions');details.append(node('summary','조합 검사 근거 보기'));
    for(const f of [...(report.findings||[]),...(report.pairs||[])]){const block=node('div',undefined,'finding '+f.level);block.append(node('h4',(f.skills||[]).join(' + ')),node('p',f.message),evidence(f.evidence||[]));details.append(block);}if(report.unknown_pairs?.length)details.append(node('p','근거 부족: '+report.unknown_pairs.map(p=>p.join(' + ')).join('; '),'hint'));out.append(details);}
  if(value.sources?.length)out.append(node('h4','사용한 근거'),aiSources(value.sources));if(value.notice)out.append(node('p',value.notice,'hint'));
  if(value.usage)out.append(node('p',`입력 ${value.usage.input_tokens??'–'} 토큰 · 출력 ${value.usage.output_tokens??'–'} 토큰${value.estimated_cost_usd!=null?' · 예상 비용 $'+value.estimated_cost_usd:''}`,'hint'));
  if(value.recommended_skills?.length)out.append(button('이 AI 조합 담기',async()=>{const next=[...new Set([...selected,...value.recommended_skills.map(s=>s.skill_id)])];
    if(next.length>20)return message('기존 선택과 합치면 20개를 넘습니다. 일부 스킬을 뺀 뒤 다시 담아주세요.');selected=next;if(!$('goal').value.trim())$('goal').value=$('task-goal').value;invalidate();draft();renderBasket();renderSkills();await runCheck();message('기존 선택을 유지하고 AI 추천을 담았습니다. 저장·실행은 하지 않았습니다.');},'primary'));
}
$('task-goal').addEventListener('input',invalidateAI);$('ai-docs').addEventListener('change',invalidateAI);
$('ai-preview').addEventListener('click',async()=>{
  const goal=$('task-goal').value.trim();if(!goal){$('ai-output').replaceChildren(node('p','먼저 원하는 작업을 입력하세요.','empty error'));$('task-goal').focus();return;}
  const rev=++aiRevision;aiPreview=null;aiBusy=true;renderAIBudget();aiControls();$('ai-output').replaceChildren(node('p','전송할 근거를 찾고 있습니다.','empty'));
  try{const value=await aiFetch('/api/ai/preview',{goal,include_project_docs:$('ai-docs').checked,selected_names:[...selected]});if(rev!==aiRevision)return;aiPreview=value;renderAIPreview(value);}
  catch(error){if(rev===aiRevision)$('ai-output').replaceChildren(node('p',error.message,'empty error'));}finally{if(rev===aiRevision){aiBusy=false;aiControls();}}
});
$('ai-submit').addEventListener('click',async()=>{
  if(!aiPreview||aiBusy||!aiKey)return;const preview=aiPreview;aiPreview=null;const rev=++aiRevision;aiBusy=true;aiController=new AbortController();aiRequestId=crypto.randomUUID();aiControls();$('ai-output').replaceChildren(node('p','Haiku 5.5 답변을 기다리고 있습니다.','empty'));
  try{const value=await aiFetch('/api/ai/recommend',{preview_id:preview.preview_id,request_id:aiRequestId},aiController.signal);if(rev===aiRevision)renderAIResult(value);}
  catch(error){if(rev===aiRevision){if(error.details)renderAIBudget(error.details,error.details.usage);$('ai-output').replaceChildren(node('p',`${error.message} 다시 시도하려면 근거를 다시 확인하세요.`,'empty error'),aiDiagnostics(error.details));}}finally{if(rev===aiRevision){aiBusy=false;aiController=null;aiRequestId=null;aiControls();}}
});
$('ai-cancel').addEventListener('click',()=>{invalidateAI();$('ai-output').replaceChildren(node('p','요청을 취소했습니다. 원격 처리와 비용은 계속 발생할 수 있습니다. 다시 시도하려면 근거를 확인하세요.','hint'));});
async function aiStatus(){try{const status=await api('/api/ai/status');aiKey=status.key_configured===true;$('ai-status').textContent=aiKey?'Anthropic API 키 설정됨 · 계정 유효성은 확인하지 않았습니다.':'Anthropic API 키가 설정되지 않았습니다. 설정 후 새로고침하세요.';}catch{$('ai-status').textContent='AI 설정 상태를 확인하지 못했습니다. 로컬 추천은 사용할 수 있습니다.';}aiControls();}
aiStatus();init();
