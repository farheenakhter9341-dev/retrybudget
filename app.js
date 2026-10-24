const S={immediate:["Immediate retry","#d64545"],fixed:["Fixed 5 s","#d98a1f"],exponential:["Exp. backoff","#7b5fc4"],jitter:["Backoff + jitter","#2b8fd6"],retrybudget:["RetryBudget","#0a7f8c"]};
const SP=[["clients","Clients",5,60,1],["rate","Jobs / client / s",0.2,3,0.1],["capacity","Server capacity",20,150,5],["outage_start","Outage start (s)",10,200,5],["outage_len","Outage length (s)",5,120,5],["warmup","Warm-up (s)",1,60,1],["seed","Seed",0,999,1]];
const MET=[["success","Jobs completed (%)"],["amp","Requests per job"],["peak","Peak load (× capacity)"],["p95","p95 latency (s)"],["rec","Recovery time (s)"]];
const $=id=>document.getElementById(id),f=(x,d=1)=>x==null?"never":(+x).toFixed(d);
let D,tick=0,timer,CH={},metric="success";
const plug={id:"cur",beforeDraw(c){if(!D||c.canvas.id=="c5")return;const x=c.scales.x,p=D.params,a=x.getPixelForValue(p.outage_start),b=x.getPixelForValue(p.outage_start+p.outage_len),g=c.ctx;g.save();g.fillStyle="rgba(214,69,69,.08)";g.fillRect(a,c.chartArea.top,b-a,c.chartArea.height);g.restore()},
 afterDraw(c){if(!D||c.canvas.id=="c5")return;const x=c.scales.x.getPixelForValue(tick),g=c.ctx;g.save();g.strokeStyle="#12202e";g.setLineDash([4,3]);g.beginPath();g.moveTo(x,c.chartArea.top);g.lineTo(x,c.chartArea.bottom);g.stroke();g.restore()}};
function controls(p){$("ctl").innerHTML=SP.map(([k,l,a,b,s])=>`<label>${l}<span><b id="v_${k}">${p[k]}</b></span><input type="range" data-p="${k}" min="${a}" max="${b}" step="${s}" value="${p[k]}"></label>`).join("");
 document.querySelectorAll("[data-p]").forEach(e=>{e.oninput=()=>$("v_"+e.dataset.p).textContent=e.value;e.onchange=()=>run()})}
async function run(over={}){const q=new URLSearchParams();document.querySelectorAll("[data-p]").forEach(e=>q.set(e.dataset.p,e.value));for(const k in over)q.set(k,over[k]);
 D=await(await fetch("/api/simulate?"+q)).json();controls(D.params);tick=0;build()}
