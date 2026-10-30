// All browser URLs are intercepted: no server, credentials, provider or saved-cart writes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base='http://127.0.0.1:8771';
const hostile='<img src=x onerror="window.injected=true">';
const skill={name:'frontend-design',command:'$frontend-design',description:'화면 디자인',category:'디자인',active:true,locations:[],korean:{stale:false}};
const report={status:'확인 필요',findings:[],pairs:[],unknown_pairs:[['frontend-design','unknown']],notice:'실제 실행 미확인'};
const source={id:'src_a',title:hostile,source_type:'original',body:hostile,path:'C:/fixture/SKILL.md',start:1,end:2,skill_ids:['frontend-design']};
const preview={preview_id:'mock_preview',candidates:[{skill_id:skill.name,title:skill.name}],sources:[source]};
const budget={input_tokens:100,input_token_limit:32000,output_token_limit:8192,estimated_max_cost_usd:0.004,cost_limit_usd:0.01,exceeded:[]};
const answer={answer:hostile,recommended_skills:[{skill_id:skill.name,role:'디자인',reason:hostile,evidence_refs:['src_a']}],questions:['질문'],uncertainties:['미확인'],sources:[source],compatibility:report,usage:{input_tokens:100,output_tokens:50},budget};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();const errors=[],calls=[];let release=null,slow=false,apiError=false,budgetError=false,diagnostics=null,key=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(u.origin!==base)throw new Error('Unexpected external browser request '+u.origin);
   const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
   if(p.startsWith('/api/')){
    const data=route.request().postDataJSON();calls.push({p,data});
    if(p==='/api/catalogue')return json({skills:[skill],document_count:1,file_count:1,project_document_count:0,roots:[],skipped:[],updated:new Date().toISOString(),scope:'mock'});
    if(p==='/api/basket')return json({names:[],goal:''});
    if(p==='/api/check')return json(report);
    if(p==='/api/recommend')return json({plans:[],notice:'로컬 추천',next_step:'조건 확인'});
    if(p==='/api/ai/status')return json({key_configured:key});
    if(p==='/api/ai/preview')return json(preview);
    if(p==='/api/ai/cancel')return json({cancelled:true});
    if(p==='/api/ai/recommend'){
     if(slow)await new Promise(resolve=>release=resolve);
     if(budgetError)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'요청 한도 초과',code:'budget',details:{...budget,input_tokens:33000,estimated_max_cost_usd:0.02,exceeded:['input_tokens','estimated_cost_usd']}})});
     if(diagnostics)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'답변 중단',details:diagnostics})});
     if(apiError)return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'공급자 오류 '+hostile})});
     return json(answer);
    }
    throw new Error('Unexpected API '+p);
   }
   const file=p==='/'?'index.html':p.slice(1);
   assert.ok(['index.html','app.js','style.css','favicon.svg'].includes(file));
   return route.fulfill({body:fs.readFileSync(path.join(__dirname,file),'utf8').replaceAll('__TOKEN__','mock-token'),contentType:({'index.html':'text/html','app.js':'text/javascript','style.css':'text/css','favicon.svg':'image/svg+xml'})[file]});
  });
  await page.goto(base);await page.locator('.skill-row').waitFor();await page.locator('#recommend-tab').click();
  await page.locator('#ai-status').filter({hasText:'키 설정됨'}).waitFor();
  assert.equal(calls.filter(x=>x.p==='/api/ai/recommend').length,0);
  assert.equal(await page.locator('#ai-docs').isChecked(),false);
  const approve=async()=>{await page.locator('#task-goal').fill('디자인 화면');await page.locator('#ai-preview').click();await page.waitForFunction(()=>!document.querySelector('#ai-submit').disabled);};
  await approve();assert.equal(calls.filter(x=>x.p==='/api/ai/recommend').length,0);
  assert.ok((await page.locator('#ai-output').innerText()).includes(hostile));assert.equal(await page.locator('#ai-output img').count(),0);
  // A changed selection invalidates the exact preview the user reviewed.
  await page.locator('#skills-tab').click();await page.locator('.skill-row .add').click();await page.locator('#recommend-tab').click();assert.equal(await page.locator('#ai-submit').isDisabled(),true);
  await approve();slow=true;
  await page.locator('#ai-submit').evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(()=>!document.querySelector('#ai-cancel').hidden);
  assert.equal(calls.filter(x=>x.p==='/api/ai/recommend').length,1);
  await page.locator('#ai-cancel').click();assert.ok((await page.locator('#ai-output').innerText()).includes('비용'));
  await page.waitForFunction(()=>document.querySelector('#ai-submit').disabled);release();slow=false;
  await approve();await page.locator('#ai-submit').click();await page.locator('.ai-answer').waitFor();
  assert.ok((await page.locator('#ai-budget').innerText()).includes('사전 계산 입력 토큰: 100 / 32,000'));assert.ok((await page.locator('#ai-budget').innerText()).includes('출력 토큰: 50 / 8,192'));
  assert.equal(await page.locator('.ai-answer').innerText(),hostile);assert.equal(await page.locator('#ai-output img').count(),0);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.ok((await page.locator('#ai-output').innerText()).includes('서버 조합 검사: 확인 필요'));
  await page.getByRole('button',{name:'이 AI 조합 담기',exact:true}).click();assert.equal(await page.locator('#basket-items li').count(),1);
  // Changing a request while a response is pending must suppress the old answer.
  await approve();slow=true;await page.locator('#ai-submit').click();await page.waitForFunction(()=>!document.querySelector('#ai-cancel').hidden);
  await page.locator('#task-goal').fill('새 요청');release();slow=false;
  await page.waitForFunction(()=>!document.querySelector('#ai-preview').disabled);assert.equal(await page.locator('.ai-answer').count(),0);
  budgetError=true;await approve();assert.ok((await page.locator('#ai-budget').innerText()).includes('미계산'));await page.locator('#ai-submit').click();await page.locator('#ai-output .error').waitFor();const budgetText=await page.locator('#ai-budget').innerText();assert.ok(budgetText.includes('33,000 / 32,000'));assert.ok(budgetText.includes('입력 토큰 한도 초과'));assert.ok(budgetText.includes('예상 최대 비용 한도 초과'));budgetError=false;
  for(const [reason,label] of [['max_tokens','출력 한도 도달'],['refusal','모델 거부'],['end_turn','정상 생성 종료 (후속 검증 오류)'],['model_context_window_exceeded','모델 컨텍스트 한도 도달'],['stop_sequence','중지 문자열 도달'],['tool_use','도구 사용 요청'],['pause_turn','생성 일시 중단'],[hostile,'알 수 없는 종료 이유'],[null,'알 수 없는 종료 이유']]){
   diagnostics={stop_reason:reason,usage:reason==='max_tokens'?{input_tokens:123,output_tokens:8192}:null,request_id:'req_test',model:'claude-haiku-5-5',counted_input_tokens:120};
   await approve();await page.locator('#ai-submit').click();await page.locator('#ai-output .error').waitFor();const text=await page.locator('#ai-output').innerText();assert.ok(text.includes(label));assert.ok(text.includes(reason||'미제공/확인 불가'));assert.ok(text.includes(reason==='max_tokens'?'실제 출력 토큰: 8192':'실제 출력 토큰: 미제공/확인 불가'));assert.ok(text.includes('사전 계산 입력 토큰: 120'));assert.equal(await page.locator('#ai-output img').count(),0);
  }diagnostics=null;
  apiError=true;await approve();await page.locator('#ai-submit').click();await page.locator('#ai-output .error').waitFor();assert.equal(await page.locator('#ai-output img').count(),0);
  await page.locator('#recommend-submit').click();await page.locator('#recommend-results').filter({hasText:'로컬 추천'}).waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  key=false;await page.reload();await page.locator('#recommend-tab').click();await page.locator('#ai-status').filter({hasText:'키가 설정되지'}).waitFor();await page.locator('#task-goal').fill('디자인');await page.locator('#ai-preview').click();await page.locator('#ai-output h3').waitFor();assert.equal(await page.locator('#ai-submit').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS: mocked AI UI approval, selection invalidation, double click, cancel/stale, safe output/error, unknown compatibility, cart, local distinction, missing key, 390px');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
