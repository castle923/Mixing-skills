// Real loopback server and synthetic documents; never call an AI provider.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 const basket=path.join(__dirname,'basket.json'),prior=fs.existsSync(basket)?fs.readFileSync(basket):null;
 const child=spawn(process.env.PYTHON||'python',['-X','utf8','workbench.py','serve','--port',String(port)],
   {cwd:__dirname,env:{...process.env,ANTHROPIC_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let browser,childError;child.on('error',error=>childError=error);
 try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
   if(childError)throw childError;
   try{const response=await fetch(base+'/api/catalogue');if(response.ok){ready=true;break;}}catch{}
   await pause(100);
  }
  assert.ok(ready,'Demo server should start');
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   assert.equal(url.origin,base,'No external browser request');
   assert.notEqual(url.pathname,'/api/ai/recommend','No paid generation in UI test');
   return route.continue();
  });
  await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('.skill-row').length===8);
  for(const name of ['free-design-references','frontend-design','ui-color-palettes'])await page.locator(`[data-skill="${name}"] .add`).click();
  assert.equal(await page.locator('#basket-items li').count(),3);
  await page.locator('#goal').fill('반복 일정 대시보드의 화면 설계');await page.locator('#check').click();
  await page.locator('#compatibility .status').waitFor();
  const capture=process.env.CAPTURE_DEMO==='1',images=path.join(__dirname,'docs/images');
  if(capture){fs.mkdirSync(images,{recursive:true});await page.screenshot({path:path.join(images,'workbench-desktop.png'),fullPage:true});}
  await page.locator('#docs-tab').click();await page.locator('#query').fill('반복 일정');
  await page.locator('#search-form').evaluate(form=>form.requestSubmit());
  await page.locator('#documents .document').first().waitFor();
  await page.locator('#recommend-tab').click();await page.locator('#task-goal').fill('반복 일정 설정 화면 만들기');
  await page.locator('#recommend-submit').click();await page.locator('#recommend-results .plan-status').first().waitFor();
  await page.locator('#ai-status').filter({hasText:'키가 설정되지'}).waitFor();
  if(capture)await page.screenshot({path:path.join(images,'recommendation-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#skills-tab').click();
  if(capture)await page.screenshot({path:path.join(images,'workbench-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: public demo inventory, cart, evidence check, document search, local recommendations, missing key, mobile, no AI calls');
 }finally{
  if(browser)await browser.close();child.kill();
  if(prior)fs.writeFileSync(basket,prior);else if(fs.existsSync(basket))fs.unlinkSync(basket);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
