(function(){
  "use strict";

  var API_BASE="https://chat-eduardo-gabriel.eduardongabriel354.workers.dev";

  function getToken(){
    return sessionStorage.getItem("admin_token") || "";
  }

  function button(){
    return document.getElementById("notify");
  }

  function setButton(text, disabled){
    var b=button();
    if(!b)return;
    b.textContent=text;
    b.disabled=!!disabled;
  }

  function keyToBytes(value){
    var padding="=".repeat((4-value.length%4)%4);
    var base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
    var raw=atob(base64);
    var bytes=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  }

  async function api(path,options){
    options=options||{};
    options.headers=Object.assign({},options.headers||{},{
      Authorization:"Bearer "+getToken()
    });
    return fetch(API_BASE+path,options);
  }

  async function setupAdminNotifications(){
    var b=button();
    if(!b||!getToken())return false;

    if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window)){
      setButton("🔔 Não suportado",true);
      return false;
    }

    b.onclick=async function(){
      try{
        setButton("🔔 A ativar...",true);

        var permission=await Notification.requestPermission();
        if(permission!=="granted"){
          setButton("🔔 Ativar notificações",false);
          alert("Permita as notificações deste site nas definições do navegador.");
          return;
        }

        var reg=await navigator.serviceWorker.register(
          "/admin-sw.js?v=20261008-04",
          {scope:"/"}
        );
        await navigator.serviceWorker.ready;

        var configResponse=await api("/api/push/config");
        var config=await configResponse.json().catch(function(){return{};});

        if(!configResponse.ok||!config.publicKey){
          throw new Error(config.error||"Não foi possível preparar as notificações.");
        }

        var subscription=await reg.pushManager.getSubscription();

        if(!subscription){
          subscription=await reg.pushManager.subscribe({
            userVisibleOnly:true,
            applicationServerKey:keyToBytes(config.publicKey)
          });
        }

        var saveResponse=await api("/api/push/subscribe",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({subscription:subscription.toJSON()})
        });

        var saved=await saveResponse.json().catch(function(){return{};});

        if(!saveResponse.ok||!saved.saved){
          throw new Error(saved.error||"Não foi possível guardar a assinatura.");
        }

        setButton("🔔 Alertas ativos",false);
        alert("Notificações ativadas. O painel será avisado mesmo quando não estiver aberto.");
      }catch(error){
        console.error("Erro nas notificações:",error);
        setButton("🔔 Ativar notificações",false);
        alert("Não foi possível ativar as notificações. "+String(error&&error.message||error));
      }
    };

    try{
      if(Notification.permission==="granted"){
        var reg=await navigator.serviceWorker.register(
          "/admin-sw.js?v=20261008-05",
          {scope:"/"}
        );
        await navigator.serviceWorker.ready;
        var existing=await reg.pushManager.getSubscription();
        if(existing)setButton("🔔 Alertas ativos",false);
      }
    }catch(error){
      console.warn("Estado das notificações:",error);
    }

    return true;
  }

  window.setupAdminNotifications=setupAdminNotifications;
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",setupAdminNotifications);
  }else{
    setupAdminNotifications();
  }
})();