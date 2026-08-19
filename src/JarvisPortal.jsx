import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, CalendarDays, Link2, Mail, Mic, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "./lib/supabase";

const GOOGLE_SCOPES = [
  "openid","email","profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/contacts.readonly"
].join(" ");

const S = {
  page:{minHeight:"100vh",background:"#07111f",color:"#e8f6ff",fontFamily:"Inter,ui-sans-serif,system-ui,sans-serif",padding:"24px"},
  shell:{maxWidth:1180,margin:"0 auto"},
  top:{display:"flex",alignItems:"center",gap:14,marginBottom:20},
  orb:{width:58,height:58,borderRadius:"50%",border:"1px solid rgba(103,232,249,.45)",background:"radial-gradient(circle at 35% 30%,#67e8f9 0,#0891b2 28%,#0f172a 72%)",boxShadow:"0 0 36px rgba(34,211,238,.35)",display:"grid",placeItems:"center",color:"white"},
  card:{background:"rgba(15,23,42,.78)",border:"1px solid rgba(148,163,184,.16)",borderRadius:18,padding:18,boxShadow:"0 18px 50px rgba(0,0,0,.22)"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14},
  btn:{border:"1px solid rgba(103,232,249,.25)",background:"rgba(8,145,178,.12)",color:"#cffafe",borderRadius:12,padding:"10px 14px",fontWeight:700,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8},
  input:{width:"100%",border:"1px solid rgba(148,163,184,.2)",background:"#0b1627",color:"white",borderRadius:12,padding:"12px 14px",outline:"none"},
  msg:{padding:"11px 13px",borderRadius:12,marginBottom:8,lineHeight:1.45},
};

function pill(live){return <span style={{fontSize:12,fontWeight:800,color:live?"#86efac":"#fbbf24"}}>● {live?"LIVE":"SETUP"}</span>}

