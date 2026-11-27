"use strict";
const $ = id => document.getElementById(id);
const endpoint = "https://loegmgugiwekyfisbbqb.supabase.co/functions/v1/family-calendar";
const token = new URLSearchParams(location.hash.slice(1)).get("invite") || "";
const validToken = /^[0-9a-f]{64}$/.test(token);
const dates = Array.from({length:28},(_,i)=>new Date(Date.UTC(2027,0,18+i)));
const iso = d => d.toISOString().slice(0,10);
const longDate = new Intl.DateTimeFormat("fr-CA",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"});
const shortDate = new Intl.DateTimeFormat("fr-CA",{day:"numeric",month:"short",timeZone:"UTC"});
const hour = n => String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
const range = r => hour(r.arrival)+" – "+hour(r.departure);
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const updatedFormat = new Intl.DateTimeFormat("fr-CA",{hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function markUpdated(){const node=$("lastUpdated");if(node){node.dateTime=new Date().toISOString();node.textContent=updatedFormat.format(new Date());node.parentElement.hidden=false;}}
function showStatus(message,kind="info"){const node=$("status");node.textContent=message;node.dataset.kind=kind;}
let reservations=[], chosenDay="", selectedReservation=null, busy=false, opened=false;
const messages = {invalid_invitation:"Le lien d’invitation est invalide ou expiré.",invalid_input:"Veuillez vérifier les renseignements saisis.",full:"Cette journée est complète. Choisissez une autre date.",invalid_cancel:"Cette réservation a déjà été annulée.",rate_limit:"Trop de demandes. Réessayez dans une minute.",server_error:"Le service est temporairement indisponible. Réessayez.",network:"Impossible de joindre le service. Vérifiez votre connexion.",forbidden_origin:"Ouvrez le lien officiel dans votre navigateur."};
function errorText(err){return messages[err.message] || messages.network}
async function api(action,payload={}){
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,action,payload}),cache:"no-store",referrerPolicy:"no-referrer"});
  let data;try{data=await response.json()}catch{throw new Error("server_error")}
  if(!response.ok||data.error)throw new Error(data.error||"server_error");
  if(!Array.isArray(data.reservations))throw new Error("server_error");
  return data;
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function render(){
  const root=$("calendar");root.replaceChildren();
  for(const day of ["Lun.","Mar.","Mer.","Jeu.","Ven.","Sam.","Dim."])root.append(el("div","weekday",day));
  dates.forEach((date,i)=>{
    const key=iso(date), rows=reservations.filter(r=>r.day===key);
    if(i%7===0)root.append(el("div","mobile-week","Semaine du "+shortDate.format(date)));
    const cell=el("section","day"),head=el("div","dayhead");
    head.append(el("span","",shortDate.format(date)));
    if(rows.length<2){const add=el("button","add","+");add.type="button";add.setAttribute("aria-label","Réserver le "+longDate.format(date));add.addEventListener("click",()=>openBooking(key,date));head.append(add)}
    cell.append(head);
    for(const r of rows){const b=el("button","booking");b.type="button";b.append(el("strong","",r.name),el("span","",range(r)));b.setAttribute("aria-label","Annuler la réservation de "+r.name+", "+range(r));b.addEventListener("click",()=>openCancel(r));cell.append(b)}
    root.append(cell);
  });
}
function lock(message, retry=false){opened=false;reservations=[];$("calendar").replaceChildren();$("content").hidden=true;$("locked").hidden=false;$("lockedText").textContent=message;$("retry").hidden=!retry;for(const d of document.querySelectorAll("dialog[open]"))d.close()}
async function refresh(silent=false){
 if(busy||document.hidden&&silent)return;
 if(!validToken){lock("Vous devez disposer d’un lien d’invitation valide pour accéder au calendrier.");return}
 busy=true;$("refresh").disabled=true;$("refresh").setAttribute("aria-busy","true");
 try{const data=await api("list");reservations=data.reservations;opened=true;$("locked").hidden=true;$("content").hidden=false;render();markUpdated();showStatus("")}
 catch(err){if(err.message==="invalid_invitation"||!opened)lock(errorText(err),err.message!=="invalid_invitation");else showStatus("Actualisation impossible. Les réservations affichées peuvent ne plus être à jour. "+errorText(err),"warning")}
 finally{busy=false;$("refresh").disabled=false;$("refresh").removeAttribute("aria-busy")}
}
function fillTimes(){
 for(let i=480;i<=1260;i+=30){const o=new Option(hour(i),String(i));$("arrival").add(o);$("departure").add(o.cloneNode(true))}
}
function syncDeparture(){const a=Number($("arrival").value);for(const o of $("departure").options)o.disabled=Number(o.value)<=a;if(Number($("departure").value)<=a)$("departure").value=String(Math.min(a+30,1260))}
function openBooking(key,date){chosenDay=key;$("chosenDate").textContent=longDate.format(date);$("name").value="";$("arrival").value="480";$("departure").value="540";syncDeparture();$("bookError").textContent="";$("bookingDialog").showModal();$("name").focus()}
function openCancel(r){selectedReservation=r;$("cancelDetails").textContent=r.name+" · "+longDate.format(new Date(r.day+"T12:00:00Z"))+" · "+range(r);$("cancelError").textContent="";$("cancelDialog").showModal()}
fillTimes();$("arrival").options[$("arrival").options.length-1].disabled=true;$("arrival").addEventListener("change",syncDeparture);
$("bookingForm").addEventListener("submit",async e=>{
 e.preventDefault();if(busy)return;
 const name=$("name").value.trim(),arrival=Number($("arrival").value),departure=Number($("departure").value);
 if(!name||departure<=arrival){$("bookError").textContent=messages.invalid_input;return}
 busy=true;$("bookSubmit").disabled=true;
 try{const data=await api("book",{day:chosenDay,name,arrival,departure});reservations=data.reservations;render();markUpdated();showStatus("");$("bookingDialog").close();$("successDialog").showModal()}
 catch(err){$("bookError").textContent=errorText(err)}
 finally{busy=false;$("bookSubmit").disabled=false}
});
$("cancelForm").addEventListener("submit",async e=>{
 e.preventDefault();if(busy||!selectedReservation)return;
 busy=true;$("cancelSubmit").disabled=true;
 try{const data=await api("cancel",{id:selectedReservation.id});reservations=data.reservations;render();markUpdated();$("cancelDialog").close();showStatus("Réservation annulée.","info")}
 catch(err){$("cancelError").textContent=errorText(err)}
 finally{busy=false;$("cancelSubmit").disabled=false}
});
for(const b of document.querySelectorAll("[data-close]"))b.addEventListener("click",()=>{if(!busy)$(b.dataset.close).close()});
for(const d of document.querySelectorAll("dialog"))d.addEventListener("cancel",e=>{if(busy)e.preventDefault()});
$("refresh").addEventListener("click",()=>refresh());
$("retry").addEventListener("click",()=>refresh());
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&validToken)refresh(true)});
window.addEventListener("pageshow",e=>{if(e.persisted&&validToken)refresh(true)});
setInterval(()=>{if(validToken&&!document.hidden)refresh(true)},REFRESH_INTERVAL_MS);
refresh();
