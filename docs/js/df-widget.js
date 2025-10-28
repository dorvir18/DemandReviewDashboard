/* docs/js/df-widget.js
   Demand Forecast Lab — embeddable widget for Tilda (or any site)
   Requires: uPlot CSS/JS loaded on page before this script.
   Usage: <div id="df-widget"></div> then load this script (see embed snippet).
*/
(function(){
  const WIDGET_ID = "df-widget";

  // ---- CONFIG: поменяй BASE, если хочешь через jsDelivr ----
  // 1) GitHub Pages (быстрее обновляется, но кэш браузера может держаться дольше):
  // const BASE = "https://<user>.github.io/<repo>/data";
  // 2) jsDelivr CDN из репозитория (ставь свой user/repo и ветку/тег):
  // const BASE = "https://cdn.jsdelivr.net/gh/<user>/<repo>@main/docs/data";

  // autodetect по текущему скрипту: если в query есть base=... — используем его
  function getQueryBase() {
    try{
      const s = document.currentScript || (function(){ const arr=document.getElementsByTagName('script'); return arr[arr.length-1]; })();
      const u = new URL(s.src);
      const p = u.searchParams.get('base');
      if (p) return p.replace(/\/+$/,'');
    }catch(e){}
    return null;
  }
  const DEFAULT_BASE = (function(){
    // Попробуем угадать GitHub Pages из того же домена (если скрипт лежит там же)
    try{
      const s = document.currentScript || (function(){ const arr=document.getElementsByTagName('script'); return arr[arr.length-1]; })();
      const u = new URL(s.src);
      if (u.hostname.endsWith(".github.io")) {
        // если скрипт лежит в docs/js, значит данные в ../data
        const guess = u.href.replace(/\/js\/[^\/?#]+(\?.*)?$/,"/data");
        return guess.replace(/\/+$/,'');
      }
    }catch(e){}
    // fallback — попросим явно передать ?base=
    return null;
  })();

  const BASE = getQueryBase() || DEFAULT_BASE;
  if(!BASE){
    console.error("[df-widget] BASE not set. Pass ?base=https://<user>.github.io/<repo>/data or jsDelivr URL.");
  }

  async function fetchJSON(url){
    const r = await fetch(url, {cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status+" for "+url);
    return r.json();
  }
  const ym = iso => new Date(iso).toISOString().slice(0,7);
  const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
  const rmse = arr => Math.sqrt(mean(arr.map(x=>x*x)));

  function h(tag, attrs={}, children=[]){
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") el.className=v; else el.setAttribute(k,v);
    });
    (Array.isArray(children)?children:[children]).forEach(ch=>{
      if (typeof ch==="string") el.appendChild(document.createTextNode(ch));
      else if (ch) el.appendChild(ch);
    });
    return el;
  }

  function buildLayout(root){
    root.innerHTML = "";
    const card = (title) => h("div",{class:"df-card"},[
      h("h3",{},title)
    ]);
    const c1 = card("Ошибки на реальных данных / Errors on real data");

    const row = h("div",{class:"df-row"},[
      h("label",{},["Пара (Client×SKU):"]),
      h("select",{id:"dfPair", class:"df-input"}),
      h("label",{},["Модель:"]),
      h("select",{id:"dfModel", class:"df-input"},[
        h("option",{value:"yhat_naive"},"Naïve"),
        h("option",{value:"yhat_snaive"},"Seasonal Naïve"),
        h("option",{value:"yhat_ma"},"Moving Average"),
        h("option",{value:"yhat_ses"},"Simple Exp. Smoothing"),
        h("option",{value:"yhat_hw"},"Holt–Winters"),
        h("option",{value:"yhat_ets"},"ETS (auto)"),
        h("option",{value:"yhat_arima"},"ARIMA"),
        h("option",{value:"yhat_sarima"},"SARIMA"),
        h("option",{value:"yhat_arimax"},"ARIMAX"),
        h("option",{value:"yhat_croston"},"Croston"),
        h("option",{value:"yhat_sba"},"Croston SBA"),
        h("option",{value:"yhat_tsb"},"TSB"),
      ]),
      h("button",{id:"dfRun", class:"df-btn"},"Рассчитать / Compute"),
      h("span",{id:"dfMsg", class:"df-tag"},"")
    ]);
    c1.appendChild(row);

    const kpi = h("div",{class:"df-kpi"},[
      h("span",{class:"df-pill"},[h("b",{},"MAPE"),": ",h("span",{id:"dfMAPE"},"—")]),
      h("span",{class:"df-pill"},[h("b",{},"MAE"),": ",h("span",{id:"dfMAE"},"—")]),
      h("span",{class:"df-pill"},[h("b",{},"RMSE"),": ",h("span",{id:"dfRMSE"},"—")]),
    ]);
    c1.appendChild(kpi);

    c1.appendChild(h("div",{id:"dfAlert",class:"df-alert", style:"display:none"}));
    c1.appendChild(h("div",{id:"dfChart",class:"df-chart"}));

    const table = h("table",{id:"dfTable", class:"df-table", style:"display:none"},[
      h("thead",{},h("tr",{},[
        h("th",{},"Период / Period"),
        h("th",{},"Факт / Actual"),
        h("th",{},"Прогноз / Forecast"),
        h("th",{},"Абс. ошибка / Abs. error"),
        h("th",{},"% ошибка (MAPE) / % error (MAPE)")
      ])),
      h("tbody",{})
    ]);
    c1.appendChild(table);

    root.appendChild(c1);
    // minimal styles (injected) — под Tilda
    const style = document.createElement("style");
    style.textContent = `
      .df-card{border:1px solid #eae5d4;border-radius:16px;padding:16px;margin:16px 0;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.05)}
      .df-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0}
      .df-input{border:1px solid #e0d7b8;border-radius:10px;padding:8px 10px;min-width:200px}
      .df-btn{border:1px solid #c8a94b;border-radius:10px;padding:8px 12px;background:#fff;cursor:pointer}
      .df-tag{border:1px solid #c8a94b;border-radius:8px;padding:4px 8px;margin-left:6px;display:inline-block}
      .df-kpi{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .df-pill{border:1px dashed #c8a94b;border-radius:12px;padding:6px 10px;font-size:13px}
      .df-alert{border-left:4px solid #c8a94b;background:#fffdf5;padding:10px 12px;border-radius:8px;margin-top:10px}
      .df-table{width:100%;border-collapse:collapse;margin-top:12px;border:1px solid #eceff3}
      .df-table th,.df-table td{border:1px solid #eceff3;padding:8px 10px;text-align:left}
      .df-chart{width:100%;height:360px}
    `;
    document.head.appendChild(style);
  }

  let plot = null;

  async function init(){
    const root = document.getElementById(WIDGET_ID);
    if(!root){ console.warn("[df-widget] container #df-widget not found"); return; }
    buildLayout(root);

    const msgEl = document.getElementById("dfMsg");
    const pairSel = document.getElementById("dfPair");

    // 1) catalog.json
    try{
      const catalog = await fetchJSON(`${BASE}/catalog.json`);
      catalog.forEach(c=>{
        const o = document.createElement("option");
        o.value = c.key;
        o.textContent = `${c.client_id} × ${c.product_id}`;
        pairSel.appendChild(o);
      });
    }catch(e){
      msgEl.textContent = "Нет данных (catalog.json) — запусти Build artifacts";
      return;
    }

    document.getElementById("dfRun").addEventListener("click", runOnce);
  }

  async function runOnce(){
    const key   = document.getElementById("dfPair").value;
    const field = document.getElementById("dfModel").value;
    const msg   = document.getElementById("dfMsg");
    const alert = document.getElementById("dfAlert");
    const table = document.getElementById("dfTable");
    const tbody = table.querySelector("tbody");
    msg.textContent=""; alert.style.display="none"; alert.innerHTML=""; tbody.innerHTML=""; table.style.display="none";

    try{
      const rows = await fetchJSON(`${BASE}/holdout_${key}.json`);
      if(!rows.length){ msg.textContent="Нет данных"; return; }

      const y = rows.map(r => Number(r.y));
      const yhat = rows.map(r => Number(r[field]));
      const abs = y.map((v,i)=>Math.abs(v - yhat[i]));
      const pct = y.map((v,i)=> v===0 ? null : Math.abs((v - yhat[i]) / v));

      // KPIs
      const maeV  = mean(abs);
      const rmseV = rmse(abs);
      const valid = pct.filter(x=>x!==null);
      const mapeV = valid.length ? 100*mean(valid) : null;

      document.getElementById("dfMAE").textContent  = maeV.toFixed(3);
      document.getElementById("dfRMSE").textContent = rmseV.toFixed(3);
      document.getElementById("dfMAPE").textContent = (mapeV===null ? "— (нули в фактах)" : (mapeV.toFixed(2)+"%"));

      if(valid.length !== pct.length){
        alert.style.display="block";
        alert.innerHTML = "Есть нули в фактах — эти периоды исключены из MAPE.";
      }

      // Table
      rows.forEach((r,i)=>{
        const tr = document.createElement("tr");
        const td = (t)=>{ const d=document.createElement("td"); d.textContent=t; return d; };
        tr.appendChild(td(ym(r.ds)));
        tr.appendChild(td(String(y[i])));
        tr.appendChild(td(String(yhat[i])));
        tr.appendChild(td(abs[i].toFixed(3)));
        tr.appendChild(td(pct[i]===null ? "— (факт=0)" : (100*pct[i]).toFixed(2)+"%"));
        tbody.appendChild(tr);
      });
      table.style.display="table";
      msg.textContent="OK";

      // Chart (uPlot)
      try{
        const x = rows.map(r => new Date(r.ds).getTime()/1000);
        const data = [x, y, yhat];
        const opts = {
          title: "Holdout: Actual vs Forecast",
          width: document.getElementById("dfChart").clientWidth,
          height: 360,
          axes: [
            { values:(u,ticks)=>ticks.map(t=>new Date(t*1000).toISOString().slice(0,7)) },
            {}
          ],
          series: [
            { label: "Date" },
            { label: "Actual" },
            { label: "Forecast" }
          ]
        };
        if (plot) plot.destroy();
        plot = new uPlot(opts, data, document.getElementById("dfChart"));
      }catch(e){ console.warn("uPlot error", e); }

    }catch(err){
      msg.textContent = "Не удалось загрузить holdout ("+err.message+")";
    }
  }

  // init when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