export default function JarvisPortal(){
  const [session,setSession]=useState(null);
  const [business,setBusiness]=useState(null);
  const [inventory,setInventory]=useState([]);
  const [messages,setMessages]=useState([{role:"assistant",content:"JARVIS online. Legacy CRM remains isolated and untouched."}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [googleToken,setGoogleToken]=useState(()=>sessionStorage.getItem("jarvis_google_token")||"");
  const [googleProfile,setGoogleProfile]=useState(null);
  const [integrationStatus,setIntegrationStatus]=useState({});
  const recRef=useRef(null);
  const googleClientId=import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session||null));},[]);
  useEffect(()=>{if(!session?.user?.id)return;(async()=>{const b=await supabase.from("legacy_businesses").select("*").eq("owner_id",session.user.id).maybeSingle();setBusiness(b.data||null);if(b.data){const i=await supabase.from("legacy_inventory").select("*").eq("business_id",b.data.id).order("created_at",{ascending:false});setInventory(i.data||[]);}})();},[session?.user?.id]);
  useEffect(()=>{fetch("/api/integrations/status").then(r=>r.json()).then(setIntegrationStatus).catch(()=>{});},[]);
  useEffect(()=>{if(!googleToken)return;fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:`Bearer ${googleToken}`}}).then(r=>r.ok?r.json():Promise.reject()).then(setGoogleProfile).catch(()=>{setGoogleToken("");sessionStorage.removeItem("jarvis_google_token")});},[googleToken]);

  const summary=useMemo(()=>({styles:inventory.length,units:inventory.reduce((s,x)=>s+Number(x.qty||0),0),low:inventory.filter(x=>Number(x.qty||0)<=Number(x.low_stock_threshold??1)).length}),[inventory]);

  async function connectGoogle(){
    if(!googleClientId){alert("VITE_GOOGLE_CLIENT_ID is not configured yet.");return;}
    if(!window.google?.accounts?.oauth2){await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
    const client=window.google.accounts.oauth2.initTokenClient({client_id:googleClientId,scope:GOOGLE_SCOPES,callback:(resp)=>{if(resp.access_token){setGoogleToken(resp.access_token);sessionStorage.setItem("jarvis_google_token",resp.access_token);}}});
    client.requestAccessToken({prompt:"consent"});
  }

  async function send(text=input){
    const clean=String(text||"").trim();if(!clean||busy)return;setInput("");setBusy(true);setMessages(m=>[...m,{role:"user",content:clean}]);
    try{
      const context={business:business?{name:business.name||"Legacy Jewelry Co."}:null,inventory:inventory.slice(0,120),summary,googleConnected:!!googleToken};
      const r=await fetch("/api/jarvis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:clean,history:messages.slice(-12),context})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||"JARVIS unavailable");
      const reply=data.reply||"I'm online.";setMessages(m=>[...m,{role:"assistant",content:reply}]);
      if("speechSynthesis" in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(reply);u.rate=.98;u.pitch=.92;window.speechSynthesis.speak(u);}
    }catch(e){setMessages(m=>[...m,{role:"assistant",content:`I couldn't complete that: ${e.message}`}]);}finally{setBusy(false);}
  }

  function voice(){
    if(listening){recRef.current?.stop?.();setListening(false);return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("Speech recognition is not supported in this browser.");return;}
    const rec=new SR();rec.lang="en-US";rec.interimResults=false;rec.continuous=false;recRef.current=rec;
    const timeout=setTimeout(()=>{try{rec.stop()}catch{}},10000);
    rec.onstart=()=>setListening(true);
    rec.onresult=e=>{const t=e.results?.[0]?.[0]?.transcript||"";if(t)send(t);};
    rec.onerror=()=>setListening(false);
    rec.onend=()=>{clearTimeout(timeout);setListening(false);};
    rec.start();
  }

  if(!session)return <div style={S.page}><div style={S.shell}><div style={S.card}><h2>Sign in to Legacy CRM first</h2><p style={{color:"#94a3b8"}}>JARVIS uses the same authenticated Legacy account.</p><button style={S.btn} onClick={()=>location.href="/"}>Return to CRM</button></div></div></div>;

  return <div style={S.page}><div style={S.shell}>
    <div style={S.top}><button style={S.orb} onClick={voice} title="Talk to JARVIS"><BrainCircuit size={28}/></button><div style={{flex:1}}><div style={{fontSize:12,letterSpacing:2,color:"#67e8f9",fontWeight:900}}>J.A.R.V.I.S.</div><h1 style={{margin:"2px 0 0",fontSize:28}}>Legacy Intelligence</h1><div style={{color:listening?"#67e8f9":"#94a3b8",fontSize:13}}>{listening?"LISTENING…":"CRM-safe isolated assistant"}</div></div><button style={S.btn} onClick={()=>{location.href="/";}}><X size={16}/> Back to CRM</button></div>

    <div style={{...S.grid,marginBottom:14}}>
      <div style={S.card}><b>Legacy CRM</b><div style={{marginTop:8}}>{pill(!!business)}</div><p style={{color:"#94a3b8"}}>{summary.styles} inventory styles · {summary.units} units · {summary.low} low stock</p></div>
      <div style={S.card}><b>OpenAI</b><div style={{marginTop:8}}>{pill(integrationStatus.openai)}</div><p style={{color:"#94a3b8"}}>Server-side JARVIS reasoning via /api/jarvis.</p></div>
      <div style={S.card}><b>Google</b><div style={{marginTop:8}}>{pill(!!googleToken)}</div><p style={{color:"#94a3b8"}}>{googleProfile?.email||"Calendar, Gmail, Contacts"}</p><button style={S.btn} onClick={connectGoogle}><Link2 size={15}/>{googleToken?"Reconnect":"Connect Google"}</button></div>
      <div style={S.card}><b>External adapters</b><div style={{marginTop:8}}>{pill(!!(integrationStatus.shopify||integrationStatus.ebay||integrationStatus.homeAssistant))}</div><p style={{color:"#94a3b8"}}>Shopify {integrationStatus.shopify?"✓":"—"} · eBay {integrationStatus.ebay?"✓":"—"} · Home Assistant {integrationStatus.homeAssistant?"✓":"—"}</p></div>
    </div>

    <div style={{...S.grid,gridTemplateColumns:"minmax(0,1.6fr) minmax(260px,.8fr)"}}>
      <div style={S.card}><div style={{height:430,overflowY:"auto",paddingRight:4}}>{messages.map((m,i)=><div key={i} style={{...S.msg,background:m.role==="user"?"rgba(8,145,178,.18)":"rgba(30,41,59,.9)",marginLeft:m.role==="user"?"12%":0}}><b style={{fontSize:11,color:m.role==="user"?"#67e8f9":"#cbd5e1"}}>{m.role==="user"?"YOU":"JARVIS"}</b><div>{m.content}</div></div>)}</div><div style={{display:"flex",gap:8,marginTop:12}}><input style={S.input} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask JARVIS about Legacy CRM, inventory, business, or integrations…"/><button style={S.btn} onClick={()=>send()} disabled={busy}>{busy?<RefreshCw size={16}/>:<Send size={16}/>}</button><button style={S.btn} onClick={voice}><Mic size={16}/></button></div></div>
      <div style={S.card}><h3 style={{marginTop:0}}>Connected tools</h3><p style={{color:"#94a3b8",lineHeight:1.6}}><ShieldCheck size={15} style={{verticalAlign:"middle"}}/> Legacy data is read through your signed-in Supabase account. JARVIS runs separately from the CRM UI, so CRM dialogs and buttons remain native.</p><div style={{display:"grid",gap:8,marginTop:14}}><button style={S.btn} onClick={()=>send("Give me a concise inventory and low-stock briefing.")}><RefreshCw size={15}/> Inventory briefing</button><button style={S.btn} onClick={()=>send("Analyze my current Legacy Jewelry business and tell me what needs attention first.")}><BrainCircuit size={15}/> Business analysis</button><button style={S.btn} onClick={connectGoogle}><CalendarDays size={15}/> Google Calendar</button><button style={S.btn} onClick={connectGoogle}><Mail size={15}/> Gmail + Contacts</button></div></div>
    </div>
  </div></div>;
}