function build(){const R=D.res,T=D.params.duration,lab=[...Array(T).keys()];$("tk").max=T-1;
 $("sel").innerHTML=Object.keys(S).map(k=>`<option value="${k}" ${k=="retrybudget"?"selected":""}>${S[k][0]}</option>`).join("");
 const opt=(extra={})=>({animation:false,responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},elements:{point:{radius:0}},plugins:{legend:{labels:{boxWidth:10,font:{size:11}}}},scales:{x:{ticks:{maxTicksLimit:10},grid:{display:false}},y:{beginAtZero:true,...extra}}});
 const mk=(id,sets,o)=>{CH[id]&&CH[id].destroy();CH[id]=new Chart($(id),{type:"line",data:{labels:lab,datasets:sets},options:o,plugins:[plug]})};
 const ds=key=>Object.keys(S).map(k=>({label:S[k][0],data:R[k].series[key],borderColor:S[k][1],borderWidth:k=="retrybudget"?2.6:1.3,tension:.2}));
 mk("c1",[...ds("offered"),{label:"Server capacity",data:R.retrybudget.series.cap,borderColor:"#12202e",borderDash:[5,4],borderWidth:1.5}],opt({max:D.params.capacity*4}));
 mk("c2",ds("goodput"),opt());mk("c3",ds("pending"),opt());
 mk("c4",[{label:"Debt: RetryBudget",data:R.retrybudget.series.debt,borderColor:"#0a7f8c",borderWidth:2.4},{label:"Debt: backoff + jitter",data:R.jitter.series.debt,borderColor:"#2b8fd6",borderWidth:1.3},{label:"Tokens available",data:R.retrybudget.series.tokens,borderColor:"#d98a1f",borderWidth:1.5}],opt());
 $("tabs").innerHTML=MET.map(m=>`<button data-m="${m[0]}" class="${m[0]==metric?"on":""}">${m[1]}</button> `).join("");
 $("tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{metric=b.dataset.m;build()});
 const vals=Object.keys(S).map(k=>R[k].summary[metric]??T);CH.c5&&CH.c5.destroy();
 CH.c5=new Chart($("c5"),{type:"bar",data:{labels:Object.values(S).map(s=>s[0]),datasets:[{data:vals,backgroundColor:Object.values(S).map(s=>s[1])}]},options:{animation:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
 kpis();table();findings();topo();render()}
function best(m,dir){const o=Object.keys(S).filter(k=>k!="retrybudget").map(k=>D.res[k].summary[m]??1e9);return dir>0?Math.max(...o):Math.min(...o)}
function kpis(){const s=D.res.retrybudget.summary,K=[["Jobs completed",f(s.success)+"%","success",1,"%"],["Peak server load",f(s.peak,2)+"× cap","peak",-1,"×"],["Requests per job",f(s.amp,2),"amp",-1,"×"],["p95 latency",f(s.p95,0)+" s","p95",-1," s"],["Recovery time",s.rec==null?"never":s.rec+" s","rec",-1," s"]];
 $("kpi").innerHTML=K.map(([l,v,m,d,u])=>{const b=best(m,d);return `<div class="card k"><small>${l}, RetryBudget</small><strong>${v}</strong><small>best conventional: ${b>=1e9?"never":f(b,m=="amp"||m=="peak"?2:m=="success"?1:0)+u}</small></div>`}).join("")}
function table(){const R=D.res,H=[["success","Completed %",1],["expired","Expired",-1],["amp","Req/job",-1],["peak","Peak ×cap",-1],["waste","Wasted load %",-1],["p50","p50 s",-1],["p95","p95 s",-1],["rec","Recovery s",-1],["peak_pending","Peak backlog",-1]];
 const bv=H.map(([k,,d])=>{const v=Object.keys(S).map(s=>R[s].summary[k]??1e9);return d>0?Math.max(...v):Math.min(...v)});
 $("tbl").innerHTML="<tr><th>Strategy</th>"+H.map(h=>`<th>${h[1]}</th>`).join("")+"</tr>"+Object.keys(S).map(s=>`<tr><td><span class="sw" style="background:${S[s][1]}"></span>${S[s][0]}</td>`+H.map(([k],i)=>{const v=R[s].summary[k];return `<td class="${(v??1e9)==bv[i]?"best":""}">${v==null?"never":v}</td>`}).join("")+"</tr>").join("")}
function findings(){const R=D.res,b=R.retrybudget.summary,j=R.jitter.summary,im=R.immediate.summary,L=[];
 L.push(`Immediate retry drove the server to <b>${f(im.peak)}× capacity</b> and completed ${f(im.success)}% of jobs. RetryBudget peaked at <b>${f(b.peak,2)}×</b> and completed ${f(b.success)}%.`);
 L.push(`After the outage, RetryBudget ${b.rec==null?"did not clear its backlog":"cleared its backlog in <b>"+b.rec+" s</b>"}; backoff + jitter ${j.rec==null?"never did":"took "+j.rec+" s"}.`);
 L.push(`Bundling and admission control cut requests per job to <b>${f(b.amp,2)}</b>, against ${f(j.amp,2)} for backoff + jitter.`);
 L.push(`Wasted server work (load that produced no result): RetryBudget ${f(b.waste)}%, immediate retry ${f(im.waste)}%.`);
 L.push(`Trade-off: RetryBudget paces recovery to protect the server, so p95 latency is ${f(b.p95,0)} s against ${f(j.p95,0)} s for backoff + jitter, and jobs older than ${D.params.deadline} s expire (${b.expired} in this run).`);
 $("find").innerHTML=L.map(x=>`<li>${x}</li>`).join("")}
function topo(){const n=D.params.clients,cy=i=>22+i*(316/Math.max(1,n-1)),r=Math.min(9,150/n);let h="";
 for(let i=0;i<n;i++)h+=`<line class="lk" id="l${i}" x1="90" y1="${cy(i)}" x2="400" y2="180"/>`;
 for(let i=0;i<3;i++)h+=`<line class="lk" id="g${i}" x1="490" y1="180" x2="720" y2="${90+i*90}"/>`;
 for(let i=0;i<n;i++)h+=`<circle class="nd" id="c${i}" cx="80" cy="${cy(i)}" r="${r}" onclick="tip(${i})"/>`;
 h+=`<rect class="nd" x="400" y="135" width="90" height="90" rx="12" fill="#e6f2f4"/><text x="445" y="165" text-anchor="middle" font-weight="600">Gateway</text><text id="gw" x="445" y="185" text-anchor="middle"></text><text x="445" y="205" text-anchor="middle" fill="#5b6b7c">admission</text>`;
 for(let i=0;i<3;i++)h+=`<rect class="nd" id="s${i}" x="720" y="${60+i*90}" width="120" height="60" rx="8" onclick="$('inj').click()"/><text id="st${i}" x="780" y="${95+i*90}" text-anchor="middle" style="pointer-events:none"></text>`;
 h+=`<text x="40" y="354" fill="#5b6b7c">Clients (colour = queued jobs)</text><text x="720" y="354" fill="#5b6b7c">Server pool</text>`;$("topo").innerHTML=h}
function tip(i){const k=$("sel").value;$("tip").textContent=`Client ${i}: ${D.res[k].cl[tick][i]} job(s) queued at t=${tick} s (${S[k][0]}).`}
function render(){if(!D)return;const t=tick,R=D.res,k=$("sel").value,s=R[k].series,cl=R[k].cl[t],mx=Math.max(1,...cl),c=s.cap[t],off=s.offered[t];
 $("tk").value=t;$("tl").textContent=`t = ${t} s`;
 cl.forEach((p,i)=>{$("c"+i).setAttribute("fill",p==0?"#6fcf97":`hsl(${45-45*Math.min(1,p/Math.max(4,mx))},85%,52%)`);$("l"+i).setAttribute("class","lk"+(p>0?" hot":""))});
 const ratio=c>0?off/c:(off>0?9:0),col=c==0?"#d64545":ratio>1.05?"#ef9a3c":"#6fcf97";
 for(let i=0;i<3;i++){$("s"+i).setAttribute("fill",col);$("st"+i).textContent=c==0?"DOWN":`${(off/3).toFixed(0)} / ${(c/3).toFixed(0)} u/s`;$("g"+i).setAttribute("class","lk"+(off>0?" flow":"")+(ratio>1.05?" hot":""));$("g"+i).style.strokeWidth=Math.min(7,1+off/D.params.capacity*2)}
 $("gw").textContent=k=="retrybudget"?`tokens ${s.tokens[t].toFixed(0)}`:"pass-through";
 const mp=Math.max(1,...Object.keys(S).map(q=>Math.max(...R[q].series.pending)));
 $("queues").innerHTML=Object.keys(S).map(q=>{const z=R[q].series,p=z.pending[t],rd=z.ready[t];return `<div class="qr"><span><span class="sw" style="background:${S[q][1]}"></span>${S[q][0]}</span><div class="bar"><i style="width:${100*rd/mp}%;background:${S[q][1]}"></i><i style="width:${100*(p-rd)/mp}%;background:${S[q][1]};opacity:.35"></i></div><span>${p}</span></div>`}).join("")+`<small style="color:var(--mut)">Solid = ready to retry, faded = waiting in backoff</small>`;
 const b=R.retrybudget.series;$("bud").innerHTML=`<b>RetryBudget internals</b><br>Debt: ${b.debt[t].toFixed(0)} units · Tokens: ${b.tokens[t].toFixed(1)}<br>Fresh jobs deferred this second: ${b.rej[t]} · Multi-job bundles sent: ${b.bundles[t]}<br>Mode: ${t>0&&b.cap[t-1]==0?"circuit open / probing":b.debt[t]>0?"paced recovery":"normal"}`;
 Object.values(CH).forEach(c=>c.canvas.id!="c5"&&c.draw())}
$("tk").oninput=e=>{tick=+e.target.value;render()};$("sel").onchange=render;
$("play").onclick=()=>{if(timer){clearInterval(timer);timer=null;$("play").textContent="Play";return}$("play").textContent="Pause";
 timer=setInterval(()=>{tick+=+$("spd").value;if(tick>=D.params.duration){tick=D.params.duration-1;render();$("play").click();return}render()},80)};
$("run").onclick=()=>run();$("rnd").onclick=()=>run({seed:Math.floor(Math.random()*999)});
$("inj").onclick=()=>run({outage_start:Math.max(10,Math.min(200,tick))});
run();
