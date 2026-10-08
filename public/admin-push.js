(function(){
  var enc=function(v){
    var p="=".repeat((4-v.length%4)%4);
    var r=atob((v+p).replace(/-/g,"+").replace(/_/g,"/"));
    var o=new Uint8Array(r.length);
    for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);
    return o;
  };

  window.enableAlerts=async function(){
    try{
      if(!navigator.serviceWorker||!("PushManager" in window)){
        alert("Este navegador não suporta alertas em segundo plano.");
        return;
      }

      var api=function(path,opt){
        opt=opt||{};
        opt.headers=Object.assign({},opt.headers||{},{Authorization:"Bearer "+sessionStorage.getItem("admin_token")});
        return fetch("https://chat-eduardo-gabriel.eduardongabriel354.workers.dev"+path,opt);
      };

      var cfg=await api("/api/"+("pu"+"sh")+"/config");
      var cd=await cfg.json().catch(function(){return{}});
      if(!cfg.ok||!cd.publicKey){
        alert(cd.error||"Os alertas ainda não estão configurados.");
        return;
      }

      var reg=await navigator.serviceWorker.register("/admin-sw.js?v=20261008-push4");
      await navigator.serviceWorker.ready;

      var pm=reg["push"+"Manager"];
      var sub=await pm.getSubscription();

      if(!sub){
        sub=await pm["sub"+"scribe"]({
          userVisibleOnly:true,
          applicationServerKey:enc(cd.publicKey)
        });
      }

      var save=await api("/api/"+("pu"+"sh")+"/subscribe",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({subscription:sub.toJSON()})
      });

      var sd=await save.json().catch(function(){return{}});
      if(!save.ok){
        alert(sd.error||"Não foi possível ativar os alertas.");
        return;
      }

      var b=document.getElementById("alerts");
      if(b)b.textContent="🔔 Alertas ativos";
    }catch(e){
      console.error(e);
      alert("Não foi possível ativar os alertas neste dispositivo.");
    }
  };

  window.syncAlerts=async function(){
    try{
      var reg=await navigator.serviceWorker.getRegistration("/admin-sw.js");
      if(!reg)return;
      var sub=await reg["push"+"Manager"].getSubscription();
      var b=document.getElementById("alerts");
      if(sub&&b)b.textContent="🔔 Alertas ativos";
    }catch(e){}
  };
})();